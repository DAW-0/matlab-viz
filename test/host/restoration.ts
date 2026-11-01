import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { validateGraph, type DependencyGraph } from "../../src/model";
import { DebugWebview, snapshotBody } from "./debugWebview";

/** Multi-launch real-editor tests. Each phase leaves its graph for the next launch. */
export async function run(): Promise<void> {
  const artifacts = process.env.MATLAB_VIZ_TEST_ARTIFACTS;
  const profile = process.env.MATLAB_VIZ_HOST_PROFILE;
  const fixtures = process.env.MATLAB_VIZ_HOST_FIXTURES;
  const stage = process.env.MATLAB_VIZ_RESTORE_STAGE;
  const endpoint = process.env.MATLAB_VIZ_DEBUG_ENDPOINT;
  assert.ok(artifacts && profile && fixtures && stage && endpoint, "Restoration host environment is incomplete");
  const project = path.join(fixtures, "project");
  const storage = path.join(profile, "User", "workspaceStorage");
  const debug = new DebugWebview(endpoint);
  const observations: string[] = [];
  const log = (message: string) => { observations.push(message); console.log(`[MATLAB Viz restoration] ${message}`); };
  async function cached(): Promise<DependencyGraph> {
    for (const item of await fs.readdir(storage, { withFileTypes: true })) {
      if (!item.isDirectory()) continue;
      try { return validateGraph(JSON.parse(await fs.readFile(path.join(storage, item.name, "daw-0.matlab-viz", "last-graph.json"), "utf8"))); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    throw new Error("Graph cache missing");
  }
  async function waitFor(predicate: () => Promise<boolean>, timeout = 15_000): Promise<void> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try { if (await predicate()) return; } catch (error) {
        if ((error as Error).message !== "Graph cache missing" && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Expected graph update did not finish");
  }
  async function select(file: string, word: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument(path.join(project, file));
    const offset = document.getText().indexOf(word);
    assert.ok(offset >= 0);
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const position = document.positionAt(offset);
    editor.selection = new vscode.Selection(position, position);
  }
  const provider = vscode.languages.registerReferenceProvider({ scheme: "file", pattern: "**/*.m" }, {
    provideReferences(document, position) {
      const range = document.getWordRangeAtPosition(position);
      if (!range || document.getText(range) !== "value") return [];
      return [...document.getText().matchAll(/\bvalue\b/g)].map((match) => {
        const start = document.positionAt(match.index!);
        return new vscode.Location(document.uri, new vscode.Range(start, start.translate(0, 5)));
      });
    }
  });
  try {
    const config = vscode.workspace.getConfiguration("matlabViz");
    if (stage === "prepare-call") {
      for (const [name, value] of Object.entries({ watchFiles: false, includeExternal: false, "symbols.maximumDepth": 1 })) {
        await config.update(name, value, vscode.ConfigurationTarget.Global);
      }
      await vscode.workspace.getConfiguration("window").update("restoreWindows", "preserve", vscode.ConfigurationTarget.Global);
      await select("entry.m", "entry");
      await vscode.commands.executeCommand("matlabViz.showCallees");
      // An existing tab can be behind the source editor. Analysis deliberately
      // updates it without stealing focus; show it before waiting on paint RAFs.
      await vscode.commands.executeCommand("matlabViz.showGraph");
      const first = await cached(); assert.equal(first.metadata.analysisDepth, 1);
      const view = await debug.graph();
      await view.evaluate("const depth=document.getElementById('depth');depth.value='2';depth.dispatchEvent(new Event('change'));document.getElementById('refresh').click();return true;");
      await waitFor(async () => (await cached()).metadata.analysisDepth === 2);
      assert.equal((await cached()).nodes.length, 3);
      const commands = await vscode.commands.getCommands(true);
      assert.ok(commands.includes("workbench.action.moveEditorToNewWindow"), "Editor lacks auxiliary-window command");
      await vscode.commands.executeCommand("matlabViz.showGraph");
      const current = await debug.graph();
      if (current.pageUrl !== "about:blank" && !/auxiliary/i.test(current.pageUrl)) {
        await vscode.commands.executeCommand("workbench.action.moveEditorToNewWindow");
      }
      const detached = await debug.graph(20_000, true);
      log(`Detached graph page: ${detached.pageUrl}`);
      assert.ok(detached.pageUrl === "about:blank" || /auxiliary/i.test(detached.pageUrl), "Graph did not move into an auxiliary window");
      await detached.evaluate(`
        const divider=document.getElementById('details-resizer');
        for(let i=0;i<3;i++)divider.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',shiftKey:true,bubbles:true,cancelable:true}));
        const node=[...document.querySelectorAll('#graph g.node')].find(node=>node.textContent.includes('middle.m#middle:'));
        if(!node)throw new Error('Middle node absent');node.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        for(const [id,value] of [['direction','dependencies'],['layout','grid']]){const element=document.getElementById(id);element.value=value;element.dispatchEvent(new Event('change'));}
        document.getElementById('search').value='leaf';document.getElementById('search').dispatchEvent(new Event('input'));
        document.getElementById('external').checked=false;document.getElementById('isolated').checked=false;
        document.getElementById('isolated').dispatchEvent(new Event('change'));
        const svg=document.getElementById('graph'),rect=svg.getBoundingClientRect();svg.dispatchEvent(new WheelEvent('wheel',{clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,deltaY:-200,cancelable:true}));
        return true;`);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const snapshot = await detached.evaluate(snapshotBody);
      assert.equal(snapshot.detailsWidth, "430px");
      assert.equal(snapshot.labels.length, 2);
      await fs.writeFile(path.join(artifacts, "expected-call-view.json"), JSON.stringify({ snapshot, pageUrl: detached.pageUrl }, null, 2));
      log("Prepared outgoing graph, depth 2, filtered selection, grid layout, search, and custom zoom in auxiliary window");
    } else if (stage === "restore-call") {
      const before = await cached();
      // First command after activation must wait for the cache and reuse the panel.
      await vscode.commands.executeCommand("matlabViz.showGraph");
      const view = await debug.graph();
      const expected = JSON.parse(await fs.readFile(path.join(artifacts, "expected-call-view.json"), "utf8"));
      assert.ok(view.pageUrl === "about:blank" || /auxiliary/i.test(view.pageUrl), "Restored graph was docked in the main window");
      assert.deepEqual(await view.evaluate(snapshotBody), expected.snapshot);
      assert.equal((await cached()).metadata.generatedAt, before.metadata.generatedAt, "Show ran a new analysis");
      log("First Show restored cached graph and exact controls/selection/viewport in the auxiliary window without analysis");
      await select("isolated.m", "isolated");
      await vscode.commands.executeCommand("matlabViz.refresh");
      const refreshed = await cached();
      assert.equal(refreshed.metadata.graphType, "call-hierarchy");
      assert.equal(refreshed.metadata.rootSymbol, "entry");
      assert.equal(refreshed.metadata.analysisDepth, 2);
      assert.equal(refreshed.metadata.analysisTarget?.type, "call-hierarchy");
      if (refreshed.metadata.analysisTarget?.type === "call-hierarchy") assert.equal(refreshed.metadata.analysisTarget.direction, "outgoing");
      assert.equal(refreshed.nodes.length, 3);
      assert.equal(await view.evaluate("return document.getElementById('graph-main').style.getPropertyValue('--details-width');"), "430px");
      log("Refresh after restart preserved original function, outgoing direction, and depth despite a different editor cursor");
    } else if (stage === "prepare-reference") {
      await select("leaf.m", "value");
      await vscode.commands.executeCommand("matlabViz.traceSymbolReferences");
      const result = await cached(); assert.equal(result.metadata.graphType, "references");
      assert.equal(result.nodes.length, 2); assert.equal(result.edges.length, 1);
      await vscode.commands.executeCommand("matlabViz.showGraph");
      const view = await debug.graph();
      await view.evaluate(`const divider=document.getElementById('details-resizer');divider.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
        divider.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',shiftKey:true,bubbles:true,cancelable:true}));
        const edge=document.querySelector('#graph line.edge');edge.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        const svg=document.getElementById('graph'),rect=svg.getBoundingClientRect();svg.dispatchEvent(new WheelEvent('wheel',{clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,deltaY:-100,cancelable:true}));return true;`);
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(await view.evaluate("return document.getElementById('graph-main').style.getPropertyValue('--details-width');"), "330px");
      await fs.writeFile(path.join(artifacts, "expected-reference-view.json"), JSON.stringify(await view.evaluate(snapshotBody), null, 2));
      log("Prepared a variable reference graph with a selected reference edge");
    } else if (stage === "restore-reference") {
      const before = await cached();
      await vscode.commands.executeCommand("matlabViz.showGraph");
      const view = await debug.graph();
      assert.deepEqual(await view.evaluate(snapshotBody), JSON.parse(await fs.readFile(path.join(artifacts, "expected-reference-view.json"), "utf8")));
      assert.equal((await cached()).metadata.generatedAt, before.metadata.generatedAt);
      await select("isolated.m", "isolated");
      await vscode.commands.executeCommand("matlabViz.refresh");
      const refreshed = await cached();
      assert.equal(refreshed.metadata.graphType, "references");
      assert.equal(refreshed.metadata.rootSymbol, "value");
      assert.equal(refreshed.nodes.length, 2); assert.equal(refreshed.edges.length, 1);
      assert.ok(refreshed.edges[0]?.details?.includes("1, 2"));
      assert.equal(refreshed.metadata.analysisTarget?.type, "references");
      log("Reference graph, selected edge/details, and original variable anchor survived restart and Refresh");
    } else if (stage === "reload-call" || stage === "reload-reference") {
      const markerPath = path.join(artifacts, `${stage}-inflight.json`);
      const runId = process.env.MATLAB_VIZ_RESTORE_RUN_ID;
      let marker: any;
      try { marker = JSON.parse(await fs.readFile(markerPath, "utf8")); } catch { /* First execution of this phase. */ }
      if (!marker || marker.runId !== runId) {
        await vscode.commands.executeCommand("matlabViz.showGraph");
        const view = await debug.graph();
        await view.evaluate(`const svg=document.getElementById('graph'),rect=svg.getBoundingClientRect();svg.dispatchEvent(new WheelEvent('wheel',{clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,deltaY:-100,cancelable:true}));return true;`);
        await new Promise((resolve) => setTimeout(resolve, 200));
        const before = await cached();
        await fs.writeFile(markerPath, JSON.stringify({ runId, generatedAt: before.metadata.generatedAt, snapshot: await view.evaluate(snapshotBody) }, null, 2));
        log("Invoking actual Reload Window while the detached graph remains open");
        void vscode.commands.executeCommand("workbench.action.reloadWindow");
        // The new extension host reactivates this startup runner. Do not quit
        // the application while the renderer/extension host is being replaced.
        await new Promise<never>(() => {});
      }
      log(`Tabs before first Show after reload: ${JSON.stringify(vscode.window.tabGroups.all.map((group) => ({ id: group.viewColumn, active: group.isActive,
        tabs: group.tabs.map((tab) => ({ label: tab.label, active: tab.isActive, viewType: (tab.input as vscode.TabInputWebview).viewType })) })))}`);
      await vscode.commands.executeCommand("matlabViz.showGraph");
      const restored = await debug.graph(20_000, true);
      assert.ok(restored.pageUrl === "about:blank" || /auxiliary/i.test(restored.pageUrl));
      assert.deepEqual(await restored.evaluate(snapshotBody), marker.snapshot);
      assert.equal((await cached()).metadata.generatedAt, marker.generatedAt);
      await select("isolated.m", "isolated");
      await vscode.commands.executeCommand("matlabViz.refresh");
      const refreshed = await cached();
      assert.equal(refreshed.metadata.graphType, stage === "reload-call" ? "call-hierarchy" : "references");
      assert.equal(refreshed.metadata.rootSymbol, stage === "reload-call" ? "entry" : "value");
      if (stage === "reload-call") {
        assert.equal(refreshed.metadata.analysisDepth, 2);
        assert.equal(refreshed.nodes.length, 3);
      } else {
        assert.equal(refreshed.nodes.length, 2); assert.equal(refreshed.edges.length, 1);
      }
      log("Actual Reload Window preserved the detached graph, exact view, and Refresh target without a first-command race");
    } else if (stage === "provider-timeout") {
      const previousTimeout = config.get<number>("symbols.requestTimeoutSeconds", 20);
      const previousDepth = config.get<number>("symbols.maximumDepth", 3);
      const hung = vscode.languages.registerDefinitionProvider({ scheme: "file", pattern: "**/*.m" }, {
        provideDefinition() { return new Promise<never>(() => {}); }
      });
      try {
        await config.update("symbols.requestTimeoutSeconds", 1, vscode.ConfigurationTarget.Global);
        await config.update("symbols.maximumDepth", 2, vscode.ConfigurationTarget.Global);
        await select("entry.m", "entry");
        const started = Date.now();
        await vscode.commands.executeCommand("matlabViz.showCallees");
        const limited = await cached();
        assert.ok(Date.now() - started < 10_000, "Hung provider exceeded the bounded analysis window");
        assert.equal(limited.metadata.graphType, "call-hierarchy");
        assert.equal(limited.nodes.length, 1);
        assert.ok(limited.problems.some((problem) => /timed out after 1 seconds/.test(problem.message)));
        log("A deliberately hung real editor Definition provider stopped at its one-second request limit and generated an explicit warning");
      } finally {
        hung.dispose();
        await config.update("symbols.requestTimeoutSeconds", previousTimeout, vscode.ConfigurationTarget.Global);
        await config.update("symbols.maximumDepth", previousDepth, vscode.ConfigurationTarget.Global);
      }
      await vscode.commands.executeCommand("matlabViz.refresh");
      const recovered = await cached();
      assert.equal(recovered.nodes.length, 3); assert.equal(recovered.edges.length, 2);
      assert.equal(recovered.problems.length, 0);
      log("Refresh recovered the complete graph after removing the hung provider, without dismissing its warning notification");
    } else throw new Error(`Unknown restoration phase: ${stage}`);
    await fs.writeFile(path.join(artifacts, `${stage}-result.json`), JSON.stringify({ passed: true, observations }, null, 2));
  } catch (error) {
    log(`Tabs at failure: ${JSON.stringify(vscode.window.tabGroups.all.map((group) => ({ column: group.viewColumn, active: group.isActive,
      tabs: group.tabs.map((tab) => ({ label: tab.label, active: tab.isActive, viewType: (tab.input as vscode.TabInputWebview).viewType })) })))}`);
    try {
      const workbench = await debug.workbench();
      const shot = await workbench.request("Page.captureScreenshot", { format: "png" });
      await fs.writeFile(path.join(artifacts, `${stage}-failure.png`), Buffer.from(shot.data, "base64"));
    } catch { /* Preserve the original failure. */ }
    log(error instanceof Error ? error.stack ?? error.message : String(error));
    await fs.writeFile(path.join(artifacts, `${stage}-result.json`), JSON.stringify({ passed: false, observations }, null, 2));
    throw error;
  } finally {
    debug.close(); provider.dispose();
    await fs.writeFile(path.join(artifacts, `${stage}.log`), observations.join("\n") + "\n");
  }
}
