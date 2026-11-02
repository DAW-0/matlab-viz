import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { validateGraph } from "../../src/model";
import { DebugWebview, snapshotBody } from "./debugWebview";

/** Real Chromium cycle UI tests against a controlled cached graph. Its cycle
 * edges are deliberately synthetic renderer input, NOT a claim that the owned
 * MATLAB fixture really recurses. A final actual Refresh replaces that cache
 * with MATLAB's acyclic result, verifying cycle recomputation end to end.
 * Normal profiles and WEST sources are never changed or analyzed. */
export async function run(): Promise<void> {
  const artifacts = process.env.MATLAB_VIZ_TEST_ARTIFACTS!, profile = process.env.MATLAB_VIZ_HOST_PROFILE!;
  const stage = process.env.MATLAB_VIZ_RESTORE_STAGE!, root = path.join(process.env.MATLAB_VIZ_HOST_FIXTURES!, "project");
  const debug = new DebugWebview(process.env.MATLAB_VIZ_DEBUG_ENDPOINT!), observations: string[] = [];
  const pause = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
  const log = (message: string) => { observations.push(message); console.log(message); };
  const capture = snapshotBody.replace("return {", "return {cycleMode:document.getElementById('cycle-mode').value,component:document.getElementById('cycle-component').value,summary:document.getElementById('summary').textContent,");
  async function waitFor(check: () => Promise<boolean>, timeout = 20_000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) { if (await check()) return; await pause(); }
    throw new Error("Cycle editor condition timed out");
  }
  try {
    if (stage === "cycles") {
      const original = validateGraph({ metadata: { schemaVersion: 1, generatedAt: "cycle-native-fixture", root, graphType: "files", mode: "folder", durationSeconds: 0,
        analysisTarget: { version: 1, type: "files" } },
      nodes: ["entry.m", "middle.m", "leaf.m", "isolated.m"].map((file, i) => ({ id: String.fromCharCode(97 + i), label: file,
        relativePath: file, path: path.join(root, file), kind: "MATLAB code", external: false, missing: false })),
      edges: [["a", "b"], ["b", "c"], ["c", "a"], ["d", "d"], ["c", "d"]].map(([source, target], i) => ({ id: `e${i}`, source, target, kind: "controlled test link" })), products: [], problems: [] });
      const storage = path.join(profile, "User", "workspaceStorage"), folders = await fs.readdir(storage, { withFileTypes: true });
      const workspace = folders.find((entry) => entry.isDirectory() && /^[a-f\d]{32}$/i.test(entry.name)); assert.ok(workspace);
      const cache = path.join(storage, workspace.name, "daw-0.matlab-viz");
      await fs.mkdir(cache, { recursive: true }); await fs.writeFile(path.join(cache, "last-graph.json"), JSON.stringify(original));
      await vscode.workspace.getConfiguration("files").update("simpleDialog.enable", true, vscode.ConfigurationTarget.Global);
      await vscode.commands.executeCommand("workbench.action.closeSidebar"); await vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
      await vscode.commands.executeCommand("matlabViz.showGraph");
      const view = await debug.graph(), workbench = await debug.workbench();
      const change = (id: string, value: string) => view.evaluate(`const control=document.getElementById(${JSON.stringify(id)});control.value=${JSON.stringify(value)};control.dispatchEvent(new Event('change'));return true;`);
      const count = () => view.evaluate("return document.querySelectorAll('g.node').length;");
      assert.equal(await view.evaluate("return document.getElementById('cycles').textContent;"), "Cycles (2)");
      await change("cycle-mode", "highlight");
      assert.equal(await count(), 4); assert.equal(await view.evaluate("return document.querySelectorAll('g.node.cyclic').length;"), 4);
      assert.equal(await view.evaluate("return document.querySelectorAll('.edge.cyclic').length;"), 4);
      assert.equal(await view.evaluate("return document.querySelector('[data-edge-id=e4]').classList.contains('cyclic');"), false);
      await change("cycle-component", 'component:"a"'); await change("grouping", "folder");
      assert.equal(await count(), 1); assert.equal(await view.evaluate("return document.querySelectorAll('g.node.cyclic').length;"), 1);
      await change("cycle-mode", "isolate"); assert.equal(await count(), 3);
      assert.equal(await view.evaluate("return document.querySelectorAll('.edge').length;"), 3);
      assert.equal(await view.evaluate("return document.getElementById('direction').disabled;"), true);
      const styles = await view.evaluate("return {stroke:getComputedStyle(document.querySelector('g.node.cyclic rect')).stroke,width:getComputedStyle(document.querySelector('.edge.cyclic')).strokeWidth};");
      assert.ok(styles.stroke && styles.stroke !== "none"); assert.equal(Number.parseFloat(styles.width), 2.4);
      log("Original graph: two components (three-file loop and self-link); bridge is not cyclic. Grouped highlighting marks membership; isolation automatically reveals the three original nodes/links with real computed styling");

      const input = async (value: string) => {
        await waitFor(async () => {
          await workbench.evaluate(`const input=[...document.querySelectorAll('.quick-input-widget input')].find(input=>input.getBoundingClientRect().width>0);if(!input)return false;input.focus();input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
          await pause(200);
          return workbench.evaluate(`return [...document.querySelectorAll('.quick-input-widget input')].some(input=>input.getBoundingClientRect().width>0&&input.value===${JSON.stringify(value)});`);
        });
        await workbench.request("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
        await workbench.request("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }); await pause(200);
      };
      for (const format of ["svg", "png", "json", "dot", "csv"]) {
        const destination = path.join(artifacts, `cycle-isolated.${format}`);
        void vscode.commands.executeCommand("matlabViz.exportGraph"); await input(format === "dot" ? "Graphviz DOT" : format.toUpperCase());
        if (["svg", "png"].includes(format)) { await input("Filtered graph"); if (format === "png") await input("2"); }
        await input(destination); await waitFor(async () => { try { return (await fs.stat(destination)).size > 0; } catch { return false; } });
        if (format === "svg") {
          const source = await fs.readFile(destination, "utf8");
          const parsed = await view.evaluate(`const doc=new DOMParser().parseFromString(${JSON.stringify(source)},'image/svg+xml');return {error:!!doc.querySelector('parsererror'),nodes:doc.querySelectorAll('g.node.cyclic').length,edges:doc.querySelectorAll('.edge.cyclic').length,images:doc.querySelectorAll('image').length};`);
          assert.deepEqual(parsed, { error: false, nodes: 3, edges: 3, images: 0 }); assert.match(source, /Cycle view: isolate/);
        } else if (format === "png") {
          const data = await fs.readFile(destination); assert.equal(data.subarray(1, 4).toString(), "PNG"); assert.ok(data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0);
        } else if (format === "json") assert.deepEqual(validateGraph(JSON.parse(await fs.readFile(destination, "utf8"))), original);
        else {
          const source = await fs.readFile(destination, "utf8");
          assert.equal(format === "dot" ? (source.match(/ -> /g) || []).length : source.trim().split(/\r?\n/).length - 1, 5);
        }
      }
      log("Actual menus/save dialogs: isolated vector SVG and PNG contain the selected loop; complete JSON/DOT/CSV still retain all four original nodes and five edges");
      await view.evaluate("document.getElementById('cycles').click();const open=[...document.querySelectorAll('#details button')].find(button=>button.textContent==='Open: entry.m');if(!open)throw new Error('Source member button missing');open.click();return true;");
      await waitFor(async () => vscode.window.activeTextEditor?.document.uri.fsPath.toLowerCase() === path.join(root, "entry.m").toLowerCase());
      assert.equal(vscode.window.activeTextEditor!.selection.active.line, 0);
      await vscode.commands.executeCommand("matlabViz.showGraph");
      const visible = await debug.graph();
      const partial = JSON.parse(JSON.stringify(original)); partial.nodes[2].external = true; partial.metadata.generatedAt = "cycle-partial";
      await visible.evaluate(`window.postMessage({type:'setGraph',graph:${JSON.stringify(partial)},defaultLayout:'grid'},'*');return true;`); await pause();
      await change("cycle-component", 'component:"a"'); await change("cycle-mode", "isolate");
      await visible.evaluate("const external=document.getElementById('external');external.checked=false;external.dispatchEvent(new Event('change'));return true;");
      assert.equal(await count(), 2); assert.match(await visible.evaluate("return document.getElementById('details').textContent;"), /2\/3 selected component members and 1\/3 internal links/);
      assert.equal(await visible.evaluate("return document.getElementById('cycles').textContent;"), "Cycles (2)");

      const falseCycle = JSON.parse(JSON.stringify(original)); falseCycle.metadata.generatedAt = "cycle-projection-trap";
      falseCycle.nodes.forEach((node: any, i: number) => { node.path = `${root.replace(/\\/g, "/")}/${i < 2 ? "groupA" : "groupB"}/${node.label}`; });
      falseCycle.edges = [{ id: "ac", source: "a", target: "c", kind: "dependency" }, { id: "db", source: "d", target: "b", kind: "dependency" }];
      await visible.evaluate(`window.postMessage({type:'setGraph',graph:${JSON.stringify(falseCycle)},defaultLayout:'grid'},'*');return true;`); await pause();
      await change("grouping", "folder"); assert.equal(await count(), 2);
      assert.equal(await visible.evaluate("return document.querySelectorAll('.edge').length;"), 2);
      assert.equal(await visible.evaluate("return document.getElementById('cycles').textContent;"), "Cycles (0)");
      assert.equal(await visible.evaluate("return document.getElementById('cycle-mode').disabled;"), true);
      log("Member navigation opens the owned source at line one without running it. Hidden external members report a partial loop; opposite projected group arrows correctly report zero original cycles");

      await visible.evaluate(`window.postMessage({type:'setGraph',graph:${JSON.stringify(original)},defaultLayout:'grid'},'*');return true;`); await pause();
      await change("cycle-component", 'component:"a"'); await change("cycle-mode", "isolate");
      await visible.evaluate("const search=document.getElementById('search');search.value='middle';search.dispatchEvent(new Event('input'));document.getElementById('cycles').click();document.getElementById('graph').dispatchEvent(new WheelEvent('wheel',{deltaY:-120,clientX:300,clientY:300,cancelable:true}));return true;");
      await pause(); await fs.writeFile(path.join(artifacts, "expected-cycle-view.json"), JSON.stringify(await visible.evaluate(capture), null, 2));
      const screenshot = await workbench.request("Page.captureScreenshot", { format: "png" }); await fs.writeFile(path.join(artifacts, "cycle-editor.png"), Buffer.from(screenshot.data, "base64"));
      log("Saved isolated component, grouping expansion, search, browser details and custom viewport for application restart");
    } else if (stage === "restore-cycles") {
      await vscode.commands.executeCommand("matlabViz.showGraph"); const view = await debug.graph();
      assert.deepEqual(await view.evaluate(capture), JSON.parse(await fs.readFile(path.join(artifacts, "expected-cycle-view.json"), "utf8")));
      log("Application restart restores the exact cycle mode/component, grouping, members, positions, details, search and custom viewport without MATLAB analysis");
    } else if (stage === "reload-cycles") {
      const markerPath = path.join(artifacts, "reload-cycle-marker.json"), runId = process.env.MATLAB_VIZ_RESTORE_RUN_ID;
      let marker: any; try { marker = JSON.parse(await fs.readFile(markerPath, "utf8")); } catch { /* First execution. */ }
      await vscode.commands.executeCommand("matlabViz.showGraph"); const view = await debug.graph();
      if (!marker || marker.runId !== runId) {
        await fs.writeFile(markerPath, JSON.stringify({ runId, snapshot: await view.evaluate(capture) }));
        void vscode.commands.executeCommand("workbench.action.reloadWindow"); await new Promise<never>(() => {});
      }
      assert.deepEqual(await view.evaluate(capture), marker.snapshot);
      log("Actual Reload Window preserves isolated cycle selection and the exact restored view");
    } else if (stage === "cycles-calls") {
      const config = vscode.workspace.getConfiguration("matlabViz");
      await config.update("watchFiles", false, vscode.ConfigurationTarget.Global);
      await config.update("symbols.maximumDepth", 3, vscode.ConfigurationTarget.Global);
      const workspace = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
      for (const [name, expected] of [["matlabVizCycleA", 2], ["matlabVizSelfCycle", 1]] as const) {
        const document = await vscode.workspace.openTextDocument(path.join(workspace, `${name}.m`));
        const editor = await vscode.window.showTextDocument(document, { preview: false });
        const position = document.positionAt(document.getText().indexOf(name)); editor.selection = new vscode.Selection(position, position);
        await vscode.commands.executeCommand("matlabViz.showCallees"); await vscode.commands.executeCommand("matlabViz.showGraph");
        const view = await debug.graph();
        await waitFor(async () => view.evaluate(`return document.getElementById('graph').textContent.includes(${JSON.stringify(name)})&&document.querySelectorAll('g.node').length===${expected};`));
        assert.equal(await view.evaluate("return document.getElementById('cycles').textContent;"), "Cycles (1)");
        await view.evaluate("const mode=document.getElementById('cycle-mode');mode.value='isolate';mode.dispatchEvent(new Event('change'));return true;");
        assert.equal(await view.evaluate("return document.querySelectorAll('.edge.cyclic').length;"), expected);
        const text = await view.evaluate("return document.getElementById('details').textContent;");
        if (expected === 1) assert.match(text, /1 self-links \(direct recursion\)/);
        else assert.match(text, /2 symbols; 2 internal calls; 0 self-links/);
      }
      log("Actual Show Callees commands on owned MATLAB source recover a two-function mutual cycle and a one-function recursive self-edge; cycle isolation marks the real call-graph edges without executing either function");
    } else if (stage === "cycles-refresh") {
      const config = vscode.workspace.getConfiguration("matlabViz");
      for (const [name, value] of Object.entries({ analysisMode: "folder", maximumFiles: 1, watchFiles: false, includeExternal: false, matlabExecutable: process.env.MATLAB_VIZ_TEST_EXECUTABLE })) {
        assert.notEqual(value, undefined); await config.update(name, value, vscode.ConfigurationTarget.Global);
      }
      await vscode.commands.executeCommand("matlabViz.showGraph"); const view = await debug.graph();
      const before = await view.evaluate(capture); await vscode.commands.executeCommand("matlabViz.refresh");
      await waitFor(async () => view.evaluate("return !document.getElementById('analysis-status').hidden;"));
      const failed = await view.evaluate(capture); assert.deepEqual({ ...failed, analysisBanner: before.analysisBanner }, before);
      await config.update("maximumFiles", 5000, vscode.ConfigurationTarget.Global); await vscode.commands.executeCommand("matlabViz.refresh");
      await waitFor(async () => view.evaluate("return document.getElementById('cycles').textContent==='Cycles (0)'&&document.getElementById('analysis-status').hidden;"));
      assert.equal(await view.evaluate("return document.getElementById('cycle-mode').value;"), "off");
      assert.equal(await view.evaluate("return document.querySelectorAll('g.node').length;"), 4);
      log("Actual MATLAB failure retains the isolated previous view; a successful Refresh replaces the synthetic fixture with the real four-file acyclic result and clears stale cycle selection");
    }
    await fs.writeFile(path.join(artifacts, `${stage}-result.json`), JSON.stringify({ passed: true, observations }, null, 2));
  } catch (error) {
    log(error instanceof Error ? error.stack ?? error.message : String(error));
    try { const workbench = await debug.workbench(); const screenshot = await workbench.request("Page.captureScreenshot", { format: "png" }); await fs.writeFile(path.join(artifacts, `${stage}-failure.png`), Buffer.from(screenshot.data, "base64")); } catch { /* Keep original failure. */ }
    await fs.writeFile(path.join(artifacts, `${stage}-result.json`), JSON.stringify({ passed: false, observations }, null, 2)); throw error;
  } finally { debug.close(); await fs.writeFile(path.join(artifacts, `${stage}.log`), observations.join("\n")); }
}
