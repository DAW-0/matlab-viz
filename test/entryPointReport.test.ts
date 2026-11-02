import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AnalysisOptions, AnalysisResult } from "../src/model";
import { buildEntryPointDependencyPath, buildEntryPointReport, entryPointReportToMarkdown } from "../src/core/entryPointReport";
import { entryPointFixture } from "./support/entryPointFixture";
import { cancellationToken, loadExtensionModule, TestCancellationError } from "./support/loadModule";

test("file scope retains all original reachable evidence and separates all notices without mutation", () => {
  const graph = entryPointFixture(), before = JSON.stringify(graph);
  const report = buildEntryPointReport(graph, "n0");
  assert.deepEqual(report.nodes.map(item => [item.node.id, item.depth, item.viaEdgeId]), [["n0", 0, undefined], ["n1", 1, "entry-leaf"], ["n4", 2, "leaf-input"]]);
  assert.equal(report.counts.nodes, 3); assert.equal(report.counts.edges, 2); assert.equal(report.counts.missingFiles, 1);
  assert.deepEqual(report.notices.map(item => item.disposition), ["reachable", "outside", "unattributed", "unattributed"]);
  assert.equal(report.notices.length, graph.problems.length);
  assert.deepEqual(report.products.map(item => item.disposition), ["reachable", "unattributed"]);
  assert.ok(report.limitations.some(item => item.includes("Constructed function names")));
  assert.ok(!report.nodes.some(item => item.node.id === "n2"), "dynamic candidate acquired an inferred edge");
  assert.equal(JSON.stringify(graph), before);
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report, "report must be losslessly JSON portable");
});

test("dependency path uses one minimum-hop predecessor chain with original link evidence", () => {
  const graph = entryPointFixture();
  // A same-length alternative keeps the first BFS predecessor in original
  // edge order; a subsequently added direct link then shortens the route.
  graph.edges.push({ id: "alternative-step-1", source: "n0", target: "n2", kind: "function" },
    { id: "alternative-step-2", source: "n2", target: "n4", kind: "data" });
  let report = buildEntryPointReport(graph, "n0");
  assert.deepEqual(buildEntryPointDependencyPath(report, "n4")!.edges.map(edge => edge.id), ["entry-leaf", "leaf-input"]);
  graph.edges.push({ id: "alternative", source: "n0", target: "n4", kind: "direct", details: "native analyzer evidence" });
  const before = JSON.stringify(graph);
  report = buildEntryPointReport(graph, "n0");
  const route = buildEntryPointDependencyPath(report, "n4")!;
  assert.deepEqual(route.nodes.map(node => node.id), ["n0", "n4"]);
  assert.deepEqual(route.edges.map(edge => edge.id), ["alternative"]);
  assert.equal(route.edges[0]!.kind, "direct"); assert.equal(route.edges[0]!.details, "native analyzer evidence");
  assert.equal(route.hops, 1); assert.match(route.interpretation, /not the only route or a runtime execution trace/);
  assert.equal(buildEntryPointDependencyPath(report, "n3"), undefined, "outside node must not acquire inferred route");
  const self = buildEntryPointDependencyPath(report, "n0")!;
  assert.deepEqual(self.nodes.map(node => node.id), ["n0"]); assert.equal(self.hops, 0); assert.equal(self.edges.length, 0);
  assert.equal(JSON.stringify(graph), before, "route construction must not mutate original graph evidence");
});

test("unresolved route target retains its name without inventing a file location", () => {
  const route = buildEntryPointDependencyPath(buildEntryPointReport(entryPointFixture(), "n3"), "unknown")!;
  assert.equal(route.hops, 1); assert.equal(route.nodes[1]!.unresolved, true);
  assert.equal(route.nodes[1]!.path, "UnavailableApi");
});

test("dependency path rejects corrupt or missing predecessor evidence", () => {
  const report = buildEntryPointReport(entryPointFixture(), "n0");
  report.nodes[2]!.viaEdgeId = "absent";
  assert.throws(() => buildEntryPointDependencyPath(report, "n4"), /missing or inconsistent/);
  report.nodes[2]!.viaEdgeId = "leaf-input"; report.nodes[2]!.depth = 500;
  assert.throws(() => buildEntryPointDependencyPath(report, "n4"), /missing or inconsistent/);
});

test("unresolved names are retained as evidence, never asserted missing or outside by visibility", () => {
  const graph = entryPointFixture(); graph.nodes.at(-1)!.external = true;
  graph.nodes.at(-1)!.missing = true; // Conflicting legacy fields: unresolved wins.
  const report = buildEntryPointReport(graph, "n3");
  assert.equal(report.counts.unresolvedNames, 1); assert.equal(report.counts.missingFiles, 0);
  assert.equal(report.notices[1]!.disposition, "reachable");
  assert.equal(report.notices[0]!.disposition, "outside");
  assert.equal(report.notices[1]!.nodeIds[0], "unknown");
});

test("Windows file evidence normalizes slash/case, POSIX and unresolved-name case remain exact", () => {
  const graph = entryPointFixture("C:/Project");
  graph.problems[0]!.file = "c:\\PROJECT\\.\\MissingInput.mat";
  graph.problems.push({ file: "unavailableapi", severity: "warning", message: "Not exact name evidence" });
  let report = buildEntryPointReport(graph, "n0");
  assert.equal(report.notices[0]!.disposition, "reachable"); assert.equal(report.notices.at(-1)!.disposition, "unattributed");
  graph.nodes[4]!.path = "/Project/MissingInput.mat"; graph.problems[0]!.file = "/project/MissingInput.mat";
  report = buildEntryPointReport(graph, "n0"); assert.equal(report.notices[0]!.disposition, "unattributed");
});

test("no basename, substring, message-text or unsupported relative-path guesses attribute notices", () => {
  const graph = entryPointFixture();
  for (const file of ["MissingInput.mat", "Input.mat", "/elsewhere/MissingInput.mat", "", undefined]) {
    graph.problems.push({ file, severity: "warning", message: "mentions /fixture/scopeLeaf.m but carries no binding" });
  }
  const report = buildEntryPointReport(graph, "n0");
  assert.ok(report.notices.slice(4).every(item => item.disposition === "unattributed"));
});

test("explicit root-relative paths and UNC files match exact graph locations", () => {
  const graph = entryPointFixture("//Server/Share/Project");
  graph.nodes[4]!.path = "\\\\Server\\Share\\Project\\data\\MissingInput.mat";
  graph.problems[0]!.file = "data/MissingInput.mat";
  assert.equal(buildEntryPointReport(graph, "n0").notices[0]!.disposition, "reachable");
});

test("disconnected entry stays isolated; invalid groups/unresolved seeds and non-file graphs are rejected", () => {
  const graph = entryPointFixture(); assert.equal(buildEntryPointReport(graph, "n2").counts.nodes, 1);
  for (const id of ["group:any", "unknown", "absent"]) assert.throws(() => buildEntryPointReport(graph, id), /original file node/);
  for (const kind of ["references", "call-hierarchy"] as const) {
    graph.metadata.graphType = kind; assert.throws(() => buildEntryPointReport(graph, "n0"), /file dependency graph/);
  }
  delete graph.metadata.graphType; assert.equal(buildEntryPointReport(graph, "n0").counts.nodes, 3);
});

test("cycles, parallel/self links and dangling targets preserve original semantics and shortest hops", () => {
  const graph = entryPointFixture();
  graph.edges.push({ id: "back", source: "n4", target: "n0", kind: "dependency" },
    { id: "self", source: "n0", target: "n0", kind: "dependency" },
    { id: "parallel", source: "n0", target: "n1", kind: "other evidence" },
    { id: "dangling", source: "n1", target: "absent", kind: "dependency" });
  const report = buildEntryPointReport(graph, "n0");
  assert.equal(report.counts.nodes, 3); assert.equal(report.edges.length, 5);
  assert.equal(report.nodes[2]!.depth, 2); assert.match(report.limitations.join(" "), /1 outgoing link/);
});

test("long chains are iterative and follow all analyzed depths without a display limit", () => {
  const graph = entryPointFixture(); graph.nodes = []; graph.edges = []; graph.problems = [];
  for (let i = 0; i < 50000; i++) {
    graph.nodes.push({ id: String(i), path: `/fixture/${i}.m`, label: String(i), relativePath: `${i}.m`, extension: ".m", kind: "MATLAB code", external: false, missing: false });
    if (i) graph.edges.push({ id: `e${i}`, source: String(i - 1), target: String(i), kind: "dependency" });
  }
  const report = buildEntryPointReport(graph, "0"); assert.equal(report.counts.nodes, 50000); assert.equal(report.nodes.at(-1)!.depth, 49999);
});

test("seeded generated graphs match independent fixed-point reachability", () => {
  let random = 91; const next = () => { random = (random * 1664525 + 1013904223) >>> 0; return random; };
  for (let trial = 0; trial < 100; trial++) {
    const graph = entryPointFixture(); graph.edges = [];
    for (let i = 0; i < 15; i++) graph.edges.push({ id: String(i), source: `n${next() % 5}`, target: `n${next() % 5}`, kind: "dependency" });
    const expected = new Set(["n0"]); let changed = true;
    while (changed) { changed = false; for (const edge of graph.edges) if (expected.has(edge.source) && !expected.has(edge.target)) { expected.add(edge.target); changed = true; } }
    const report = buildEntryPointReport(graph, "n0"); assert.deepEqual(new Set(report.nodes.map(item => item.node.id)), expected);
  }
});

test("Markdown escapes tables/markup, preserves every notice and states coverage limits", () => {
  const graph = entryPointFixture(); graph.problems[0]!.message = "<script> | `code`\nsecond line";
  graph.metadata.analysisIncludeExternal = false;
  const report = buildEntryPointReport(graph, "n0"), markdown = entryPointReportToMarkdown(report);
  assert.match(markdown, /&lt;script&gt; &#124; &#96;code&#96; second line/);
  assert.match(markdown, /outside/); assert.match(markdown, /General analysis coverage/);
  assert.match(markdown, /No file existence/); assert.match(markdown, /External analysis was disabled/);
  assert.ok(!markdown.includes("scopeDynamic"), "unlinked dynamic candidate was exported as a dependency");
});

test("separator-bearing unresolved names retain native name evidence rather than invented root paths", () => {
  const graph = entryPointFixture(); graph.nodes.at(-1)!.path = "package/Unknown";
  graph.problems[1]!.file = "package/Unknown";
  const report = buildEntryPointReport(graph, "n3"); assert.equal(report.notices[1]!.disposition, "reachable");
  assert.deepEqual(report.notices[1]!.nodeIds, ["unknown"]);
});

test("native MATLAB fixture analysis produces a report and audit log without executing fixture code", {
  skip: !process.env.MATLAB_VIZ_TEST_EXECUTABLE, timeout: 120_000
}, async () => {
  const executable = process.env.MATLAB_VIZ_TEST_EXECUTABLE;
  const root = path.resolve(__dirname, "../../test/fixtures/entryPoint");
  const originals = fs.readdirSync(root).map(name => [name, fs.readFileSync(path.join(root, name))] as const);
  const output = process.env.MATLAB_VIZ_TEST_ARTIFACTS ?? fs.mkdtempSync(path.join(os.tmpdir(), "matlab-viz-entry-report-"));
  fs.mkdirSync(output, { recursive: true });
  const lines: string[] = [];
  const runner = loadExtensionModule<{ runMatlabAnalysis: (root: string, helper: string, options: AnalysisOptions, token: unknown, output: unknown) => Promise<AnalysisResult> }>("matlabRunner.js", {
    vscode: { CancellationError: TestCancellationError, workspace: { getConfiguration: () => ({ get: () => executable }) } }
  });
  try {
    const result = await runner.runMatlabAnalysis(root, path.resolve(__dirname, "../../matlab"), {
      mode: "folder", includeExternal: false, includeIsolated: true, maximumFiles: 10,
      reanalyzeAll: false, analyzeReferences: false, analyzeAddOns: false, analyzeModelParameters: false
    }, cancellationToken(), { appendLine: (line: string) => lines.push(line), append: (line: string) => lines.push(line) });
    const entry = result.graph.nodes.find(node => node.label === "scopeEntry.m"); assert.ok(entry);
    const report = buildEntryPointReport(result.graph, entry.id);
    assert.ok(report.nodes.some(item => item.node.label === "scopeLeaf.m"));
    assert.equal(report.notices.length, result.graph.problems.length);
    fs.writeFileSync(path.join(output, "entry-point-native-report.json"), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(output, "entry-point-native-report.md"), entryPointReportToMarkdown(report));
    for (const [name, original] of originals) assert.deepEqual(fs.readFileSync(path.join(root, name)), original);
  } finally { fs.writeFileSync(path.join(output, "entry-point-native-analysis.log"), lines.join("\n")); }
});
