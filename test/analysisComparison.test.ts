import assert from "node:assert/strict";
import test from "node:test";
import { compareAnalyses, comparisonToMarkdown, createAnalysisBaseline, readAnalysisBaseline } from "../src/core/analysisComparison";
import { entryPointFixture } from "./support/entryPointFixture";
import type { DependencyGraph } from "../src/model";

/** Deliberately regenerate every analyzer ID: identities must come from evidence. */
function reidentified(graph: DependencyGraph): DependencyGraph {
  const copy = structuredClone(graph), ids = new Map(copy.nodes.map(node => [node.id, `new-${node.id}`]));
  copy.nodes.reverse().forEach(node => { node.id = ids.get(node.id)!; });
  copy.edges.reverse().forEach(edge => { edge.id = `new-${edge.id}`; edge.source = ids.get(edge.source)!; edge.target = ids.get(edge.target)!; });
  copy.metadata.generatedAt = "2026-11-02T20:00:00Z"; copy.metadata.durationSeconds = 5;
  return copy;
}
test("baseline is versioned, portable and detached; IDs/order/duration/time do not create differences", () => {
  const graph = entryPointFixture(), before = JSON.stringify(graph), baseline = createAnalysisBaseline(graph);
  const result = compareAnalyses(readAnalysisBaseline(JSON.parse(JSON.stringify(baseline))), reidentified(graph));
  assert.equal(result.nodes.unchanged, 6); assert.equal(result.links.unchanged, 3);
  assert.equal(result.nodes.added.length + result.nodes.removed.length + result.nodes.changed.length, 0);
  assert.equal(result.links.added.length + result.links.removed.length + result.links.changed.length, 0);
  assert.equal(result.notices.unchanged, 4); assert.equal(result.coverageDifferences.length, 0);
  baseline.graph.nodes[0]!.missing = true; assert.equal(JSON.stringify(graph), before);
});
test("node/relationship/notice/product evidence changes are distinct and preserve full records", () => {
  const old = entryPointFixture(), current = reidentified(old);
  current.nodes = current.nodes.filter(node => node.id !== "new-n2");
  current.nodes.push({ ...old.nodes[0]!, id: "added", path: "/fixture/added.m", relativePath: "added.m" });
  current.nodes.find(node => node.id === "new-n4")!.missing = false;
  current.edges.push({ id: "a", source: "new-n0", target: "added", kind: "function" }, { id: "b", source: "added", target: "new-n4", kind: "data" });
  current.edges.find(edge => edge.id === "new-entry-leaf")!.details = "new source evidence";
  current.problems.shift(); current.problems.push({ severity: "warning", message: "New coverage warning" });
  current.products[0]!.version = "2";
  const oldBytes = JSON.stringify(old), newBytes = JSON.stringify(current);
  const result = compareAnalyses(createAnalysisBaseline(old), current, { mode: "dependencies", nodeId: "new-n0" });
  assert.deepEqual(result.nodes.added.map(node => node.path), ["/fixture/added.m"]);
  assert.deepEqual(result.nodes.removed.map(node => node.path), ["/fixture/scopeDynamic.m"]);
  assert.deepEqual(result.nodes.changed[0]!.fields, ["missing"]);
  assert.equal(result.links.added.length, 2); assert.equal(result.links.changed.length, 1); assert.equal(result.links.removed.length, 0);
  assert.equal(result.notices.added.length, 1); assert.equal(result.notices.removed.length, 1);
  assert.equal(result.products.added.length, 1); assert.equal(result.products.removed.length, 1);
  assert.equal(result.analysisNotices.baseline.length, 4); assert.equal(result.analysisNotices.current.length, 4);
  assert.equal(result.scope!.beforeNodes, 3); assert.equal(result.scope!.afterNodes, 4); assert.equal(result.scope!.nodes.added.length, 1);
  const impact = compareAnalyses(createAnalysisBaseline(old), current, { mode: "impact", nodeId: "new-n4" });
  assert.equal(impact.scope!.beforeNodes, 3); assert.equal(impact.scope!.afterNodes, 4);
  assert.equal(JSON.stringify(old), oldBytes); assert.equal(JSON.stringify(current), newBytes);
  current.problems[0]!.message = "later mutation";
  assert.notEqual(result.analysisNotices.current[0]!.message, "later mutation", "comparison must remain an exact exportable snapshot");
});
test("scope with absent baseline seed is unavailable, never an invented empty scope", () => {
  const old = entryPointFixture(), current = structuredClone(old);
  current.nodes.push({ ...old.nodes[0]!, id: "added", path: "/fixture/new.m" });
  const result = compareAnalyses(createAnalysisBaseline(old), current, { mode: "impact", nodeId: "added" });
  assert.equal(result.scope!.status, "seed-absent-in-baseline"); assert.equal(result.scope!.beforeNodes, undefined);
  assert.equal(result.scope!.nodes.added.length, 0);
  assert.throws(() => compareAnalyses(createAnalysisBaseline(old), current, { mode: "dependencies", nodeId: "unknown" }), /original current file/);
});
test("notice and parallel-link multiplicity are retained; wording/kind changes are not silently matched", () => {
  const old = entryPointFixture(), current = structuredClone(old);
  old.problems.push({ ...old.problems[0]! });
  current.edges.push({ ...current.edges[0]!, id: "parallel" });
  current.edges[1]!.kind = "different relationship";
  current.problems[1]!.message += " (new wording)";
  const result = compareAnalyses(createAnalysisBaseline(old), current);
  assert.equal(result.notices.removed.length, 2); assert.equal(result.notices.added.length, 1);
  assert.equal(result.links.changed.length, 1); assert.equal(result.links.changed[0]!.after.records.length, 2);
  assert.equal(result.links.added.length, 1); assert.equal(result.links.removed.length, 1);
});
test("Windows paths normalize case/slashes, POSIX paths and unresolved names remain case-sensitive", () => {
  const old = entryPointFixture("C:/Project"), current = reidentified(old);
  current.metadata.root = "c:\\PROJECT";
  for (const node of current.nodes) if (!node.unresolved) node.path = node.path.replaceAll("/", "\\").toUpperCase();
  for (const notice of current.problems) if (notice.file?.startsWith("C:")) notice.file = notice.file.replaceAll("/", "\\").toLowerCase();
  const result = compareAnalyses(createAnalysisBaseline(old), current);
  assert.equal(result.nodes.added.length, 0); assert.equal(result.notices.added.length, 0);
  const posix = entryPointFixture(), changed = structuredClone(posix); changed.nodes[0]!.path = "/fixture/ScopeEntry.m";
  const renamed = compareAnalyses(createAnalysisBaseline(posix), changed);
  assert.equal(renamed.nodes.added.length, 1); assert.equal(renamed.nodes.removed.length, 1);
  changed.nodes.at(-1)!.path = "unavailableapi";
  assert.equal(compareAnalyses(createAnalysisBaseline(posix), changed).nodes.added.length, 2);
  assert.throws(() => compareAnalyses(createAnalysisBaseline(entryPointFixture("//server/share")), entryPointFixture("/server/share")), /different roots/);
});
test("coverage settings and lookup-root precedence are explicit differences, not code regressions", () => {
  const old = entryPointFixture(), current = structuredClone(old);
  old.metadata.searchRoots = ["/a", "/b"]; current.metadata.searchRoots = ["/b", "/a"];
  current.metadata.mode = "folder"; current.metadata.matlabVersion = "different"; current.metadata.analysisIncludeExternal = false;
  const result = compareAnalyses(createAnalysisBaseline(old), current);
  assert.deepEqual(result.coverageDifferences.map(item => item.field), ["mode", "matlabVersion", "analysisIncludeExternal", "searchRoots"]);
  assert.match(result.limitations.join(" "), /not source contents/); assert.match(result.limitations.join(" "), /unrecorded|not be fully recorded/);
});

test("equivalent trailing roots and UNC paths normalize without equating unrelated path flavors", () => {
  const old = entryPointFixture("C:/Project"), current = structuredClone(old); current.metadata.root = "c:\\project\\";
  assert.equal(compareAnalyses(createAnalysisBaseline(old), current).nodes.unchanged, 6);
  const unc = entryPointFixture("//SERVER/Share/Project"), next = structuredClone(unc); next.metadata.root = "\\\\server\\share\\project\\";
  assert.equal(compareAnalyses(createAnalysisBaseline(unc), next).nodes.unchanged, 6);
});

test("large reidentified graphs and notice collections compare without repeated linear name scans", () => {
  const graph = entryPointFixture(); graph.nodes = []; graph.edges = []; graph.problems = []; graph.products = [];
  for (let i = 0; i < 8000; i++) {
    graph.nodes.push({ id: String(i), label: `${i}.m`, relativePath: `${i}.m`, extension: ".m", path: `/fixture/${i}.m`, kind: "MATLAB code", external: false, missing: false });
    if (i) graph.edges.push({ id: `e${i}`, source: String(i - 1), target: String(i), kind: "dependency" });
    graph.problems.push({ file: `/fixture/${i}.m`, severity: "warning", message: `Coverage ${i}` });
  }
  const result = compareAnalyses(createAnalysisBaseline(graph), reidentified(graph), { mode: "dependencies", nodeId: "new-0" });
  assert.equal(result.nodes.unchanged, 8000); assert.equal(result.links.unchanged, 7999); assert.equal(result.notices.unchanged, 8000);
  assert.equal(result.scope!.beforeNodes, 8000); assert.equal(result.scope!.afterNodes, 8000);
});

test("equivalent trailing roots and UNC paths normalize without equating unrelated path flavors", () => {
  const old = entryPointFixture("C:/Project"), current = structuredClone(old); current.metadata.root = "c:\\project\\";
  assert.equal(compareAnalyses(createAnalysisBaseline(old), current).nodes.unchanged, 6);
  const unc = entryPointFixture("//SERVER/Share/Project"), next = structuredClone(unc); next.metadata.root = "\\\\server\\share\\project\\";
  assert.equal(compareAnalyses(createAnalysisBaseline(unc), next).nodes.unchanged, 6);
});

test("large reidentified graphs and notice collections compare without repeated linear name scans", () => {
  const graph = entryPointFixture(); graph.nodes = []; graph.edges = []; graph.problems = []; graph.products = [];
  for (let i = 0; i < 8000; i++) {
    graph.nodes.push({ id: String(i), label: `${i}.m`, relativePath: `${i}.m`, extension: ".m", path: `/fixture/${i}.m`, kind: "MATLAB code", external: false, missing: false });
    if (i) graph.edges.push({ id: `e${i}`, source: String(i - 1), target: String(i), kind: "dependency" });
    graph.problems.push({ file: `/fixture/${i}.m`, severity: "warning", message: `Coverage ${i}` });
  }
  const result = compareAnalyses(createAnalysisBaseline(graph), reidentified(graph), { mode: "dependencies", nodeId: "new-0" });
  assert.equal(result.nodes.unchanged, 8000); assert.equal(result.links.unchanged, 7999); assert.equal(result.notices.unchanged, 8000);
  assert.equal(result.scope!.beforeNodes, 8000); assert.equal(result.scope!.afterNodes, 8000);
});
test("different roots, ambiguous identities, dangling links, relative guesses and unsupported documents fail closed", () => {
  const graph = entryPointFixture();
  assert.throws(() => compareAnalyses(createAnalysisBaseline(graph), entryPointFixture("/other")), /different roots/);
  for (const mutate of [
    (value: DependencyGraph) => value.nodes.push({ ...value.nodes[0]!, id: "duplicate" }),
    (value: DependencyGraph) => { value.edges[0]!.target = "absent"; },
    (value: DependencyGraph) => { value.nodes[0]!.path = "guessed.m"; },
    (value: DependencyGraph) => { value.metadata.graphType = "references"; },
    (value: DependencyGraph) => { value.metadata.schemaVersion = 99; }
  ]) { const bad = structuredClone(graph); mutate(bad); assert.throws(() => createAnalysisBaseline(bad)); }
  assert.throws(() => readAnalysisBaseline(graph), /version-1/);
  assert.throws(() => readAnalysisBaseline({ ...createAnalysisBaseline(graph), baselineVersion: 2 }), /version-1/);
  assert.throws(() => createAnalysisBaseline(graph, "not-a-time"), /save time/);
});
test("unresolved and exact path evidence do not use basename guesses; full Markdown escapes every record", () => {
  const old = entryPointFixture(), current = structuredClone(old);
  old.problems.push({ severity: "warning", file: "MissingInput.mat", message: "<script>|`" });
  current.problems.push({ severity: "warning", file: "/fixture/MissingInput.mat", message: "<script>|`" });
  const report = compareAnalyses(createAnalysisBaseline(old), current);
  assert.equal(report.notices.added.length, 1); assert.equal(report.notices.removed.length, 1);
  const markdown = comparisonToMarkdown(report);
  assert.match(markdown, /&lt;script&gt;&#124;&#96;/); assert.match(markdown, /not proven resolved/);
  assert.match(markdown, /All baseline notices/); assert.match(markdown, /All current notices/);
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
});
