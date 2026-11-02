import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { DebugWebview, snapshotBody } from "./debugWebview";
import { entryPointFixture } from "../support/entryPointFixture";
import { buildEntryPointReport } from "../../src/core/entryPointReport";
import { validateGraph } from "../../src/model";

/** Native editor tests use an isolated profile and controlled graph evidence.
 * No normal editor profile, WEST code, MATLAB process or fixture function runs. */
export async function run(): Promise<void> {
  const artifacts = process.env.MATLAB_VIZ_TEST_ARTIFACTS!, profile = process.env.MATLAB_VIZ_HOST_PROFILE!;
  const stage = process.env.MATLAB_VIZ_RESTORE_STAGE!;
  const debug = new DebugWebview(process.env.MATLAB_VIZ_DEBUG_ENDPOINT!), observations: string[] = [];
  const pause = (ms = 150) => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(check: () => Promise<boolean>) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) { if (await check()) return; await pause(); }
    throw new Error("Entry-point report editor condition timed out");
  }
  try {
    if (stage === "reports") {
      const root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
      const graph = entryPointFixture(root), original = JSON.stringify(graph);
      const storage = path.join(profile, "User", "workspaceStorage");
      const workspace = (await fs.readdir(storage, { withFileTypes: true })).find(item => item.isDirectory() && /^[a-f\d]{32}$/i.test(item.name)); assert.ok(workspace);
      const cache = path.join(storage, workspace.name, "daw-0.matlab-viz");
      await fs.mkdir(cache, { recursive: true }); await fs.writeFile(path.join(cache, "last-graph.json"), original);
      await vscode.workspace.getConfiguration("files").update("simpleDialog.enable", true, vscode.ConfigurationTarget.Global);
      await vscode.commands.executeCommand("workbench.action.closeSidebar"); await vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
      await vscode.commands.executeCommand("matlabViz.showGraph"); const view = await debug.graph(), workbench = await debug.workbench();
      await view.evaluate("document.querySelector('[data-node-id=n0]').dispatchEvent(new MouseEvent('click',{bubbles:true}));const direction=document.getElementById('direction');direction.value='dependencies';direction.dispatchEvent(new Event('change'));const depth=document.getElementById('depth');depth.value='1';depth.dispatchEvent(new Event('change'));return true;");
      const before = await view.evaluate(snapshotBody);
      await view.evaluate("document.getElementById('entry-point-report').click();return true;");
      await waitFor(async () => view.evaluate("return document.getElementById('details').textContent.includes('1 reachable notices');"));
      assert.equal(await view.evaluate("return document.querySelectorAll('g.node').length;"), 2);
      const content = await view.evaluate("return document.getElementById('details').textContent;");
      assert.match(content, /3\/6 original nodes/); assert.match(content, /1 reachable notices.*1 outside.*2 unattributed/);
      assert.match(content, /Constructed function names/);
      assert.deepEqual((await view.evaluate(snapshotBody)).transform, before.transform);
      observations.push("Real report controls show all three reachable nodes despite depth-one view; exact notice categories and limits are visible without changing viewport.");
      const input = async (value: string) => {
        // A newly opened simple save dialog can asynchronously replace its
        // initial default name. Wait for our value to survive that settling
        // period before Enter, rather than accidentally saving the default.
        await waitFor(async () => {
          const found = await workbench.evaluate(`const input=[...document.querySelectorAll('.quick-input-widget input')].find(item=>item.getBoundingClientRect().width>0);if(!input)return false;input.focus();input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
          if (!found) return false;
          await pause(250);
          return workbench.evaluate(`return [...document.querySelectorAll('.quick-input-widget input')].some(item=>item.getBoundingClientRect().width>0&&item.value===${JSON.stringify(value)});`);
        });
        await workbench.request("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
        await workbench.request("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }); await pause(200);
      };
      for (const format of ["json", "md"]) {
        const label = format === "json" ? "JSON" : "Markdown", destination = path.join(artifacts, `entry-point-ui-report.${format}`);
        await view.evaluate(`const button=[...document.querySelectorAll('#details button')].find(item=>item.textContent===${JSON.stringify(`Export report (${label})`)});button.click();return true;`);
        await input(destination);
        await waitFor(async () => { try { return (await fs.stat(destination)).size > 0; } catch { return false; } });
        const saved = await fs.readFile(destination, "utf8");
        if (format === "json") {
          const report = JSON.parse(saved); assert.equal(report.nodes.length, 3); assert.equal(report.edges.length, 2); assert.equal(report.notices.length, 4);
        } else assert.match(saved, /All analysis notices \(nothing suppressed\)/);
      }
      assert.equal(await fs.readFile(path.join(cache, "last-graph.json"), "utf8"), original);
      observations.push("Actual save dialogs produce complete JSON and Markdown reports; cached original graph is byte-for-byte unchanged.");
      const previousView = await view.evaluate(snapshotBody);
      await fs.writeFile(path.join(artifacts, "previous-report-view.json"), JSON.stringify(previousView));
      const showScope = () => view.evaluate("[...document.querySelectorAll('#details button')].find(button=>button.textContent==='Show report scope in graph').click();return true;");
      for (let i = 0; i < 3; i++) {
        await showScope();
        await waitFor(async () => view.evaluate("return document.querySelectorAll('g.node').length===3&&!document.getElementById('report-scope-status').hidden;"));
        assert.equal(await view.evaluate("return document.getElementById('direction').value;"), "report");
        for (const id of ["depth", "direction", "grouping", "cycle-mode", "external", "isolated"]) {
          assert.equal(await view.evaluate(`return document.getElementById(${JSON.stringify(id)}).disabled;`), true);
        }
        await view.evaluate("document.getElementById('return-report-view').click();return true;"); await pause(250);
        assert.deepEqual(await view.evaluate(snapshotBody), previousView);
      }
      await showScope();
      // Reuse actual editor dialogs for visual/full-graph export semantics.
      for (const format of ["svg", "png", "json", "dot", "csv"]) {
        const destination = path.join(artifacts, `report-scope-graph.${format}`);
        void vscode.commands.executeCommand("matlabViz.exportGraph"); await input(format === "dot" ? "Graphviz DOT" : format.toUpperCase());
        if (format === "svg" || format === "png") await input("Filtered graph");
        if (format === "png") await input("2");
        await input(destination);
        await waitFor(async () => { try { return (await fs.stat(destination)).size > 0; } catch { return false; } });
        const bytes = await fs.readFile(destination), source = bytes.toString("utf8");
        if (format === "svg") {
          const parsed = await view.evaluate(`const doc=new DOMParser().parseFromString(${JSON.stringify(source)},'image/svg+xml');return {error:!!doc.querySelector('parsererror'),nodes:doc.querySelectorAll('g.node').length,images:doc.querySelectorAll('image').length};`);
          assert.deepEqual(parsed, { error: false, nodes: 3, images: 0 }); assert.match(source, /Entry-point report scope/);
        } else if (format === "png") {
          assert.equal(bytes.subarray(1, 4).toString(), "PNG"); assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0);
        } else if (format === "json") {
          const exported = JSON.parse(source); assert.equal(exported.nodes.length, 6); assert.equal(exported.edges.length, 3); assert.equal(exported.problems.length, 4);
        } else assert.equal(format === "dot" ? (source.match(/ -> /g) || []).length : source.trim().split(/\r?\n/).length - 1, 3);
      }
      // Exercise the route against real DOM, real host messages and export
      // dialogs. The target is a missing input in saved analysis: navigation
      // remains a separate user action and no fixture code is executed.
      const scopedBeforePath = await view.evaluate("return [...document.querySelectorAll('g.node')].map(node=>[node.dataset.nodeId,node.getAttribute('transform')]);");
      await view.evaluate("document.querySelector('[data-node-id=n4]').dispatchEvent(new MouseEvent('click',{bubbles:true}));[...document.querySelectorAll('#details button')].find(button=>button.textContent==='Show dependency path').click();return true;");
      await waitFor(async () => view.evaluate("return document.getElementById('details').textContent.includes('2 analyzed links')&&document.querySelectorAll('.edge.dependency-path').length===2;"));
      assert.equal(await view.evaluate("return document.querySelectorAll('g.node').length;"), 3);
      assert.equal(await view.evaluate("return document.getElementById('clear-dependency-path').hidden;"), false);
      assert.match(await view.evaluate("return document.getElementById('details').textContent;"), /Via function.*Via data.*Missing file/);
      for (const format of ["svg", "png"]) {
        const destination = path.join(artifacts, `dependency-path-ui.${format}`);
        void vscode.commands.executeCommand("matlabViz.exportGraph"); await input(format.toUpperCase()); await input("Filtered graph");
        if (format === "png") await input("2");
        await input(destination);
        await waitFor(async () => { try { return (await fs.stat(destination)).size > 0; } catch { return false; } });
        const bytes = await fs.readFile(destination);
        if (format === "svg") {
          const source = bytes.toString("utf8"); assert.equal((source.match(/class="edge dependency-path"/g) || []).length, 2);
          assert.match(source, /not the only route or a runtime execution trace/);
        } else assert.equal(bytes.subarray(1, 4).toString(), "PNG");
      }
      await view.evaluate("document.getElementById('clear-dependency-path').click();return true;");
      assert.equal(await view.evaluate("return document.querySelectorAll('.edge.dependency-path').length;"), 0);
      await view.evaluate("document.querySelector('[data-node-id=n0]').dispatchEvent(new MouseEvent('click',{bubbles:true}));document.getElementById('entry-point-report').click();return true;");
      await waitFor(async () => view.evaluate("return document.getElementById('details').textContent.includes('1 reachable notices');"));
      assert.deepEqual(await view.evaluate("return [...document.querySelectorAll('g.node')].map(node=>[node.dataset.nodeId,node.getAttribute('transform')]);"), scopedBeforePath,
        "Path inspection moved report-scope nodes");
      assert.equal(await fs.readFile(path.join(cache, "last-graph.json"), "utf8"), original);
      await view.evaluate("document.getElementById('graph').dispatchEvent(new WheelEvent('wheel',{deltaY:-120,clientX:300,clientY:250,cancelable:true}));return true;"); await pause();
      observations.push("Scope shows every reachable original despite depth-one view; three Show/Return cycles restore the exact prior snapshot. The native route panel highlights two original links without moving nodes; SVG/PNG retain it, ordinary JSON/DOT/CSV retain full analysis.");
      await fs.writeFile(path.join(artifacts, "expected-report-view.json"), JSON.stringify(await view.evaluate(snapshotBody)));
    } else if (stage === "restore-reports") {
      await vscode.commands.executeCommand("matlabViz.showGraph"); const view = await debug.graph();
      await waitFor(async () => view.evaluate("return document.getElementById('details').textContent.includes('1 reachable notices');"));
      assert.deepEqual(await view.evaluate(snapshotBody), JSON.parse(await fs.readFile(path.join(artifacts, "expected-report-view.json"), "utf8")));
      assert.equal(await view.evaluate("return document.getElementById('report-scope-status').hidden;"), false);
      await view.evaluate("document.getElementById('return-report-view').click();return true;"); await pause(250);
      assert.deepEqual(await view.evaluate(snapshotBody), JSON.parse(await fs.readFile(path.join(artifacts, "previous-report-view.json"), "utf8")));
      await view.evaluate("[...document.querySelectorAll('#details button')].find(button=>button.textContent==='Show report scope in graph').click();return true;");
      await view.evaluate("document.querySelector('[data-node-id=n4]').dispatchEvent(new MouseEvent('click',{bubbles:true}));[...document.querySelectorAll('#details button')].find(button=>button.textContent==='Show dependency path').click();return true;");
      await waitFor(async () => view.evaluate("return document.querySelectorAll('.edge.dependency-path').length===2;"));
      observations.push("Application restart restores active report scope and exact view; Return restores the prior ordinary view. A two-link path is then left active for Reload Window persistence testing.");
    } else if (stage === "reload-reports") {
      await vscode.commands.executeCommand("matlabViz.showGraph"); const view = await debug.graph();
      await waitFor(async () => view.evaluate("return document.getElementById('details').textContent.includes('2 analyzed links')&&document.querySelectorAll('.edge.dependency-path').length===2;"));
      const markerPath = path.join(artifacts, "reload-report-marker.json"), runId = process.env.MATLAB_VIZ_RESTORE_RUN_ID;
      let marker: any; try { marker = JSON.parse(await fs.readFile(markerPath, "utf8")); } catch { /* First activation. */ }
      if (!marker || marker.runId !== runId) {
        await fs.writeFile(markerPath, JSON.stringify({ runId, snapshot: await view.evaluate(snapshotBody) }));
        void vscode.commands.executeCommand("workbench.action.reloadWindow"); await new Promise<never>(() => {});
      }
      assert.deepEqual(await view.evaluate(snapshotBody), marker.snapshot);
      assert.equal(await view.evaluate("return document.querySelectorAll('g.node').length;"), 3);
      assert.equal(await view.evaluate("return document.querySelectorAll('.edge.dependency-path').length;"), 2);
      await view.evaluate("document.getElementById('clear-dependency-path').click();return true;");
      assert.equal(await view.evaluate("return document.getElementById('clear-dependency-path').hidden;"), true);
      await view.evaluate("document.getElementById('return-report-view').click();return true;"); await pause(250);
      assert.deepEqual(await view.evaluate(snapshotBody), JSON.parse(await fs.readFile(path.join(artifacts, "previous-report-view.json"), "utf8")));
      observations.push("Actual Reload Window rebuilds the two-link path from its saved target, preserves the exact view, and Clear then Return restore normal styling and the original ordinary view.");
    } else if (stage === "reports-repository") {
      const sourcePath = process.env.MATLAB_VIZ_TEST_GRAPH; assert.ok(sourcePath);
      const original = await fs.readFile(sourcePath, "utf8"), graph = validateGraph(JSON.parse(original));
      const seed = graph.nodes.find(node => node.label === "interfaceRetinaWESTOffline.m"); assert.ok(seed);
      const report = buildEntryPointReport(graph, seed.id);
      const storage = path.join(profile, "User", "workspaceStorage");
      const workspace = (await fs.readdir(storage, { withFileTypes: true })).find(item => item.isDirectory() && /^[a-f\d]{32}$/i.test(item.name)); assert.ok(workspace);
      const cache = path.join(storage, workspace.name, "daw-0.matlab-viz");
      await fs.mkdir(cache, { recursive: true }); await fs.writeFile(path.join(cache, "last-graph.json"), JSON.stringify(graph));
      await vscode.commands.executeCommand("workbench.action.closeSidebar"); await vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
      await vscode.commands.executeCommand("matlabViz.showGraph"); const view = await debug.graph();
      await view.evaluate(`const layout=document.getElementById('layout');layout.value='grid';layout.dispatchEvent(new Event('change'));[...document.querySelectorAll('g.node')].find(node=>node.dataset.nodeId===${JSON.stringify(seed.id)}).dispatchEvent(new MouseEvent('click',{bubbles:true}));document.getElementById('entry-point-report').click();return true;`);
      await waitFor(async () => view.evaluate("return document.getElementById('details').textContent.includes('Reachable original nodes');"));
      const previous = await view.evaluate(snapshotBody);
      await view.evaluate("[...document.querySelectorAll('#details button')].find(button=>button.textContent==='Show report scope in graph').click();return true;"); await pause(250);
      assert.equal(await view.evaluate("return document.querySelectorAll('g.node').length;"), report.counts.nodes);
      assert.equal(await view.evaluate("return document.querySelectorAll('.edge').length;"), report.counts.edges);
      const boxes = await view.evaluate(`const canvas=document.getElementById('graph').getBoundingClientRect();return [...document.querySelectorAll('g.node')].map(node=>{const box=node.getBoundingClientRect();return {left:box.left-canvas.left,top:box.top-canvas.top,right:box.right-canvas.left,bottom:box.bottom-canvas.top,width:canvas.width,height:canvas.height};});`);
      assert.ok(boxes.every((box: any) => box.left >= -1 && box.top >= -1 && box.right <= box.width + 1 && box.bottom <= box.height + 1), "Fit clipped a scoped original node");
      const target = report.nodes.reduce((best, item) => item.depth > best.depth ? item : best, report.nodes[0]!);
      await view.evaluate(`[...document.querySelectorAll('g.node')].find(node=>node.dataset.nodeId===${JSON.stringify(target.node.id)}).dispatchEvent(new MouseEvent('click',{bubbles:true}));[...document.querySelectorAll('#details button')].find(button=>button.textContent==='Show dependency path').click();return true;`);
      await waitFor(async () => view.evaluate(`return document.querySelectorAll('.edge.dependency-path').length===${target.depth}&&document.getElementById('details').textContent.includes('analyzed link');`));
      assert.match(await view.evaluate("return document.getElementById('details').textContent;"), /not the only route or a runtime execution trace/);
      await view.evaluate("document.getElementById('clear-dependency-path').click();return true;");
      await view.evaluate("document.getElementById('return-report-view').click();return true;"); await pause(250);
      assert.deepEqual(await view.evaluate(snapshotBody), previous);
      assert.equal(await fs.readFile(sourcePath, "utf8"), original, "user's graph cache changed");
      observations.push(`Read-only saved repository smoke test: ${report.counts.nodes} scoped nodes, ${report.counts.edges} links, ${target.depth}-link route highlighted, every node inside fitted canvas, exact overview restored; source cache unchanged.`);
    } else throw new Error(`Unknown report phase ${stage}`);
    await fs.writeFile(path.join(artifacts, `${stage}-result.json`), JSON.stringify({ passed: true, observations }, null, 2));
  } catch (error) {
    observations.push(error instanceof Error ? error.stack ?? error.message : String(error));
    await fs.writeFile(path.join(artifacts, `${stage}-result.json`), JSON.stringify({ passed: false, observations }, null, 2)); throw error;
  } finally { debug.close(); }
}
