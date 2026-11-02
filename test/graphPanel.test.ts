import assert from "node:assert/strict";
import * as path from "node:path";
import test from "node:test";
import type { DependencyGraph } from "../src/model";
import { loadExtensionModule } from "./support/loadModule";
import { entryPointFixture } from "./support/entryPointFixture";
import { createAnalysisBaseline } from "../src/core/analysisComparison";

function panelHarness(pendingTab = false, activateAfter = 1, shared?: { files: Map<string, Buffer>; preferences: Map<string, unknown> }) {
  const created: any[] = [];
  const writes: Array<{ uri: any; content: string }> = [];
  const saveDialogs: any[] = [];
  const logs: string[] = [];
  const savedPreferences: Array<[string, unknown]> = [];
  const editorCommands: Array<{ name: string; args: unknown[] }> = [];
  const groups = [{ viewColumn: 1, tabs: [] as any[] }, { viewColumn: 2, tabs: pendingTab ? [{ isActive: false, input: { viewType: "mainThreadWebview-matlabViz.graph" } }] : [] }];
  let activeIndex = 0;
  let activationAttempts = 0;
  // The API may expose a different wrapper for the same group. Identity is
  // not a reliable way to recognize the group containing a lazy webview tab.
  const tabGroups = { all: groups, get activeTabGroup() { return { ...groups[activeIndex] }; } };
  const files = shared?.files ?? new Map<string, Buffer>(), preferences = shared?.preferences ?? new Map<string, unknown>();
  const dialog = { openPath: undefined as string | undefined, openGate: undefined as Promise<string | undefined> | undefined,
    cancelSave: false, failWrite: false, statSize: undefined as number | undefined };
  const uri = (fsPath: string) => ({ fsPath, scheme: "file", toString: () => fsPath });
  const makePanel = (column: number) => {
    let receiver: (message: unknown) => unknown;
    let disposed: () => void;
    const panel = { title: "", iconPath: undefined as unknown, viewColumn: column, visible: true, disposed: false,
      reveals: [] as unknown[][], messages: [] as any[],
      webview: { html: "", options: {}, cspSource: "test", asWebviewUri: (value: unknown) => value,
        postMessage(message: unknown) { panel.messages.push(message); return Promise.resolve(true); },
        onDidReceiveMessage(callback: typeof receiver) { receiver = callback; return { dispose() {} }; } },
      onDidDispose(callback: () => void) { disposed = callback; return { dispose() {} }; },
      onDidChangeViewState() { return { dispose() {} }; },
      reveal(...args: unknown[]) { this.reveals.push(args); },
      dispose() { this.disposed = true; disposed?.(); },
      receive(message: unknown) { return receiver?.(message); }
    };
    return panel;
  };
  const module = loadExtensionModule<{ GraphPanel: new (...args: any[]) => any }>("graphPanel.js", {
    "node:fs": { existsSync: () => true },
    vscode: { Uri: { file: uri, parse: uri, joinPath: (value: { fsPath: string }, ...parts: string[]) => uri(path.join(value.fsPath, ...parts)) },
      ViewColumn: { One: 1 }, commands: { async executeCommand(name: string, ...args: unknown[]) {
        editorCommands.push({ name, args });
        if (name === "workbench.action.focusNextGroup") activeIndex = 1;
        if (name === "workbench.action.openEditorAtIndex" && ++activationAttempts >= activateAfter && groups[1]!.tabs[0]) groups[1]!.tabs[0].isActive = true;
      } }, window: {
        tabGroups,
        createWebviewPanel: () => { const panel = makePanel(1); created.push(panel); return panel; },
        showQuickPick: async () => ({ extension: "svg", visual: true }), showInformationMessage() {},
        showSaveDialog: async (options: any) => { saveDialogs.push(options); return dialog.cancelSave ? undefined : uri(path.join("/exports", path.basename(options.defaultUri.fsPath))); },
        showOpenDialog: async () => { const selected = dialog.openGate ? await dialog.openGate : dialog.openPath; return selected ? [uri(selected)] : undefined; },
        showErrorMessage: (message: string) => logs.push(message)
      }, workspace: { fs: {
        writeFile: async (value: any, data: Buffer) => { if (dialog.failWrite) throw new Error("Test disk write failed"); writes.push({ uri: value, content: data.toString("utf8") }); files.set(value.fsPath, Buffer.from(data)); },
        readFile: async (value: any) => { const data = files.get(value.fsPath); if (!data) throw new Error("Test baseline file missing"); return data; },
        stat: async (value: any) => { const data = files.get(value.fsPath); if (!data) throw new Error("Test baseline file missing"); return { size: dialog.statSize ?? data.length }; }
      } } },
    "./configuration": { defaultLayout: () => "grid" }
  });
  const graph: DependencyGraph = { metadata: { schemaVersion: 1, generatedAt: "now", root: "/fixture", mode: "folder", matlabVersion: "test", durationSeconds: 0 },
    nodes: [], edges: [], products: [], problems: [] };
  return { bridge: new module.GraphPanel(uri("/extension"), async () => undefined, {
    state: { get: (key: string) => preferences.get(key), update: async (key: string, value: unknown) => { savedPreferences.push([key, value]); preferences.set(key, value); } },
    output: { appendLine: (line: string) => logs.push(line), error: (line: string) => logs.push(line), warn: (line: string) => logs.push(line) }
  }), graph, created, makePanel, editorCommands, writes, saveDialogs, logs, savedPreferences, files, preferences, dialog };
}

test("cached data does not open a panel until Show is requested", async () => {
  const { bridge, graph, created } = panelHarness();
  bridge.setGraph(graph);
  assert.equal(created.length, 0);
  bridge.show(graph);
  assert.equal(created.length, 1);
  assert.equal(created[0].messages.length, 0, "graph was posted before the webview became ready");
  await created[0].receive({ type: "ready" });
  assert.equal(created[0].messages[0].type, "setGraph");
});

test("Simulink binary navigation delegates to the editor instead of forcing text or running MATLAB", async () => {
  const { bridge, graph, created, editorCommands } = panelHarness(); bridge.update(graph);
  for (const extension of [".slx", ".SLXP", ".sldd"]) {
    const file = path.join("/fixture", `model${extension}`);
    await created[0].receive({ type: "openFile", path: file });
    assert.equal(editorCommands.at(-1)?.name, "vscode.open");
    assert.equal((editorCommands.at(-1)?.args[0] as { fsPath: string }).fsPath, file);
  }
  assert.equal(editorCommands.length, 3);
});

test("unresolved and legacy relative names cannot navigate incidental host files", async () => {
  const { bridge, graph, created, editorCommands } = panelHarness();
  const file = path.resolve("unresolved.slx");
  graph.nodes.push({ id: "unknown", label: "unknown", path: file, relativePath: "unknown", extension: "", kind: "unresolved dependency", unresolved: true, external: false, missing: false });
  bridge.update(graph);
  // existsSync deliberately returns true in this harness: existence alone is
  // not evidence that a native unresolved name has a navigable file location.
  await created[0].receive({ type: "openFile", path: "UnavailableClass.slx" });
  await created[0].receive({ type: "openFile", path: file });
  assert.equal(editorCommands.length, 0);
});

test("failed-attempt status updates do not replace/reveal the graph and success explicitly clears saved status", async () => {
  const { bridge, graph, created } = panelHarness();
  bridge.update(graph); await created[0].receive({ type: "ready" });
  const before = created[0].messages.filter((message: any) => message.type === "setGraph").length;
  bridge.setAnalysisStatus({ kind: "failed", message: "Test failure", occurredAt: "now" });
  assert.equal(created[0].messages.at(-1).type, "analysisStatus");
  assert.equal(created[0].messages.at(-1).status.kind, "failed");
  assert.equal(created[0].messages.filter((message: any) => message.type === "setGraph").length, before);
  assert.equal(created[0].reveals.length, 0);
  bridge.update(graph); assert.equal(created[0].messages.at(-1).status, null);
  bridge.restore(created[0], { version: 1 }); await created[0].receive({ type: "ready" });
  assert.equal(created[0].messages.at(-1).status, null, "late readiness replayed the failure after success");
});

test("external analysis settings navigate to the explicit setting without changing graph visibility or running analysis", async () => {
  const { bridge, graph, created, editorCommands } = panelHarness(); bridge.update(graph);
  await created[0].receive({ type: "externalSettings" });
  assert.equal(editorCommands.at(-1)?.name, "workbench.action.openSettings");
  assert.deepEqual(editorCommands.at(-1)?.args, ["@id:matlabViz.includeExternal"]);
  assert.equal(created[0].messages.length, 0);
});

test("a restored auxiliary panel is adopted without creating or relocating a panel", async () => {
  const { bridge, graph, created, makePanel } = panelHarness();
  const restored = makePanel(7);
  const state = { version: 1, graphKey: "saved", controls: { search: "middle" } };
  bridge.setGraph(graph); bridge.restore(restored, state);
  await restored.receive({ type: "ready" });
  assert.equal(created.length, 0);
  assert.equal(restored.reveals.length, 0);
  assert.equal(restored.messages[0].viewState, state);
  bridge.show(graph);
  assert.deepEqual(restored.reveals, [[]], "Show forced the panel into an explicit column");
  assert.equal(restored.messages.filter((message) => message.type === "setGraph").length, 1);
});

test("Show activates a lazily restored graph tab without creating a duplicate panel", async () => {
  const { bridge, graph, created, makePanel, editorCommands } = panelHarness(true);
  await bridge.show(graph);
  assert.equal(created.length, 0);
  assert.deepEqual(editorCommands, [
    { name: "workbench.action.focusNextGroup", args: [] },
    { name: "workbench.action.focusActiveEditorGroup", args: [] },
    { name: "workbench.action.openEditorAtIndex", args: [0] }
  ]);
  const restored = makePanel(2);
  bridge.restore(restored, {});
  await restored.receive({ type: "ready" });
  assert.equal(restored.messages[0].graph, graph);
  assert.equal(created.length, 0);
});

test("lazy auxiliary Show retries an index command until cross-window focus activates the actual tab", async () => {
  const { bridge, graph, created, editorCommands } = panelHarness(true, 3);
  await bridge.show(graph);
  assert.equal(created.length, 0);
  assert.equal(editorCommands.filter((command) => command.name === "workbench.action.openEditorAtIndex").length, 3);
  assert.equal(editorCommands.filter((command) => command.name === "workbench.action.focusActiveEditorGroup").length, 3);
});

test("showing and exporting an unchanged graph do not reset webview data", async () => {
  const { bridge, graph, created } = panelHarness();
  bridge.show(graph); await created[0].receive({ type: "ready" });
  bridge.show(graph); await bridge.exportGraph();
  assert.equal(created[0].messages.filter((message: any) => message.type === "setGraph").length, 1);
  assert.equal(created[0].messages.at(-1).type, "requestExport");
  assert.deepEqual(created[0].reveals, [[], []]);
});

test("adopting a restored panel safely replaces a transient new panel", async () => {
  const { bridge, graph, created, makePanel } = panelHarness();
  bridge.show(graph);
  const restored = makePanel(3);
  bridge.restore(restored, {});
  assert.equal(created[0].disposed, true);
  await created[0].receive({ type: "ready" });
  assert.equal(restored.messages.length, 0, "a stale panel's ready message affected the new panel");
  await restored.receive({ type: "ready" });
  bridge.update({ ...graph, metadata: { ...graph.metadata, generatedAt: "new" } });
  assert.equal(restored.reveals.length, 0);
  assert.equal(restored.messages.filter((message) => message.type === "setGraph").length, 2);
});

test("entry-point host bridge generates evidence, logs counts, and exports complete reports without revealing/resetting graph", async () => {
  const app = panelHarness(), graph = entryPointFixture(); app.bridge.update(graph);
  const panel = app.created[0]; await panel.receive({ type: "ready" });
  const before = JSON.stringify(graph), key = JSON.stringify(graph.metadata);
  await panel.receive({ type: "entryPointReport", nodeId: "n0", graphKey: key });
  const report = panel.messages.at(-1).report; assert.equal(report.counts.nodes, 3);
  assert.ok(app.logs.some(log => /Entry-point report:.*reachable notices=1, outside=1, unattributed=2/.test(log)));
  for (const format of ["json", "md"]) await panel.receive({ type: "exportEntryPointReport", nodeId: "n0", graphKey: key, format });
  assert.equal(app.writes.length, 2);
  assert.deepEqual(JSON.parse(app.writes[0]!.content), JSON.parse(JSON.stringify(report)));
  assert.match(app.writes[1]!.content, /All analysis notices \(nothing suppressed\)/);
  assert.match(app.saveDialogs[0].defaultUri.fsPath, /scopeEntry-entry-point-report\.json$/);
  assert.match(app.saveDialogs[1].defaultUri.fsPath, /exports/);
  assert.equal(app.savedPreferences.length, 2); assert.ok(app.logs.some(log => /Export saved:/.test(log)));
  assert.equal(JSON.stringify(graph), before);
  assert.equal(panel.messages.filter((message: any) => message.type === "setGraph").length, 1);
  assert.equal(panel.reveals.length, 0);
});

test("stale/invalid entry-point requests cannot export forged graphs or create unsafe filenames", async () => {
  const app = panelHarness(), graph = entryPointFixture(); app.bridge.update(graph); const panel = app.created[0];
  await panel.receive({ type: "exportEntryPointReport", nodeId: "n0", graphKey: "stale", format: "json" });
  await panel.receive({ type: "exportEntryPointReport", nodeId: "unknown", graphKey: JSON.stringify(graph.metadata), format: "json" });
  assert.equal(app.writes.length, 0); assert.equal(panel.messages.at(-1).type, "entryPointReportError");
  assert.match(panel.messages.at(-1).message, /original file node/);
  await panel.receive({ type: "exportEntryPointReport", nodeId: "n0", graphKey: JSON.stringify(graph.metadata), format: "exe" });
  assert.equal(app.writes.length, 0);
});

test("dependency-path host bridge resolves only original reachable links and never invokes MATLAB", async () => {
  const app = panelHarness(), graph = entryPointFixture(), before = JSON.stringify(graph);
  app.bridge.update(graph); const panel = app.created[0], graphKey = JSON.stringify(graph.metadata);
  await panel.receive({ type: "entryPointDependencyPath", graphKey, seedId: "n0", nodeId: "n4", requestId: 1 });
  const response = panel.messages.at(-1);
  assert.equal(response.type, "entryPointDependencyPath"); assert.equal(response.route.hops, 2);
  assert.deepEqual(response.route.edges.map((edge: any) => edge.id), ["entry-leaf", "leaf-input"]);
  assert.ok(app.logs.some(log => /Dependency path:.*No MATLAB execution/.test(log)));
  const count = panel.messages.length;
  await panel.receive({ type: "entryPointDependencyPath", graphKey: "stale", seedId: "n0", nodeId: "n4", requestId: 2 });
  await panel.receive({ type: "entryPointDependencyPath", graphKey, seedId: "n0", nodeId: "n4", requestId: 0 });
  assert.equal(panel.messages.length, count, "stale or malformed requests were answered");
  await panel.receive({ type: "entryPointDependencyPath", graphKey, seedId: "n0", nodeId: "n3", requestId: 3 });
  assert.equal(panel.messages.at(-1).type, "entryPointDependencyPathError");
  assert.match(panel.messages.at(-1).message, /outside this entry-point report scope/);
  assert.equal(JSON.stringify(graph), before); assert.equal(app.writes.length, 0);
});

test("impact host bridge logs reverse scope, exports both reports and preserves original graph data", async () => {
  const app = panelHarness(), graph = entryPointFixture(), before = JSON.stringify(graph);
  app.bridge.update(graph); const panel = app.created[0], graphKey = JSON.stringify(graph.metadata);
  await panel.receive({ type: "impactReport", graphKey, nodeId: "n4" });
  const report = panel.messages.at(-1).report;
  assert.equal(panel.messages.at(-1).type, "impactReport"); assert.equal(report.counts.totalDependents, 2);
  assert.ok(app.logs.some(log => /Impact report:.*Direct dependents=1, total dependents=2.*No MATLAB execution/.test(log)));
  for (const format of ["json", "md"]) await panel.receive({ type: "exportImpactReport", graphKey, nodeId: "n4", format });
  assert.equal(JSON.parse(app.writes[0]!.content).kind, "file-impact");
  assert.match(app.writes[1]!.content, /MATLAB Viz file impact report/);
  assert.match(app.saveDialogs[0].defaultUri.fsPath, /MissingInput-impact-report\.json$/);
  await panel.receive({ type: "impactDependencyPath", graphKey, seedId: "n4", nodeId: "n0", requestId: 1 });
  const route = panel.messages.at(-1).route;
  assert.deepEqual(route.nodes.map((node: any) => node.id), ["n0", "n1", "n4"]);
  assert.deepEqual(route.edges.map((edge: any) => [edge.source, edge.target]), [["n0", "n1"], ["n1", "n4"]]);
  const count = panel.messages.length;
  await panel.receive({ type: "impactReport", graphKey: "stale", nodeId: "n4" });
  assert.equal(panel.messages.length, count);
  await panel.receive({ type: "impactDependencyPath", graphKey, seedId: "n4", nodeId: "n3", requestId: 2 });
  assert.equal(panel.messages.at(-1).type, "impactDependencyPathError");
  await panel.receive({ type: "impactReport", graphKey, nodeId: "unknown" });
  assert.equal(panel.messages.at(-1).type, "impactReportError");
  assert.equal(JSON.stringify(graph), before); assert.equal(panel.reveals.length, 0);
});

test("baseline host saves complete originals, persists selection, compares and exports exact host snapshots", async () => {
  const app = panelHarness(), graph = entryPointFixture(), original = JSON.stringify(graph); app.bridge.update(graph);
  const panel = app.created[0], graphKey = JSON.stringify(graph.metadata);
  await panel.receive({ type: "comparisonAction", action: "save", graphKey, requestId: 1 });
  const baselinePath = app.preferences.get("comparisonBaselineUri") as string;
  assert.ok(baselinePath.endsWith("fixture-analysis-baseline.json"));
  assert.equal(JSON.parse(app.files.get(baselinePath)!.toString()).graph.nodes.length, 6);
  assert.ok(app.logs.some(log => /Analysis baseline saved:.*Complete original analysis/.test(log)));
  await panel.receive({ type: "comparisonAction", action: "compare", scope: "dependencies", nodeId: "n0", graphKey, requestId: 2 });
  const result = panel.messages.at(-1).result;
  assert.equal(result.report.nodes.unchanged, 6); assert.equal(result.report.scope.beforeNodes, 3);
  // A later on-disk edit must not silently change the already displayed export.
  app.files.set(baselinePath, Buffer.from("not json now"));
  for (const format of ["md", "json"]) await panel.receive({ type: "comparisonAction", action: "export", format, comparisonId: result.id, graphKey, requestId: 3 });
  assert.match(app.writes.at(-2)!.content, /MATLAB Viz analysis comparison/);
  assert.deepEqual(JSON.parse(app.writes.at(-1)!.content), result.report);
  assert.equal(JSON.stringify(graph), original); assert.equal(panel.reveals.length, 0);
  const reopened = panelHarness(false, 1, app); reopened.bridge.update(graph);
  await reopened.created[0].receive({ type: "comparisonAction", action: "info", graphKey, requestId: 1 });
  assert.equal(reopened.created[0].messages.at(-1).baselinePath, baselinePath);
});

test("invalid/missing/oversize baselines, wrong roots and cancellation preserve graph and release operation lock", async () => {
  const app = panelHarness(), graph = entryPointFixture(), original = JSON.stringify(graph); app.bridge.update(graph);
  const panel = app.created[0], graphKey = JSON.stringify(graph.metadata), file = path.join("/exports", "baseline.json");
  app.dialog.openPath = file;
  for (const bytes of ["bad json", JSON.stringify(graph), JSON.stringify(createAnalysisBaseline(entryPointFixture("/other")))]) {
    app.files.set(file, Buffer.from(bytes));
    await panel.receive({ type: "comparisonAction", action: "load", graphKey, requestId: 1 });
    assert.ok(panel.messages.at(-1).error); assert.equal(app.preferences.get("comparisonBaselineUri"), undefined);
  }
  app.files.set(file, Buffer.from(JSON.stringify(createAnalysisBaseline(graph)))); app.dialog.statSize = 65 * 1024 * 1024;
  await panel.receive({ type: "comparisonAction", action: "load", graphKey, requestId: 2 }); assert.match(panel.messages.at(-1).error, /64 MiB/);
  app.dialog.statSize = undefined;
  await panel.receive({ type: "comparisonAction", action: "load", graphKey, requestId: 3 });
  assert.equal(panel.messages.at(-1).error, undefined); assert.equal(app.preferences.get("comparisonBaselineUri"), file);
  app.dialog.cancelSave = true;
  await panel.receive({ type: "comparisonAction", action: "save", graphKey, requestId: 4 }); assert.equal(app.preferences.get("comparisonBaselineUri"), file);
  app.files.delete(file);
  await panel.receive({ type: "comparisonAction", action: "compare", graphKey, requestId: 5 }); assert.match(panel.messages.at(-1).error, /missing/);
  app.files.set(file, Buffer.from(JSON.stringify(createAnalysisBaseline(graph))));
  await panel.receive({ type: "comparisonAction", action: "compare", graphKey, requestId: 6 }); assert.ok(panel.messages.at(-1).result);
  const count = panel.messages.length;
  await panel.receive({ type: "comparisonAction", action: "clear", graphKey: "stale", requestId: 7 }); assert.equal(panel.messages.length, count);
  await panel.receive({ type: "comparisonAction", action: "clear", graphKey, requestId: 8 });
  assert.equal(app.preferences.get("comparisonBaselineUri"), undefined); assert.ok(app.files.has(file), "Clear must not delete a user's baseline file");
  assert.equal(JSON.stringify(graph), original);
});

test("new analysis invalidates comparison exports", async () => {
  const app = panelHarness(), graph = entryPointFixture(); app.bridge.update(graph);
  const panel = app.created[0], graphKey = JSON.stringify(graph.metadata);
  await panel.receive({ type: "comparisonAction", action: "save", graphKey, requestId: 1 });
  await panel.receive({ type: "comparisonAction", action: "compare", graphKey, requestId: 2 });
  const id = panel.messages.at(-1).result.id;
  const current = structuredClone(graph); current.metadata.generatedAt = "new"; app.bridge.setGraph(current);
  await panel.receive({ type: "comparisonAction", action: "export", graphKey: JSON.stringify(current.metadata), requestId: 3, comparisonId: id, format: "json" });
  assert.match(panel.messages.at(-1).error, /no longer current/);
});

test("overlapping operations and graph changes during a baseline dialog cannot adopt stale baseline state", async () => {
  const app = panelHarness(), graph = entryPointFixture(); app.bridge.update(graph);
  const panel = app.created[0], graphKey = JSON.stringify(graph.metadata), file = path.join("/exports", "baseline.json");
  app.files.set(file, Buffer.from(JSON.stringify(createAnalysisBaseline(graph))));
  let finish: (value: string) => void = () => undefined;
  app.dialog.openGate = new Promise(resolve => { finish = resolve; });
  const pending = panel.receive({ type: "comparisonAction", action: "load", graphKey, requestId: 1 });
  await panel.receive({ type: "comparisonAction", action: "info", graphKey, requestId: 2 });
  assert.match(panel.messages.at(-1).error, /already in progress/);
  const current = structuredClone(graph); current.metadata.generatedAt = "new-during-dialog"; app.bridge.setGraph(current);
  const count = panel.messages.length; finish(file); await pending;
  assert.equal(panel.messages.length, count); assert.equal(app.preferences.get("comparisonBaselineUri"), undefined);
  app.dialog.openGate = undefined; app.dialog.openPath = file;
  await panel.receive({ type: "comparisonAction", action: "load", graphKey: JSON.stringify(current.metadata), requestId: 3 });
  assert.equal(panel.messages.at(-1).error, undefined, "operation lock was not released");
});

test("baseline write errors preserve selection and permit retry without awaiting error dismissal", async () => {
  const app = panelHarness(), graph = entryPointFixture(); app.bridge.update(graph);
  const panel = app.created[0], graphKey = JSON.stringify(graph.metadata);
  app.dialog.failWrite = true;
  await panel.receive({ type: "comparisonAction", action: "save", graphKey, requestId: 1 });
  assert.match(panel.messages.at(-1).error, /disk write failed/); assert.equal(app.preferences.get("comparisonBaselineUri"), undefined);
  app.dialog.failWrite = false;
  await panel.receive({ type: "comparisonAction", action: "save", graphKey, requestId: 2 });
  assert.equal(panel.messages.at(-1).error, undefined); assert.ok(app.preferences.get("comparisonBaselineUri"));
});
