import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { buildImpactReport } from "../../src/core/entryPointReport";
import { validateGraph } from "../../src/model";
import { entryPointFixture } from "../support/entryPointFixture";
import { DebugWebview, snapshotBody } from "./debugWebview";

/** Real editor, private profile, original saved graph only. No MATLAB/source execution. */
export async function run(): Promise<void> {
  const artifacts = process.env.MATLAB_VIZ_TEST_ARTIFACTS!, profile = process.env.MATLAB_VIZ_HOST_PROFILE!;
  const stage = process.env.MATLAB_VIZ_RESTORE_STAGE!, observations: string[] = [];
  const debug = new DebugWebview(process.env.MATLAB_VIZ_DEBUG_ENDPOINT!);
  const pause = (ms = 150) => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(check: () => Promise<boolean>) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) { if (await check()) return; await pause(); }
    throw new Error("Native impact-report condition timed out");
  }
  try {
    if (stage === "impact-reports") {
      const sourcePath = process.env.MATLAB_VIZ_TEST_GRAPH;
      const sourceBytes = sourcePath ? await fs.readFile(sourcePath, "utf8") : undefined;
      // Match the host cache loader's canonical metadata (including counts)
      // before comparing complete exports, rather than assuming raw fixtures
      // are byte-identical to a validated graph document.
      const graph = validateGraph(sourceBytes ? JSON.parse(sourceBytes) : entryPointFixture(vscode.workspace.workspaceFolders![0]!.uri.fsPath));
      // Saved-repository smoke tests choose a well-connected original file
      // without relying on WEST-specific names or executing anything it uses.
      const incoming = new Map<string, number>();
      for (const edge of graph.edges) incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
      const seed = sourcePath ? graph.nodes.filter(node => !node.unresolved)
        .sort((a, b) => (incoming.get(b.id) ?? 0) - (incoming.get(a.id) ?? 0))[0]! : graph.nodes.find(node => node.id === "n4")!;
      const report = buildImpactReport(graph, seed.id);
      const target = report.nodes.reduce((best, item) => item.depth > best.depth ? item : best, report.nodes[0]!);
      const storage = path.join(profile, "User", "workspaceStorage");
      const workspace = (await fs.readdir(storage, { withFileTypes: true })).find(item => item.isDirectory() && /^[a-f\d]{32}$/i.test(item.name)); assert.ok(workspace);
      const cache = path.join(storage, workspace.name, "daw-0.matlab-viz", "last-graph.json"), original = JSON.stringify(graph);
      await fs.mkdir(path.dirname(cache), { recursive: true }); await fs.writeFile(cache, original);
      await vscode.workspace.getConfiguration("files").update("simpleDialog.enable", true, vscode.ConfigurationTarget.Global);
      await vscode.commands.executeCommand("workbench.action.closeSidebar"); await vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
      await vscode.commands.executeCommand("matlabViz.showGraph"); const view = await debug.graph(), workbench = await debug.workbench();
      const select = (id: string) => view.evaluate(`[...document.querySelectorAll('g.node')].find(node=>node.dataset.nodeId===${JSON.stringify(id)}).dispatchEvent(new MouseEvent('click',{bubbles:true}));return true;`);
      const click = (label: string) => view.evaluate(`[...document.querySelectorAll('#details button')].find(button=>button.textContent===${JSON.stringify(label)}).click();return true;`);
      const input = async (value: string) => {
        // Let the editor finish asynchronously setting its default save name
        // before committing our path; otherwise dialog timing can overwrite it.
        await waitFor(async () => {
          const found = await workbench.evaluate(`const input=[...document.querySelectorAll('.quick-input-widget input')].find(item=>item.getBoundingClientRect().width>0);if(!input)return false;input.focus();input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
          if (!found) return false;
          await pause(250);
          return workbench.evaluate(`return [...document.querySelectorAll('.quick-input-widget input')].some(item=>item.getBoundingClientRect().width>0&&item.value===${JSON.stringify(value)});`);
        });
        await workbench.request("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
        await workbench.request("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }); await pause(200);
      };
      await select(seed.id); await view.evaluate("document.getElementById('impact-report').click();return true;");
      await waitFor(async () => view.evaluate("return document.getElementById('details').textContent.includes('File impact report');"));
      assert.match(await view.evaluate("return document.getElementById('details').textContent;"), new RegExp(`${report.counts.directDependents} direct dependents.*${report.counts.totalDependents} total dependents`));
      const previous = await view.evaluate(snapshotBody);
      await fs.writeFile(path.join(artifacts, "impact-previous-view.json"), JSON.stringify(previous));
      for (const format of ["json", "md"]) {
        const destination = path.join(artifacts, `impact-ui-report.${format}`);
        await click(`Export report (${format === "json" ? "JSON" : "Markdown"})`); await input(destination);
        await waitFor(async () => { try { return (await fs.stat(destination)).size > 0; } catch { return false; } });
        const text = await fs.readFile(destination, "utf8");
        if (format === "json") assert.deepEqual(JSON.parse(text), report);
        else { assert.match(text, /file impact report/); assert.match(text, /All analysis notices \(nothing suppressed\)/); }
      }
      for (let repeat = 0; repeat < 3; repeat++) {
        await click("Show report scope in graph");
        await waitFor(async () => view.evaluate(`return document.querySelectorAll('g.node').length===${report.nodes.length}&&!document.getElementById('report-scope-status').hidden;`));
        assert.equal(await view.evaluate("return document.querySelectorAll('.edge').length;"), report.edges.length);
        await view.evaluate("document.getElementById('return-report-view').click();return true;"); await pause();
        assert.deepEqual(await view.evaluate(snapshotBody), previous, "Impact scope Return changed original view");
      }
      await click("Show report scope in graph");
      const points = await view.evaluate("return [...document.querySelectorAll('g.node')].map(node=>[node.dataset.nodeId,node.getAttribute('transform')]);");
      await select(target.node.id); await click("Show impact path");
      await waitFor(async () => view.evaluate(`return document.querySelectorAll('.edge.dependency-path').length===${target.depth}&&document.getElementById('details').textContent.includes('Impact path');`));
      assert.match(await view.evaluate("return document.getElementById('details').textContent;"), /Original arrows are not reversed/);
      await click("Fit impact path");
      assert.deepEqual(await view.evaluate("return [...document.querySelectorAll('g.node')].map(node=>[node.dataset.nodeId,node.getAttribute('transform')]);"), points);
      for (const format of ["svg", "png", "json", "dot", "csv"]) {
        const destination = path.join(artifacts, `impact-path-graph.${format}`);
        void vscode.commands.executeCommand("matlabViz.exportGraph"); await input(format === "dot" ? "Graphviz DOT" : format.toUpperCase());
        // Repository-scale SVG remains full-scope/vector. Bound the optional
        // repository PNG to the fitted path viewport rather than bypassing
        // the product's pixel-limit safeguard on arbitrary large graphs.
        if (format === "svg" || format === "png") await input(sourcePath && format === "png" ? "Current viewport" : "Filtered graph");
        if (format === "png") await input("2");
        await input(destination);
        await waitFor(async () => { try { return (await fs.stat(destination)).size > 0; } catch { return false; } });
        const bytes = await fs.readFile(destination), text = bytes.toString("utf8");
        if (format === "svg") {
          const parsed = await view.evaluate(`const doc=new DOMParser().parseFromString(${JSON.stringify(text)},'image/svg+xml');return {error:!!doc.querySelector('parsererror'),nodes:doc.querySelectorAll('g.node').length,edges:doc.querySelectorAll('.edge').length,path:doc.querySelectorAll('.edge.dependency-path').length,images:doc.querySelectorAll('image').length};`);
          assert.deepEqual(parsed, { error: false, nodes: report.nodes.length, edges: report.edges.length, path: target.depth, images: 0 });
          assert.match(text, /Impact report scope/);
        } else if (format === "png") { assert.equal(bytes.subarray(1, 4).toString(), "PNG"); assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0); }
        else if (format === "json") assert.deepEqual(JSON.parse(text), graph);
        else assert.equal(format === "dot" ? (text.match(/ -> /g) || []).length : text.trim().split(/\r?\n/).length - 1, graph.edges.length);
      }
      // Check the real LogOutputChannel file, not only an in-memory mock.
      await waitFor(async () => {
        const files = await fs.readdir(path.join(profile, "logs"), { recursive: true });
        const names = files.filter(file => file.endsWith("MATLAB Viz.log"));
        const logs = (await Promise.all(names.map(file => fs.readFile(path.join(profile, "logs", file), "utf8")))).join("\n");
        return logs.includes("Impact report:") && logs.includes("Impact path:") && logs.includes("Export saved:") && logs.includes("No MATLAB execution.");
      });
      assert.equal(await fs.readFile(cache, "utf8"), original);
      if (sourcePath) assert.equal(await fs.readFile(sourcePath, "utf8"), sourceBytes);
      await fs.writeFile(path.join(artifacts, "impact-expected-view.json"), JSON.stringify(await view.evaluate(snapshotBody)));
      observations.push(`${report.counts.directDependents} direct / ${report.counts.totalDependents} total dependents; ${report.nodes.length} scoped nodes, ${report.edges.length} original links, ${target.depth}-link route. Three exact Return comparisons; real Markdown/JSON reports and SVG/PNG/JSON/DOT/CSV exports passed.${sourcePath ? " Repository PNG uses the fitted path viewport; SVG retains all scoped originals." : ""} Native log contains report, route and successful saves. Source cache unchanged; no MATLAB execution.`);
    } else if (stage === "restore-impact-reports" || stage === "reload-impact-reports") {
      await vscode.commands.executeCommand("matlabViz.showGraph"); const view = await debug.graph();
      await waitFor(async () => view.evaluate("return document.getElementById('details').textContent.includes('Impact path')&&!document.getElementById('clear-dependency-path').hidden;"));
      const expected = JSON.parse(await fs.readFile(path.join(artifacts, "impact-expected-view.json"), "utf8"));
      if (stage === "reload-impact-reports") {
        const markerPath = path.join(artifacts, "impact-reload-marker.json"), runId = process.env.MATLAB_VIZ_RESTORE_RUN_ID;
        let marker: any; try { marker = JSON.parse(await fs.readFile(markerPath, "utf8")); } catch { /* First activation. */ }
        if (marker?.runId !== runId) {
          await fs.writeFile(markerPath, JSON.stringify({ runId }));
          void vscode.commands.executeCommand("workbench.action.reloadWindow"); await new Promise<never>(() => {});
        }
      }
      assert.deepEqual(await view.evaluate(snapshotBody), expected);
      // Restart retains the path for the subsequent Reload Window phase.
      if (stage === "reload-impact-reports") {
        await view.evaluate("document.getElementById('clear-dependency-path').click();document.getElementById('return-report-view').click();return true;");
        await waitFor(async () => view.evaluate("return document.getElementById('details').textContent.includes('File impact report');"));
        assert.deepEqual(await view.evaluate(snapshotBody), JSON.parse(await fs.readFile(path.join(artifacts, "impact-previous-view.json"), "utf8")));
      }
      observations.push(`${stage}: exact impact path, incoming scope and viewport restored; route evidence rebuilt by host, not trusted from saved edge IDs.`);
    } else throw new Error(`Unknown impact-report stage ${stage}`);
    await fs.writeFile(path.join(artifacts, `${stage}-result.json`), JSON.stringify({ passed: true, observations }, null, 2));
  } catch (error) {
    observations.push(error instanceof Error ? error.stack ?? error.message : String(error));
    await fs.writeFile(path.join(artifacts, `${stage}-result.json`), JSON.stringify({ passed: false, observations }, null, 2)); throw error;
  } finally { debug.close(); }
}
