import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import type { AnalysisOptions, AnalysisResult } from "../src/model";
import { graphToCsv, graphToDot } from "../src/core/exporters";
import { cancellationToken, loadExtensionModule, TestCancellationError } from "./support/loadModule";

const executable = process.env.MATLAB_VIZ_TEST_EXECUTABLE;

test("real MATLAB runner: singleton JSON, exports, log files, errors, cancellation, and retry", {
  skip: !executable,
  // This check launches six real MATLAB processes. Licensing/startup latency
  // on a busy desktop can exceed four minutes even when every check passes.
  timeout: 600_000
}, async () => {
  const outputDirectory = process.env.MATLAB_VIZ_TEST_ARTIFACTS
    ?? fs.mkdtempSync(path.join(os.tmpdir(), "matlab-viz-validation-"));
  fs.mkdirSync(outputDirectory, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "matlab-viz-runner-"));
  const root = path.join(fixture, "fixture_é_Δ");
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, "helper.m"), "function value = helper\nvalue = 42;\nend\n", "utf8");
  const runner = loadExtensionModule<{
    runMatlabAnalysis: (root: string, helper: string, options: AnalysisOptions, token: unknown, output: unknown) => Promise<AnalysisResult>
  }>("matlabRunner.js", {
    vscode: { CancellationError: TestCancellationError, workspace: { getConfiguration: () => ({ get: () => executable }) } }
  });
  const helper = path.resolve(__dirname, "../../matlab");
  const defaults: AnalysisOptions = { mode: "folder", includeExternal: false, includeIsolated: true, maximumFiles: 5000,
    reanalyzeAll: false, analyzeReferences: true, analyzeAddOns: false, analyzeModelParameters: false };
  async function run(name: string, overrides: Partial<AnalysisOptions> = {}, token = cancellationToken()): Promise<AnalysisResult> {
    const chunks: string[] = [];
    try {
      return await runner.runMatlabAnalysis(root, helper, { ...defaults, ...overrides }, token, {
        appendLine: (message: string) => chunks.push(`${message}\n`), append: (message: string) => chunks.push(message)
      });
    } finally {
      fs.writeFileSync(path.join(outputDirectory, `${name}.log`), chunks.join(""), "utf8");
    }
  }

  const singleton = await run("runner-singleton");
  assert.equal(singleton.graph.nodes.length, 1);
  assert.equal(singleton.graph.edges.length, 0);
  assert.equal(singleton.graph.products.length, 1);
  assert.ok(singleton.graph.nodes[0]?.path.includes("fixture_é_Δ"), "Unicode path was corrupted by JSON encoding");
  assert.equal(singleton.graph.problems.length, 0);

  fs.writeFileSync(path.join(root, "main.m"), "function value = main\nvalue = helper();\nend\n", "utf8");
  const singleEdge = await run("runner-one-edge");
  assert.equal(singleEdge.graph.nodes.length, 2);
  assert.equal(singleEdge.graph.edges.length, 1);
  const jsonPath = path.join(outputDirectory, "runner-one-edge.json");
  fs.writeFileSync(jsonPath, JSON.stringify(singleEdge.graph, null, 2), "utf8");
  const json: unknown = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  assert.ok(Array.isArray((json as AnalysisResult["graph"]).edges));
  const csv = graphToCsv(singleEdge.graph);
  const dot = graphToDot(singleEdge.graph);
  fs.writeFileSync(path.join(outputDirectory, "runner-one-edge.csv"), csv, "utf8");
  fs.writeFileSync(path.join(outputDirectory, "runner-one-edge.dot"), dot, "utf8");
  assert.equal(csv.trim().split(/\r?\n/).length, 2);
  assert.equal(dot.split(" -> ").length - 1, 1);
  const successLog = fs.readFileSync(path.join(outputDirectory, "runner-one-edge.log"), "utf8");
  for (const expected of ["Executable:", "Root:", "Backend request: folder", "Options:", "MATLABVIZ_RESULT:", "Completed: files=2, dependencies=1, notices=0"]) {
    assert.ok(successLog.includes(expected), `Missing expected success log entry: ${expected}`);
  }

  await assert.rejects(run("runner-file-limit", { maximumFiles: 1 }), /MatlabViz:MaximumFilesExceeded.*2 analyzable files.*MaximumFiles=1/s);
  const limitLog = fs.readFileSync(path.join(outputDirectory, "runner-file-limit.log"), "utf8");
  assert.match(limitLog, /MATLABVIZ_ERROR:/);
  assert.match(limitLog, /MaximumFilesExceeded/);
  assert.match(limitLog, /Error (using|in)/);
  await assert.rejects(run("runner-missing-project", { mode: "project" }), /MatlabViz:ProjectNotFound.*no MATLAB Project was found/s);

  const token = cancellationToken();
  const timer = setTimeout(() => token.cancel(), 1000);
  try {
    await assert.rejects(run("runner-cancelled", {}, token), TestCancellationError);
  } finally {
    clearTimeout(timer);
  }
  assert.match(fs.readFileSync(path.join(outputDirectory, "runner-cancelled.log"), "utf8"), /Cancellation requested; stopping MATLAB/);
  const retry = await run("runner-retry");
  assert.equal(retry.graph.nodes.length, 2);
  assert.equal(retry.graph.edges.length, 1);
  assert.equal(retry.graph.problems.length, 0);
  fs.writeFileSync(path.join(outputDirectory, "runner-summary.json"), JSON.stringify({ passed: true, fixture: root,
    singleton: [1, 0, 1], oneEdge: [2, 1], errorMessages: ["MaximumFilesExceeded", "ProjectNotFound"], cancellationAndRetry: true }, null, 2));
});
