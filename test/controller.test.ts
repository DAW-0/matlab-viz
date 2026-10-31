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

function controllerHarness() {
  const commands = new Map<string, (...args: any[]) => Promise<void> | void>();
  const log: string[] = [];
  const errors: string[] = [];
  const notices: Array<(action?: string) => void> = [];
  const calls: string[] = [];
  const panel = { graph: undefined as DependencyGraph | undefined, update(value: DependencyGraph) { this.graph = value; }, show() {}, exportGraph() {}, showProblems() {} };
  const status = { text: "", show() {} };
  let failure: Error | undefined;
  let outputShown = 0;
  const token = cancellationToken();
  const disposable = { dispose() {} };
  const fileUri = (fsPath: string) => ({ fsPath, scheme: "file" });
  const adapters = {
    vscode: {
      CancellationError: TestCancellationError,
      Uri: { file: fileUri, joinPath: (uri: { fsPath: string }, ...parts: string[]) => fileUri(path.join(uri.fsPath, ...parts)) },
      FileType: { Directory: 2 }, StatusBarAlignment: { Left: 1 }, ProgressLocation: { Notification: 1 },
      window: {
        createOutputChannel: () => ({ appendLine: (s: string) => log.push(s), error: (s: string) => errors.push(s), show: () => { outputShown++; } }),
        createStatusBarItem: () => status, registerWebviewViewProvider: () => disposable,
        withProgress: (_options: unknown, action: (progress: unknown, token: unknown) => Promise<void>) => action({ report() {} }, token),
        showErrorMessage: (message: string) => { errors.push(message); return new Promise<string | undefined>((resolve) => notices.push(resolve)); },
        showWarningMessage: async () => undefined, showInformationMessage: (s: string) => log.push(s)
      },
      commands: { registerCommand: (name: string, action: (...args: any[]) => Promise<void> | void) => { commands.set(name, action); return disposable; } },
      workspace: {
        fs: { stat: async () => ({ type: 2 }), createDirectory: async () => undefined, writeFile: async () => undefined,
          readFile: async () => { throw new Error("No cached graph"); } },
        getConfiguration: () => ({ get: () => false }), onDidChangeConfiguration: () => disposable
      }
    },
    "./configuration": { readAnalysisOptions: () => ({}), readSymbolAnalysisOptions: () => ({ maximumDepth: 3 }) },
    "./graphPanel": { GraphPanel: class { constructor() { return panel; } }, SidebarProvider: class { setGraph() {} } },
    "./matlabRunner": { runMatlabAnalysis: async (root: string) => { calls.push(root); if (failure) throw failure; return { graph: graph(root) }; } },
    "./symbolAnalyzer": { SymbolAnalyzer: class {
      async analyzeCallHierarchy() { if (failure) throw failure; return { graph: graph("/symbol", "call-hierarchy"), seed: { name: "original" } }; }
      async analyzeReferences() { if (failure) throw failure; return { graph: graph("/symbol", "references"), anchor: { uri: fileUri("/symbol/a.m"), position: { line: 0, character: 0 } } }; }
    } }
  };
  const module = loadExtensionModule<{ activate: (context: unknown) => void }>("extension.js", adapters);
  module.activate({ extensionUri: fileUri("/extension"), globalStorageUri: fileUri("/cache"), subscriptions: [] });
  return { commands, panel, errors, notices, calls, log, status, token, fileUri,
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
