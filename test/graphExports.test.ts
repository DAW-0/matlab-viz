import assert from "node:assert/strict";
import * as path from "node:path";
import test from "node:test";
import { loadExtensionModule } from "./support/loadModule";

function harness(saved = new Map<string, unknown>()) {
  const choices: any[] = [], destinations: any[] = [], dialogs: any[] = [], messages: any[] = [];
  const files = new Map<string, Buffer>(), logs: string[] = [], errors: string[] = [];
  let failure = false, receiver: any;
  const uri = (fsPath: string): any => ({ fsPath, scheme: "file", toString: () => fsPath });
  const module = loadExtensionModule<any>("graphPanel.js", {
    vscode: { Uri: { file: uri, parse: uri, joinPath: (base: any, ...parts: string[]) => uri(path.join(base.fsPath, ...parts)) },
      ViewColumn: { One: 1 }, workspace: { fs: { async writeFile(destination: any, data: Buffer) {
        if (failure) throw new Error("disk unavailable"); files.set(destination.fsPath, data);
      } } }, window: {
        showQuickPick: async () => choices.shift(),
        showSaveDialog: async (options: any) => { dialogs.push(options); return destinations.shift(); },
        showInformationMessage() {}, showErrorMessage: (message: string) => errors.push(message),
        createWebviewPanel: () => ({ reveal() {}, onDidDispose() {}, onDidChangeViewState() {},
          webview: { asWebviewUri: (value: any) => value, options: {}, html: "", cspSource: "test",
            onDidReceiveMessage: (callback: any) => { receiver = callback; }, postMessage: async (message: any) => { messages.push(message); return true; } } })
      } }, "./configuration": { defaultLayout: () => "grid" }
  });
  const bridge = new module.GraphPanel(uri("/extension"), async () => undefined, {
    state: { get: (key: string) => saved.get(key), update: async (key: string, value: unknown) => saved.set(key, value) },
    output: { appendLine: (value: string) => logs.push(value), warn: (value: string) => logs.push(value), error: (value: string) => logs.push(value) }
  });
  bridge.setGraph({ metadata: { root: "/repo", schemaVersion: 1, generatedAt: "now", mode: "folder", durationSeconds: 0 }, nodes: [], edges: [], products: [], problems: [] });
  return { bridge, choices, destinations, dialogs, files, logs, errors, messages, saved, uri,
    receive: (message: any) => receiver(message), failWrites: () => { failure = true; } };
}

test("visual exports choose graph/viewport framing and PNG resolution and wait for webview readiness", async () => {
  const view = harness();
  view.choices.push({ extension: "png", visual: true }, { value: "graph" }, { value: 4 });
  await view.bridge.exportGraph();
  assert.equal(view.messages.length, 0);
  await view.receive({ type: "ready" });
  assert.deepEqual(view.messages.map((item) => item.type), ["setGraph", "requestExport"]);
  assert.equal(view.messages[1].scope, "graph"); assert.equal(view.messages[1].scale, 4);
  assert.ok(view.logs.some((line) => line.includes("scope=graph, scale=4")));
});

test("successful data and visual saves remember a shared destination across panel instances", async () => {
  const view = harness();
  view.choices.push({ extension: "json" }); view.destinations.push(view.uri("/downloads/saved.json"));
  await view.bridge.exportGraph();
  assert.ok(view.files.has(path.join("/downloads", "saved.json")) || view.files.has("/downloads/saved.json"));
  assert.equal(view.saved.get("exportDirectory"), path.join("/downloads"));
  const next = harness(view.saved); await next.bridge.show();
  next.destinations.push(next.uri("/downloads/figure.png"));
  await next.receive({ type: "saveVisual", format: "png", data: "data:image/png;base64,aGVsbG8=", width: 100, height: 50, nodes: 2, edges: 1, scope: "graph" });
  assert.equal(next.dialogs[0].defaultUri.fsPath, path.join("/downloads", "repo-dependencies.png"));
  assert.equal(next.files.get("/downloads/figure.png")?.toString(), "hello");
  assert.ok(next.logs.some((line) => line.includes("pixels=100x50")));
  assert.ok(next.logs.some((line) => line.includes("PNG, 5 bytes")));
});

test("cancelled and failed exports do not replace the last successful destination", async () => {
  const saved = new Map<string, unknown>([["exportDirectory", "/previous"]]);
  const view = harness(saved); view.choices.push({ extension: "json" });
  await view.bridge.exportGraph();
  assert.equal(view.files.size, 0); assert.equal(saved.get("exportDirectory"), "/previous");
  view.failWrites(); view.choices.push({ extension: "csv" }); view.destinations.push(view.uri("/failed/result.csv"));
  await view.bridge.exportGraph();
  assert.equal(saved.get("exportDirectory"), "/previous");
  assert.ok(view.errors.some((message) => message.includes("disk unavailable")));
  assert.ok(view.logs.some((line) => line.includes("Export failed")));
  await view.bridge.show(); await view.receive({ type: "exportError", message: "PNG too large; choose SVG" });
  assert.ok(view.errors.some((message) => message.includes("choose SVG")));
});

test("cancelling the visual framing or resolution picker never requests an export", async () => {
  for (const choices of [[{ extension: "svg", visual: true }], [{ extension: "png", visual: true }, { value: "graph" }]]) {
    const view = harness(); view.choices.push(...choices);
    await view.bridge.exportGraph();
    assert.equal(view.messages.length, 0); assert.equal(view.dialogs.length, 0); assert.equal(view.files.size, 0);
  }
});
