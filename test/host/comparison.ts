import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { compareAnalyses, readAnalysisBaseline } from "../../src/core/analysisComparison";
import { validateGraph } from "../../src/model";
import { entryPointFixture } from "../support/entryPointFixture";
import { DebugWebview, snapshotBody } from "./debugWebview";

/** Private-profile evidence tests. The changed cache is controlled test data,
 * not a MATLAB run or a write to the user's real repository graph cache. */
export async function run(): Promise<void> {
  const artifacts = process.env.MATLAB_VIZ_TEST_ARTIFACTS!, profile = process.env.MATLAB_VIZ_HOST_PROFILE!;
  const stage = process.env.MATLAB_VIZ_RESTORE_STAGE!, observations: string[] = [];
  const debug = new DebugWebview(process.env.MATLAB_VIZ_DEBUG_ENDPOINT!);
  const pause = (ms = 150) => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(check: () => Promise<boolean>) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) { if (await check()) return; await pause(); }
    throw new Error("Native analysis-comparison condition timed out");
  }
  const baselinePath = path.join(artifacts, "saved-analysis-baseline.json");
  try {
    const storage = path.join(profile, "User", "workspaceStorage");
    const workspace = (await fs.readdir(storage, { withFileTypes: true })).find(item => item.isDirectory() && /^[a-f\d]{32}$/i.test(item.name)); assert.ok(workspace);
    const cache = path.join(storage, workspace.name, "daw-0.matlab-viz", "last-graph.json");
    const old = validateGraph(entryPointFixture(vscode.workspace.workspaceFolders![0]!.uri.fsPath));
    const current = structuredClone(old); current.metadata.generatedAt = "comparison-changed"; current.metadata.mode = "folder";
    current.nodes = current.nodes.filter(node => node.id !== "n2");
    current.nodes.push({ ...old.nodes[0]!, id: "added", label: "added.m", path: `${old.metadata.root}/added.m`, relativePath: "added.m" });
    current.nodes.find(node => node.id === "n4")!.missing = false;
    current.edges.push({ id: "new-a", source: "n0", target: "added", kind: "function" }, { id: "new-b", source: "added", target: "n4", kind: "data" });
    current.edges[0]!.details = "Updated static evidence";
    current.problems.shift(); current.problems.push({ severity: "warning", message: "New coverage evidence" });
    const changed = validateGraph(current);
    if (stage === "prepare-comparison") {
      await fs.mkdir(path.dirname(cache), { recursive: true }); await fs.writeFile(cache, JSON.stringify(old));
      await vscode.workspace.getConfiguration("files").update("simpleDialog.enable", true, vscode.ConfigurationTarget.Global);
      await vscode.commands.executeCommand("workbench.action.closeSidebar"); await vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
    }
    await vscode.commands.executeCommand("matlabViz.showGraph"); const view = await debug.graph(), workbench = await debug.workbench();
    const click = (label: string) => view.evaluate(`[...document.querySelectorAll('#details button')].find(button=>button.textContent===${JSON.stringify(label)}).click();return true;`);
    const select = (id: string) => view.evaluate(`[...document.querySelectorAll('g.node')].find(node=>node.dataset.nodeId===${JSON.stringify(id)}).dispatchEvent(new MouseEvent('click',{bubbles:true}));document.getElementById('compare-analyses').click();return true;`);
    const ready = () => waitFor(async () => view.evaluate("return document.getElementById('details').textContent.includes('Analysis comparison')&&!document.getElementById('details').textContent.includes('Working on baseline');"));
    const input = async (value: string) => {
      await waitFor(async () => {
        const found = await workbench.evaluate(`const input=[...document.querySelectorAll('.quick-input-widget input')].find(item=>item.getBoundingClientRect().width>0);if(!input)return false;input.focus();input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
        if (!found) return false;
        await pause(250);
        return workbench.evaluate(`return [...document.querySelectorAll('.quick-input-widget input')].some(item=>item.getBoundingClientRect().width>0&&item.value===${JSON.stringify(value)});`);
      });
      await workbench.request("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await workbench.request("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }); await pause(200);
    };
    if (stage === "prepare-comparison") {
      await view.evaluate("document.querySelector('[data-node-id=n0]').dispatchEvent(new MouseEvent('click',{bubbles:true}));document.getElementById('direction').value='dependencies';document.getElementById('depth').value='1';document.getElementById('direction').dispatchEvent(new Event('change'));return true;");
      const prior = await view.evaluate(snapshotBody);
      await view.evaluate("document.getElementById('compare-analyses').click();return true;"); await ready();
      await click("Save current analysis as baseline"); await input(baselinePath); await ready();
      const baseline = readAnalysisBaseline(JSON.parse(await fs.readFile(baselinePath, "utf8")));
      assert.equal(baseline.graph.nodes.length, 6); assert.equal(baseline.graph.edges.length, 3);
      assert.equal(await view.evaluate("return document.querySelectorAll('g.node').length;"), 2, "Saving must not change the depth-one display");
      await click("Compare entire analysis"); await ready();
      assert.match(await view.evaluate("return document.getElementById('details').textContent;"), /Nodes: 0 added.*0 removed.*0 metadata changed/);
      const after = await view.evaluate(snapshotBody); assert.equal(after.transform, prior.transform); assert.equal(after.direction, prior.direction);
      // The next application activation sees controlled fresh evidence. Writing
      // the private test cache is not a product import feature or MATLAB run.
      await fs.writeFile(cache, JSON.stringify(changed));
      await fs.writeFile(path.join(artifacts, "baseline-expected.json"), JSON.stringify(baseline));
      observations.push("Actual Save dialog wrote all six original nodes despite a depth-one two-node view; same-analysis comparison has zero deltas, no viewport change. Prepared private changed cache for next activation.");
    } else if (stage === "compare-analyses") {
      await view.evaluate("document.getElementById('direction').value='all';document.getElementById('direction').dispatchEvent(new Event('change'));return true;");
      await select("n0"); await ready(); await click("Compare selected dependency scope"); await ready();
      let content = await view.evaluate("return document.getElementById('details').textContent;");
      assert.match(content, /Nodes: 1 added.*1 removed.*1 metadata changed/); assert.match(content, /Scope nodes: 3 → 4/);
      await select("n4"); await ready(); await click("Compare selected impact scope"); await ready();
      content = await view.evaluate("return document.getElementById('details').textContent;"); assert.match(content, /Scope nodes: 3 → 4/);
      const baselineBytes = await fs.readFile(baselinePath, "utf8"), baseline = readAnalysisBaseline(JSON.parse(baselineBytes));
      const expected = compareAnalyses(baseline, changed, { mode: "impact", nodeId: "n4" });
      for (const format of ["json", "md"]) {
        const destination = path.join(artifacts, `analysis-comparison.${format}`);
        await click(`Export comparison (${format === "json" ? "JSON" : "Markdown"})`); await input(destination); await ready();
        const text = await fs.readFile(destination, "utf8");
        if (format === "json") assert.deepEqual(JSON.parse(text), expected);
        else { assert.match(text, /Scope differences/); assert.match(text, /Notices no longer reported \(not proven resolved\)/); assert.match(text, /All current notices/); }
      }
      const bad = path.join(artifacts, "malformed-baseline.json"); await fs.writeFile(bad, "not JSON");
      const originalView = await view.evaluate(snapshotBody);
      await click("Load analysis baseline"); await input(bad); await ready();
      assert.match(await view.evaluate("return document.getElementById('details').textContent;"), /Previous comparison retained/);
      // Retry without dismissing a notification: error UI cannot hold a lock.
      await click("Load analysis baseline"); await input(baselinePath); await ready();
      await click("Clear baseline selection (keep file)"); await ready();
      assert.equal(await fs.readFile(baselinePath, "utf8"), baselineBytes);
      await click("Load analysis baseline"); await input(baselinePath); await ready(); await click("Compare selected impact scope"); await ready();
      const after = await view.evaluate(snapshotBody); assert.equal(after.transform, originalView.transform); assert.deepEqual(after.labels, originalView.labels);
      assert.equal(await fs.readFile(cache, "utf8"), JSON.stringify(changed), "Comparison changed the loaded analysis cache");
      await waitFor(async () => {
        const names = (await fs.readdir(path.join(profile, "logs"), { recursive: true })).filter(file => file.endsWith("MATLAB Viz.log"));
        const logs = (await Promise.all(names.map(file => fs.readFile(path.join(profile, "logs", file), "utf8")))).join("\n");
        return logs.includes("Analysis baseline saved:") && logs.includes("Analysis baseline loaded:") && logs.includes("Analysis comparison:") && logs.includes("Export saved:");
      });
      await fs.writeFile(path.join(artifacts, "comparison-expected-view.json"), JSON.stringify(await view.evaluate(snapshotBody)));
      observations.push("Application restart loaded the persisted baseline reference; whole/dependency/impact comparisons, real Markdown/JSON exports, malformed-load recovery without notification dismissal, Clear-without-delete, exact graph preservation and native log checks passed.");
    } else if (stage === "restore-comparison" || stage === "reload-comparison") {
      await ready();
      await waitFor(async () => view.evaluate("return document.getElementById('details').textContent.includes('Scope nodes: 3 → 4');"));
      if (stage === "reload-comparison") {
        const markerPath = path.join(artifacts, "comparison-reload-marker.json"), runId = process.env.MATLAB_VIZ_RESTORE_RUN_ID;
        let marker: any; try { marker = JSON.parse(await fs.readFile(markerPath, "utf8")); } catch { /* First activation. */ }
        if (marker?.runId !== runId) {
          await fs.writeFile(markerPath, JSON.stringify({ runId })); void vscode.commands.executeCommand("workbench.action.reloadWindow"); await new Promise<never>(() => {});
        }
      }
      assert.deepEqual(await view.evaluate(snapshotBody), JSON.parse(await fs.readFile(path.join(artifacts, "comparison-expected-view.json"), "utf8")));
      observations.push(`${stage}: exact selected scope comparison, baseline reference, graph selection and viewport restored; report rebuilt from host-owned files, not saved webview records.`);
    } else throw new Error(`Unknown comparison stage ${stage}`);
    await fs.writeFile(path.join(artifacts, `${stage}-result.json`), JSON.stringify({ passed: true, observations }, null, 2));
  } catch (error) {
    observations.push(error instanceof Error ? error.stack ?? error.message : String(error));
    await fs.writeFile(path.join(artifacts, `${stage}-result.json`), JSON.stringify({ passed: false, observations }, null, 2)); throw error;
  } finally { debug.close(); }
}
