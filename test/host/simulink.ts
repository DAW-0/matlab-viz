import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { validateGraph, type DependencyGraph } from "../../src/model";
import { DebugWebview } from "./debugWebview";

/** Exercise generated Simulink fixtures through the real editor and runner.
 * No simulation or compilation is requested. Fixture source bytes are checked
 * before/after; profiles and configuration are owned by the isolated launcher. */
export async function run(): Promise<void> {
  const artifacts = process.env.MATLAB_VIZ_TEST_ARTIFACTS!, profile = process.env.MATLAB_VIZ_HOST_PROFILE!;
  const manifest = process.env.MATLAB_VIZ_SIMULINK_FIXTURE;
  assert.ok(manifest, "Set MATLAB_VIZ_SIMULINK_FIXTURE to a generated fixture.json");
  const fixture = JSON.parse(await fs.readFile(manifest, "utf8")) as { root: string; models: string; support: string; files: string[] };
  const original = await Promise.all(fixture.files.map((file) => fs.readFile(file)));
  const debug = new DebugWebview(process.env.MATLAB_VIZ_DEBUG_ENDPOINT!);
  const config = vscode.workspace.getConfiguration("matlabViz");
  const observations: string[] = [];
  const log = (value: string) => { observations.push(value); console.log(value); };
  async function cached(): Promise<DependencyGraph> {
    const storage = path.join(profile, "User", "workspaceStorage");
    for (const entry of await fs.readdir(storage, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try { return validateGraph(JSON.parse(await fs.readFile(path.join(storage, entry.name, "daw-0.matlab-viz", "last-graph.json"), "utf8"))); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    throw new Error("Simulink graph cache missing");
  }
  async function analyze(root?: string) {
    await vscode.commands.executeCommand(root ? "matlabViz.analyzeSelection" : "matlabViz.refresh", ...(root ? [vscode.Uri.file(root)] : []));
    await vscode.commands.executeCommand("matlabViz.showGraph");
    const graph = await cached(), view = await debug.graph();
    const until = Date.now() + 10_000;
    const expected = `${graph.nodes.length}/${graph.nodes.length} files · ${graph.edges.length}/${graph.edges.length} dependencies`;
    while (!(await view.evaluate(`return document.getElementById('summary').textContent.startsWith(${JSON.stringify(expected)});`))) {
      if (Date.now() > until) throw new Error(`Graph UI did not display ${expected}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { graph, view };
  }
  try {
    for (const [name, value] of Object.entries({ matlabExecutable: process.env.MATLAB_VIZ_TEST_EXECUTABLE,
      analysisMode: "auto", watchFiles: false, includeExternal: false, includeIsolated: true,
      "project.reanalyzeAll": true, "project.analyzeReferences": false, "project.analyzeAddOns": false,
      "project.analyzeModelParameters": false, "folder.useWorkspacePath": false })) {
      assert.notEqual(value, undefined, `Missing setting ${name}`); await config.update(name, value, vscode.ConfigurationTarget.Global);
    }
    await vscode.commands.executeCommand("workbench.action.closeSidebar");
    await vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
    const basic = await analyze(fixture.root);
    assert.equal(basic.graph.metadata.mode, "project"); assert.equal(basic.graph.nodes.length, 8); assert.equal(basic.graph.edges.length, 5);
    assert.equal(basic.graph.problems.length, 0);
    assert.equal(basic.graph.nodes.find((node) => node.extension === ".sldd")?.kind, "Simulink data dictionary");
    await config.update("project.analyzeModelParameters", true, vscode.ConfigurationTarget.Global);
    const parameters = await analyze(); assert.equal(parameters.graph.edges.length, 6);
    assert.ok(parameters.graph.edges.some((edge) => edge.target.endsWith("/matlabVizSimParameter.m")));
    await fs.writeFile(path.join(artifacts, "simulink-project.json"), JSON.stringify(parameters.graph, null, 2));
    log("Automatic Project detection: eight files/five links; enabling block-parameter analysis and Refresh adds exactly the parameter function link (six links)");

    await config.update("analysisMode", "folder", vscode.ConfigurationTarget.Global);
    const folder = await analyze(fixture.root);
    assert.equal(folder.graph.nodes.length, 7); assert.equal(folder.graph.edges.length, 2); assert.equal(folder.graph.problems.length, 4);
    assert.ok(folder.graph.edges.every((edge) => edge.kind === "saved model reference" && edge.details?.includes("Simulink.MDLInfo")));
    await folder.view.evaluate("document.getElementById('problems').click();return true;");
    assert.match(await folder.view.evaluate("return document.getElementById('details').textContent;"), /Partial Simulink folder analysis/);
    await fs.writeFile(path.join(artifacts, "simulink-folder.json"), JSON.stringify(folder.graph, null, 2));
    log("Folder command: seven files/two saved model-reference links and four visible partial-analysis warnings; library/callback/dictionary/parameter edges are not invented");

    await config.update("folder.additionalSearchRoots", [fixture.support], vscode.ConfigurationTarget.Global);
    await config.update("includeExternal", true, vscode.ConfigurationTarget.Global);
    const external = await analyze(fixture.models);
    assert.equal(external.graph.nodes.length, 3); assert.equal(external.graph.edges.length, 2);
    assert.equal(external.graph.nodes.filter((node) => node.external).length, 1);
    await config.update("includeExternal", false, vscode.ConfigurationTarget.Global);
    const internal = await analyze(); assert.equal(internal.graph.nodes.length, 2); assert.equal(internal.graph.edges.length, 0);
    assert.equal(internal.graph.problems.length, 2);
    log("Selected-model folder lookup resolves the external child (three files/two links); external exclusion returns two files/zero links without losing the scope warnings");
    await config.update("includeIsolated", false, vscode.ConfigurationTarget.Global);
    const connected = await analyze(fixture.root); assert.equal(connected.graph.nodes.length, 3); assert.equal(connected.graph.edges.length, 2);
    assert.equal(connected.graph.problems.length, 4);
    for (let index = 0; index < fixture.files.length; index++) assert.deepEqual(await fs.readFile(fixture.files[index]!), original[index]);
    log("Connected-only filtering retains the two model-reference edges and all scope warnings; every inspected model, dictionary, and MATLAB source is byte-for-byte unchanged");
    const workbench = await debug.workbench(); const shot = await workbench.request("Page.captureScreenshot", { format: "png" });
    await fs.writeFile(path.join(artifacts, "simulink-editor.png"), Buffer.from(shot.data, "base64"));
    await fs.writeFile(path.join(artifacts, "simulink-result.json"), JSON.stringify({ passed: true, observations }, null, 2));
  } catch (error) {
    log(error instanceof Error ? error.stack ?? error.message : String(error));
    try { const workbench = await debug.workbench(); const shot = await workbench.request("Page.captureScreenshot", { format: "png" });
      await fs.writeFile(path.join(artifacts, "simulink-failure.png"), Buffer.from(shot.data, "base64")); } catch { /* Preserve original error. */ }
    await fs.writeFile(path.join(artifacts, "simulink-result.json"), JSON.stringify({ passed: false, observations }, null, 2));
    throw error;
  } finally { debug.close(); await fs.writeFile(path.join(artifacts, "simulink.log"), observations.join("\n")); }
}
