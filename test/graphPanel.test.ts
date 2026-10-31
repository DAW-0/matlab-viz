import assert from "node:assert/strict";
import * as path from "node:path";
import test from "node:test";
import type { DependencyGraph } from "../src/model";
import { loadExtensionModule } from "./support/loadModule";

function panelHarness(pendingTab = false) {
  const created: any[] = [];
  const editorCommands: Array<{ name: string; args: unknown[] }> = [];
  const groups = [{ tabs: [] as any[] }, { tabs: pendingTab ? [{ input: { viewType: "mainThreadWebview-matlabViz.graph" } }] : [] }];
  const tabGroups = { all: groups, activeTabGroup: groups[0] };
  const uri = (fsPath: string) => ({ fsPath, toString: () => fsPath });
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
    vscode: { Uri: { joinPath: (value: { fsPath: string }, ...parts: string[]) => uri(path.join(value.fsPath, ...parts)) },
      ViewColumn: { One: 1 }, commands: { async executeCommand(name: string, ...args: unknown[]) {
        editorCommands.push({ name, args });
        if (name === "workbench.action.focusNextGroup") tabGroups.activeTabGroup = groups[1];
      } }, window: {
        tabGroups,
        createWebviewPanel: () => { const panel = makePanel(1); created.push(panel); return panel; },
        showQuickPick: async () => ({ extension: "svg", visual: true }), showInformationMessage() {}
      } },
    "./configuration": { defaultLayout: () => "grid" }
  });
  const graph: DependencyGraph = { metadata: { schemaVersion: 1, generatedAt: "now", root: "/fixture", mode: "folder", matlabVersion: "test", durationSeconds: 0 },
    nodes: [], edges: [], products: [], problems: [] };
  return { bridge: new module.GraphPanel(uri("/extension"), async () => undefined), graph, created, makePanel, editorCommands };
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
    { name: "workbench.action.openEditorAtIndex", args: [0] }
  ]);
  const restored = makePanel(2);
  bridge.restore(restored, {});
  await restored.receive({ type: "ready" });
  assert.equal(restored.messages[0].graph, graph);
  assert.equal(created.length, 0);
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
