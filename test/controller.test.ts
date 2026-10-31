import assert from "node:assert/strict";
import * as path from "node:path";
import test from "node:test";
import type { DependencyGraph } from "../src/model";
import { cancellationToken, loadExtensionModule, TestCancellationError } from "./support/loadModule";

function graph(root: string, type: "files" | "call-hierarchy" | "references" = "files"): DependencyGraph {
  return {
    metadata: { schemaVersion: 1, generatedAt: "2026-10-31", root, mode: type === "files" ? "folder" : "language-service", graphType: type, matlabVersion: "test", durationSeconds: 0 },
    nodes: [{ id: "a", label: "a.m", path: path.join(root, "a.m"), relativePath: "a.m", extension: ".m", kind: "MATLAB code", external: false, missing: false }],
    edges: [], products: [], problems: []
  };
}

function controllerHarness(options: { cachedGraph?: DependencyGraph; badCache?: string; readGate?: Promise<void>;
  files?: Map<string, Uint8Array>; failCacheWrites?: boolean; graphProblems?: DependencyGraph["problems"] } = {}) {
  const commands = new Map<string, (...args: any[]) => Promise<void> | void>();
  const log: string[] = [];
  const errors: string[] = [];
  const information: string[] = [], warnings: string[] = [];
  const notices: Array<(action?: string) => void> = [];
  const calls: string[] = [];
  const symbolCalls: Array<{ direction?: string; depth?: number; seed?: any; anchor?: any }> = [];
  const restorations: unknown[] = [];
  let serializer: any;
  let showCount = 0;
  const panel = { graph: undefined as DependencyGraph | undefined, update(value: DependencyGraph) { this.graph = value; },
    setGraph(value: DependencyGraph) { this.graph = value; }, show(value?: DependencyGraph) { if (value) this.graph = value; showCount++; },
    restore(value: unknown) { restorations.push(value); }, showUnavailable() {}, exportGraph() {}, showProblems() {} };
  const status = { text: "", show() {} };
  let failure: Error | undefined;
  let outputShown = 0;
  const token = cancellationToken();
  const disposable = { dispose() {} };
  const fileUri = (fsPath: string) => ({ fsPath, scheme: "file" });
  class Position { constructor(public line: number, public character: number) {} }
  class Range {
    public start: Position; public end: Position;
    constructor(a: number, b: number, c: number, d: number) { this.start = new Position(a, b); this.end = new Position(c, d); }
  }
  const files = options.files ?? new Map<string, Uint8Array>();
  const cache = path.join("/cache", "last-graph.json");
  if (options.cachedGraph) files.set(cache, Buffer.from(JSON.stringify(options.cachedGraph)));
  if (options.badCache) files.set(cache, Buffer.from(options.badCache));
  const seed = { name: "original", kind: 12, uri: fileUri("/symbol/original.m"),
    range: new Range(0, 0, 4, 0), selectionRange: new Range(0, 20, 0, 28) };
  const renameCache = async (from: string, to: string) => {
    const data = files.get(from); assert.ok(data); files.set(to, data); files.delete(from);
  };
  const adapters = {
    "node:fs/promises": { rename: renameCache },
    vscode: {
      CancellationError: TestCancellationError,
      Position, Range,
      Uri: { file: fileUri, joinPath: (uri: { fsPath: string }, ...parts: string[]) => fileUri(path.join(uri.fsPath, ...parts)) },
      FileType: { Directory: 2 }, StatusBarAlignment: { Left: 1 }, ProgressLocation: { Notification: 1 },
      window: {
        createOutputChannel: () => ({ appendLine: (s: string) => log.push(s), error: (s: string) => errors.push(s), show: () => { outputShown++; } }),
        createStatusBarItem: () => status, registerWebviewViewProvider: () => disposable,
        registerWebviewPanelSerializer: (_type: string, value: unknown) => { serializer = value; return disposable; },
        withProgress: (_options: unknown, action: (progress: unknown, token: unknown) => Promise<void>) => action({ report() {} }, token),
        showErrorMessage: (message: string) => { errors.push(message); return new Promise<string | undefined>((resolve) => notices.push(resolve)); },
        showWarningMessage: async (s: string) => { warnings.push(s); return undefined; },
        showInformationMessage: async (s: string) => { log.push(s); information.push(s); return undefined; }
      },
      commands: { registerCommand: (name: string, action: (...args: any[]) => Promise<void> | void) => { commands.set(name, action); return disposable; } },
      workspace: {
        fs: { stat: async () => ({ type: 2 }), createDirectory: async () => undefined,
          writeFile: async (uri: { fsPath: string }, data: Uint8Array) => {
            if (options.failCacheWrites) throw new Error("Disk full");
            files.set(uri.fsPath, data);
          },
          rename: async (from: { fsPath: string }, to: { fsPath: string }) => {
            await renameCache(from.fsPath, to.fsPath);
          },
          readFile: async (uri: { fsPath: string }) => {
            await options.readGate;
            const data = files.get(uri.fsPath);
            if (!data) throw Object.assign(new Error("No cached graph"), { code: "FileNotFound" });
            return data;
          } },
        getConfiguration: () => ({ get: () => false }), onDidChangeConfiguration: () => disposable
      }
    },
    "./configuration": { readAnalysisOptions: () => ({}), readSymbolAnalysisOptions: () => ({ maximumDepth: 3 }) },
    "./graphPanel": { GraphPanel: class { constructor() { return panel; } }, SidebarProvider: class { setGraph() {} } },
    "./matlabRunner": { runMatlabAnalysis: async (root: string) => { calls.push(root); if (failure) throw failure; const value = graph(root); value.problems = options.graphProblems ?? []; return { graph: value }; } },
    "./symbolAnalyzer": { SymbolAnalyzer: class {
      async analyzeCallHierarchy(direction: string, options: { maximumDepth: number }, _token: unknown, previous?: unknown) {
        symbolCalls.push({ direction, depth: options.maximumDepth, seed: previous });
        if (failure) throw failure;
        const value = graph("/symbol", "call-hierarchy"); value.metadata.analysisDepth = options.maximumDepth;
        return { graph: value, seed: previous ?? seed };
      }
      async analyzeReferences(_options: unknown, _token: unknown, anchor?: unknown) {
        symbolCalls.push({ anchor }); if (failure) throw failure;
        return { graph: graph("/symbol", "references"), anchor: anchor ?? { uri: fileUri("/symbol/a.m"), position: new Position(8, 0) } };
      }
    } }
  };
  const module = loadExtensionModule<{ activate: (context: unknown) => Promise<void> }>("extension.js", adapters);
  const activation = module.activate({ extensionUri: fileUri("/extension"), globalStorageUri: fileUri("/cache"), subscriptions: [] });
  return { commands, panel, errors, notices, calls, log, status, token, fileUri, files, symbolCalls, restorations, activation, information, warnings,
    serializer: () => serializer, showCount: () => showCount,
    fail(error?: Error) { failure = error; }, outputShown: () => outputShown };
}

async function invoke(harness: ReturnType<typeof controllerHarness>, command: string, ...args: unknown[]): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      Promise.resolve(harness.commands.get(command)?.(...args)),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Command waited for error-notification dismissal")), 1000); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

test("informational recovery notices do not become warning notifications", async () => {
  for (const severity of ["information", "warning"] as const) {
    const harness = controllerHarness({ graphProblems: [{ severity, message: "Expected diagnostic" }] });
    await invoke(harness, "matlabViz.analyzeSelection", harness.fileUri("/root"));
    assert.equal(harness.information.length, severity === "information" ? 1 : 0);
    assert.equal(harness.warnings.length, severity === "warning" ? 1 : 0);
  }
});

for (const command of ["matlabViz.analyzeSelection", "matlabViz.showCallHierarchy", "matlabViz.traceSymbolReferences"]) {
  test(`${command} releases its lock while an error notification stays open`, async () => {
    const harness = controllerHarness();
    await invoke(harness, "matlabViz.analyzeSelection", harness.fileUri("/original"));
    const original = harness.panel.graph;
    harness.fail(new Error("Expected MATLAB failure"));
    await invoke(harness, command, harness.fileUri("/failed"));
    assert.equal(harness.notices.length, 1);
    assert.equal(harness.panel.graph, original, "failed analysis replaced the previous graph");
    harness.fail();
    await invoke(harness, command, harness.fileUri("/retry"));
    assert.notEqual(harness.panel.graph, original, "retry was blocked by the open error notification");
    assert.ok(!harness.log.some((line) => line.includes("already running")));
    const successfulStatus = harness.status.text;
    harness.notices[0]?.("Show Logs");
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(harness.outputShown(), 1, "the pending Show Logs action stopped working");
    assert.equal(harness.status.text, successfulStatus, "dismissing an old error overwrote a newer status");
  });
}

test("a failed folder analysis preserves the previous refresh target", async () => {
  const harness = controllerHarness();
  await invoke(harness, "matlabViz.analyzeSelection", harness.fileUri("/original"));
  harness.fail(new Error("Not a MATLAB Project"));
  await invoke(harness, "matlabViz.analyzeSelection", harness.fileUri("/wrong-folder"));
  harness.fail();
  await invoke(harness, "matlabViz.refresh");
  assert.equal(harness.calls.at(-1), "/original");
});

test("cancellation releases the lock without showing an error notification", async () => {
  const harness = controllerHarness();
  harness.fail(new TestCancellationError());
  await invoke(harness, "matlabViz.analyzeSelection", harness.fileUri("/cancelled"));
  assert.equal(harness.notices.length, 0);
  assert.ok(harness.log.some((line) => line.toLowerCase().includes("cancelled")));
  harness.fail();
  await invoke(harness, "matlabViz.analyzeSelection", harness.fileUri("/retry"));
  assert.equal(harness.panel.graph?.metadata.root, "/retry");
});

test("the first Show command waits for delayed cache loading without analyzing", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const harness = controllerHarness({ cachedGraph: graph("/cached"), readGate: gate });
  const firstShow = invoke(harness, "matlabViz.showGraph");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(harness.showCount(), 0);
  release(); await firstShow;
  assert.equal(harness.panel.graph?.metadata.root, "/cached");
  assert.equal(harness.showCount(), 1);
  assert.equal(harness.calls.length, 0);
});

test("a serializer adopts the editor panel before cache loading completes", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const harness = controllerHarness({ cachedGraph: graph("/cached"), readGate: gate });
  const editorPanel = {};
  const restoration = harness.serializer().deserializeWebviewPanel(editorPanel, { version: 1 });
  assert.equal(harness.restorations[0], editorPanel);
  release(); await restoration;
  assert.equal(harness.panel.graph?.metadata.root, "/cached");
  assert.equal(harness.showCount(), 0, "restoration unnecessarily revealed/created a panel");
});

test("a cached call graph refreshes its original direction, seed, and depth after restart", async () => {
  const first = controllerHarness();
  await invoke(first, "matlabViz.showCallees");
  await invoke(first, "matlabViz.refresh");
  const saved = JSON.parse(Buffer.from(first.files.get(path.join("/cache", "last-graph.json"))!).toString());
  saved.metadata.analysisDepth = 6;
  const restored = controllerHarness({ cachedGraph: saved });
  await invoke(restored, "matlabViz.refresh");
  assert.equal(restored.calls.length, 0, "a symbol refresh started MATLAB file analysis");
  assert.equal(restored.symbolCalls[0]?.direction, "outgoing");
  assert.equal(restored.symbolCalls[0]?.depth, 6);
  assert.equal(restored.symbolCalls[0]?.seed.name, "original");
  assert.equal(restored.symbolCalls[0]?.seed.uri.fsPath, "/symbol/original.m");
  assert.ok(restored.status.text.includes("symbols"));
});

test("a cached reference graph restores its source anchor instead of using the active editor", async () => {
  const first = controllerHarness();
  await invoke(first, "matlabViz.traceSymbolReferences");
  const restored = controllerHarness({ files: first.files });
  await invoke(restored, "matlabViz.refresh");
  assert.equal(restored.calls.length, 0);
  assert.equal(restored.symbolCalls[0]?.anchor.uri.fsPath, "/symbol/a.m");
  assert.equal(restored.symbolCalls[0]?.anchor.position.line, 8);
});

test("a legacy call graph without a direction never falls back to repository analysis", async () => {
  const harness = controllerHarness({ cachedGraph: graph("/cached", "call-hierarchy") });
  await invoke(harness, "matlabViz.showGraph");
  await invoke(harness, "matlabViz.refresh");
  assert.equal(harness.showCount(), 1);
  assert.equal(harness.calls.length, 0);
  assert.equal(harness.symbolCalls.length, 0);
  assert.ok(harness.log.some((line) => line.includes("no valid saved Refresh target")));
});

test("malformed cache files are logged and do not prevent a new analysis", async () => {
  const harness = controllerHarness({ badCache: "{broken" });
  await invoke(harness, "matlabViz.showGraph");
  assert.equal(harness.showCount(), 0);
  assert.ok(harness.log.some((line) => line.includes("Cached graph could not be restored")));
  await invoke(harness, "matlabViz.analyzeSelection", harness.fileUri("/new"));
  assert.equal(harness.panel.graph?.metadata.root, "/new");
});

test("a cache write failure leaves the old file intact but accepts the new in-memory graph", async () => {
  const original = graph("/cached");
  const harness = controllerHarness({ cachedGraph: original, failCacheWrites: true });
  await invoke(harness, "matlabViz.analyzeSelection", harness.fileUri("/new"));
  assert.equal(harness.panel.graph?.metadata.root, "/new");
  assert.equal(JSON.parse(Buffer.from(harness.files.get(path.join("/cache", "last-graph.json"))!).toString()).metadata.root, "/cached");
  assert.ok(harness.errors.some((line) => line.includes("cache could not be saved")));
  assert.equal(harness.notices.length, 0);
});
