import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { validateGraph, type DependencyGraph } from "../../src/model";
import { DebugWebview, snapshotBody } from "./debugWebview";

/** Actual commands, MATLAB failures, webview state, and settings navigation.
 * Everything is confined to the launcher's isolated profile and existing
 * read-only test fixtures; no user source/settings are changed. */
export async function run(): Promise<void> {
  const artifacts = process.env.MATLAB_VIZ_TEST_ARTIFACTS!, profile = process.env.MATLAB_VIZ_HOST_PROFILE!;
  const root = path.join(process.env.MATLAB_VIZ_HOST_FIXTURES!, "project");
  const debug = new DebugWebview(process.env.MATLAB_VIZ_DEBUG_ENDPOINT!);
  const observations: string[] = [];
  const log = (message: string) => { observations.push(message); console.log(message); };
  const config = vscode.workspace.getConfiguration("matlabViz");
  const pause = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));
  async function cached(): Promise<DependencyGraph> {
    const storage = path.join(profile, "User", "workspaceStorage");
    for (const item of await fs.readdir(storage, { withFileTypes: true })) {
      if (!item.isDirectory()) continue;
      try { return validateGraph(JSON.parse(await fs.readFile(path.join(storage, item.name, "daw-0.matlab-viz", "last-graph.json"), "utf8"))); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    throw new Error("Graph cache missing");
  }
  async function waitFor(check: () => Promise<boolean>) {
    const until = Date.now() + 90_000;
    while (Date.now() < until) { if (await check()) return; await pause(); }
    throw new Error("Clarity test condition timed out");
  }
  async function select(file: string, word: string) {
    const document = await vscode.workspace.openTextDocument(path.join(root, file));
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const position = document.positionAt(document.getText().indexOf(word));
    editor.selection = new vscode.Selection(position, position);
    return document;
  }
  try {
    for (const [name, value] of Object.entries({ watchFiles: false, analysisMode: "folder", maximumFiles: 5000, includeExternal: false,
      "symbols.maximumDepth": 1, matlabExecutable: process.env.MATLAB_VIZ_TEST_EXECUTABLE })) {
      assert.notEqual(value, undefined, `Missing test setting ${name}`);
      await config.update(name, value, vscode.ConfigurationTarget.Global);
    }
    await vscode.commands.executeCommand("workbench.action.closeSidebar");
    await vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
    await vscode.commands.executeCommand("matlabViz.analyzeSelection", vscode.Uri.file(root));
    await vscode.commands.executeCommand("matlabViz.showGraph");
    const original = await cached(), view = await debug.graph();
    assert.equal(original.metadata.analysisIncludeExternal, false);
    await view.evaluate(`const node=document.querySelector('g.node');node.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      const svg=document.getElementById('graph');svg.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,clientX:200,clientY:200,cancelable:true}));return true;`);
    await pause(); const before = await view.evaluate(snapshotBody);
    await config.update("maximumFiles", 1, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand("matlabViz.refresh");
    // Command completion releases the analysis lock before asynchronous
    // webview messages are painted. Wait for the UI condition, not a delay.
    await waitFor(async () => view.evaluate("return !document.getElementById('analysis-status').hidden;"));
    assert.deepEqual(await cached(), original, "Failure changed the graph cache");
    const failed = await view.evaluate(snapshotBody);
    assert.equal(failed.analysisBanner.hidden, false); assert.match(failed.analysisBanner.text, /Showing the previous graph/);
    assert.match(failed.analysisBanner.text, /MaximumFiles|exceed/i);
    assert.deepEqual({ ...failed, analysisBanner: before.analysisBanner }, before, "Failure altered graph view state");
    await vscode.commands.executeCommand("matlabViz.showGraph");
    assert.equal(await view.evaluate("return document.getElementById('analysis-status').hidden;"), false);
    log("Real MATLAB file-limit failure keeps the cache/selection/custom viewport and displays a persistent previous-graph notice");

    await config.update("maximumFiles", 5000, vscode.ConfigurationTarget.Global);
    await config.update("includeExternal", true, vscode.ConfigurationTarget.Global);
    assert.match(await view.evaluate("return document.getElementById('external-policy').textContent;"), /disabled/);
    await view.evaluate("document.getElementById('status-refresh').click();return true;");
    await waitFor(async () => (await cached()).metadata.generatedAt !== original.metadata.generatedAt);
    await waitFor(async () => view.evaluate("return document.getElementById('analysis-status').hidden;"));
    assert.equal((await cached()).metadata.analysisIncludeExternal, true);
    assert.match(await view.evaluate("return document.getElementById('external-policy').textContent;"), /enabled/);
    const generatedAt = (await cached()).metadata.generatedAt;
    await view.evaluate("const control=document.getElementById('external');control.checked=false;control.dispatchEvent(new Event('change'));return true;");
    await pause(); assert.equal((await cached()).metadata.generatedAt, generatedAt);
    assert.match(await view.evaluate("return document.getElementById('external-policy').textContent;"), /enabled/);
    await view.evaluate("document.getElementById('external-settings').click();return true;");
    const workbench = await debug.workbench();
    await waitFor(async () => workbench.evaluate("return /include external/i.test(document.body.textContent);"));
    assert.equal((await cached()).metadata.generatedAt, generatedAt);
    await vscode.commands.executeCommand("matlabViz.showGraph");
    log("Banner Refresh succeeds without dismissing the error; external policy changes only after analysis, visibility does not rerun it, and the settings button opens Include External");

    await select("entry.m", "entry"); await vscode.commands.executeCommand("matlabViz.showCallees");
    await vscode.commands.executeCommand("matlabViz.showGraph"); const calls = await debug.graph();
    await calls.evaluate("document.querySelector('g.node').dispatchEvent(new MouseEvent('click',{bubbles:true}));return true;");
    assert.match(await calls.evaluate("return document.getElementById('details').textContent;"), /callees?/);
    await calls.evaluate("document.querySelector('.edge').dispatchEvent(new MouseEvent('click',{bubbles:true}));return true;");
    assert.equal(await calls.evaluate("return document.querySelector('#details h2').textContent;"), "Function call");
    assert.equal(await calls.evaluate("return document.getElementById('direction').options[1].textContent;"), "Callees");
    await select("middle.m", "middle"); await vscode.commands.executeCommand("matlabViz.traceSymbolReferences");
    await vscode.commands.executeCommand("matlabViz.showGraph"); const references = await debug.graph();
    await references.evaluate("document.querySelector('.edge').dispatchEvent(new MouseEvent('click',{bubbles:true}));return true;");
    assert.equal(await references.evaluate("return document.querySelector('#details h2').textContent;"), "Symbol reference");
    assert.match(await references.evaluate("return document.getElementById('summary').textContent;"), /reference links/);
    assert.equal(await references.evaluate("return document.getElementById('direction').options[2].textContent;"), "Referencing containers");
    log("Actual call/reference commands show Function call/Symbol reference headings, caller/callee traversal, and grouped-reference terminology");
    const exported = await cached(); assert.ok(!("analysisStatus" in exported.metadata));
    await fs.writeFile(path.join(artifacts, "reference-result.json"), JSON.stringify(exported, null, 2));
    await fs.writeFile(path.join(artifacts, "clarity-result.json"), JSON.stringify({ passed: true, observations }, null, 2));
  } catch (error) {
    log(error instanceof Error ? error.stack ?? error.message : String(error));
    try { const workbench = await debug.workbench(); const shot = await workbench.request("Page.captureScreenshot", { format: "png" });
      await fs.writeFile(path.join(artifacts, "clarity-failure.png"), Buffer.from(shot.data, "base64")); } catch { /* Preserve original failure. */ }
    await fs.writeFile(path.join(artifacts, "clarity-result.json"), JSON.stringify({ passed: false, observations }, null, 2));
    throw error;
  } finally { debug.close(); await fs.writeFile(path.join(artifacts, "clarity.log"), observations.join("\n")); }
}
