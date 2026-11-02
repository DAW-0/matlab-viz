import assert from "node:assert/strict";
import test from "node:test";
import { buildImpactDependencyPath, buildImpactReport, impactReportToMarkdown } from "../src/core/entryPointReport";
import { entryPointFixture } from "./support/entryPointFixture";

test("impact follows incoming links to exhaustion, preserves original arrows and classifies every notice", () => {
  const graph = entryPointFixture(), before = JSON.stringify(graph);
  const report = buildImpactReport(graph, "n4");
  assert.equal(report.kind, "file-impact"); assert.equal(report.scope, "all-analyzed-incoming-dependents");
  assert.deepEqual(report.nodes.map(item => [item.node.id, item.depth, item.viaEdgeId]), [["n4", 0, undefined], ["n1", 1, "leaf-input"], ["n0", 2, "entry-leaf"]]);
  assert.equal(report.counts.directDependents, 1); assert.equal(report.counts.totalDependents, 2);
  assert.equal(report.counts.nodes, 3); assert.equal(report.counts.edges, 2);
  assert.deepEqual(report.edges.map(edge => [edge.id, edge.source, edge.target]), [["entry-leaf", "n0", "n1"], ["leaf-input", "n1", "n4"]]);
  assert.deepEqual(report.notices.map(item => item.disposition), ["reachable", "outside", "unattributed", "unattributed"]);
  assert.equal(report.products.length, graph.products.length); assert.equal(JSON.stringify(graph), before);
  assert.match(report.limitations.join(" "), /not proof.*will break/);
  const route = buildImpactDependencyPath(report, "n0")!;
  assert.deepEqual(route.nodes.map(node => node.id), ["n0", "n1", "n4"]);
  assert.deepEqual(route.edges.map(edge => edge.id), ["entry-leaf", "leaf-input"]);
  assert.equal(route.hops, 2); assert.equal(route.selectedFileId, "n4");
  assert.equal(buildImpactDependencyPath(report, "n3"), undefined);
  assert.equal(buildImpactDependencyPath(report, "n4")!.hops, 0);
});

test("cycles/self/parallel links do not count selected file or duplicate direct dependents", () => {
  const graph = entryPointFixture();
  graph.edges.push({ id: "cycle", source: "n4", target: "n1", kind: "dependency" },
    { id: "self", source: "n4", target: "n4", kind: "self" },
    { id: "parallel", source: "n1", target: "n4", kind: "data" },
    { id: "branch", source: "n0", target: "n2", kind: "other dependency" },
    { id: "dangling", source: "absent", target: "n4", kind: "dependency" });
  const report = buildImpactReport(graph, "n4");
  assert.equal(report.counts.totalDependents, 2); assert.equal(report.counts.directDependents, 1);
  assert.equal(report.edges.length, 5, "retain all induced originals, but not outgoing side branch or dangling source");
  assert.ok(!report.nodes.some(item => item.node.id === "n2"));
  assert.match(report.limitations.join(" "), /incoming link.*absent nodes/);
  assert.deepEqual(buildImpactDependencyPath(report, "n0")!.edges.map(edge => edge.id), ["entry-leaf", "leaf-input"]);
});

test("isolated file has zero dependents; unresolved seeds and call/reference graphs are rejected", () => {
  const graph = entryPointFixture();
  const report = buildImpactReport(graph, "n2");
  assert.equal(report.counts.nodes, 1); assert.equal(report.counts.totalDependents, 0); assert.equal(report.counts.directDependents, 0);
  assert.match(report.limitations.join(" "), /Zero dependents does not prove a change is safe/);
  assert.throws(() => buildImpactReport(graph, "unknown"), /original file node/);
  for (const graphType of ["references", "call-hierarchy"] as const) {
    graph.metadata.graphType = graphType; assert.throws(() => buildImpactReport(graph, "n4"), /file dependency graph/);
  }
});

test("unresolved ancestor remains native name evidence and corrupt impact path fails closed", () => {
  const graph = entryPointFixture(); graph.edges.push({ id: "native", source: "unknown", target: "n4", kind: "native evidence" });
  const report = buildImpactReport(graph, "n4");
  assert.equal(report.counts.unresolvedNames, 1); assert.equal(report.notices[1]!.disposition, "reachable");
  const route = buildImpactDependencyPath(report, "unknown")!;
  assert.equal(route.nodes[0]!.unresolved, true); assert.equal(route.edges[0]!.source, "unknown");
  report.nodes[1]!.viaEdgeId = "entry-leaf";
  assert.throws(() => buildImpactDependencyPath(report, "n1"), /missing or inconsistent/);
});

test("impact Markdown is escaped and retains all original evidence, not a new graph document", () => {
  const graph = entryPointFixture(); graph.nodes[4]!.path += "<script>|`";
  const report = buildImpactReport(graph, "n4"), markdown = impactReportToMarkdown(report);
  assert.match(markdown, /# MATLAB Viz file impact report/); assert.match(markdown, /Selected file:/);
  assert.match(markdown, /Dependents: 1 direct; 2 total/); assert.match(markdown, /&lt;script&gt;&#124;&#96;/);
  assert.match(markdown, /All analysis notices \(nothing suppressed\)/);
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
  assert.ok(!("entryPoint" in report), "impact must not mislabel selected file as an execution entry point");
});

test("large incoming chains are iterative and generated scopes match independent reverse reachability", () => {
  const graph = entryPointFixture(); graph.nodes = []; graph.edges = []; graph.problems = []; graph.products = [];
  for (let i = 0; i < 20000; i++) {
    graph.nodes.push({ id: String(i), label: `${i}.m`, relativePath: `${i}.m`, extension: ".m", path: `/fixture/${i}.m`, kind: "MATLAB code", external: false, missing: false });
    if (i) graph.edges.push({ id: `e${i}`, source: String(i - 1), target: String(i), kind: "dependency" });
  }
  const report = buildImpactReport(graph, "19999"), route = buildImpactDependencyPath(report, "0")!;
  assert.equal(report.counts.totalDependents, 19999); assert.equal(route.hops, 19999);
  assert.equal(route.nodes[0]!.id, "0"); assert.equal(route.nodes.at(-1)!.id, "19999");
  // Use deterministic modular edges and a fixed-point oracle rather than
  // reimplementing BFS, so traversal-direction mistakes are independently caught.
  graph.nodes = graph.nodes.slice(0, 90); graph.edges = [];
  for (let i = 0; i < 220; i++) graph.edges.push({ id: `g${i}`, source: String(i * 17 % 90), target: String((i * 31 + 7) % 90), kind: "dependency" });
  for (let seed = 0; seed < 90; seed++) {
    const expected = new Set([String(seed)]);
    for (let pass = 0; pass < 90; pass++) for (const edge of graph.edges) if (expected.has(edge.target)) expected.add(edge.source);
    assert.deepEqual(new Set(buildImpactReport(graph, String(seed)).nodes.map(item => item.node.id)), expected);
  }
});
