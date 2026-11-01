import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import test from "node:test";
import * as vm from "node:vm";

const adapter = { exports: {} as any };
vm.runInNewContext(readFileSync(path.resolve(__dirname, "../../media/graphGrouping.js"), "utf8"), { module: adapter });
const grouping = adapter.exports;
const geometryAdapter = { exports: {} as any };
vm.runInNewContext(readFileSync(path.resolve(__dirname, "../../media/graphGeometry.js"), "utf8"), { module: geometryAdapter });
const geometry = geometryAdapter.exports;
const node = (id: string, file: string, external = false) => ({ id, path: file, relativePath: file.replace("/fixture/", ""), label: path.basename(file), external, missing: false });
function fixture() {
  const nodes = [node("a", "/fixture/src/a.m"), node("b", "/fixture/src/b.m"), node("c", "/fixture/lib/c.m"), node("d", "/fixture/lib/d.m"), node("root", "/fixture/root.m")];
  const edges = [
    { id: "aa", source: "a", target: "a", kind: "self" },
    { id: "ab", source: "a", target: "b", kind: "dependency" },
    { id: "ac", source: "a", target: "c", kind: "first", details: "line 2" },
    { id: "bd", source: "b", target: "d", kind: "second" },
    { id: "ca", source: "c", target: "a", kind: "reverse" }
  ];
  return { metadata: { root: "/fixture" }, nodes, edges };
}

test("group projection conserves original directed links including self/parallel/internal relationships", () => {
  const graph = fixture(), saved = JSON.stringify(graph), index = grouping.index(graph, "folder");
  const data = grouping.project(graph, index, new Set());
  assert.equal(data.nodes.length, 3); assert.equal(data.edges.length, 2); assert.equal(data.internalEdges, 2);
  const forward = data.edges.find((edge: any) => edge.count === 2);
  assert.deepEqual(Array.from(forward.originalEdges, (edge: any) => edge.id), ["ac", "bd"]);
  assert.equal(data.edges.find((edge: any) => edge.count === 1).source, forward.target);
  assert.equal(data.edges.reduce((sum: number, edge: any) => sum + edge.count, 0) + data.internalEdges, graph.edges.length);
  assert.equal(JSON.stringify(graph), saved, "projection mutated the analyzer model");
  assert.equal(data.original, graph);
});

test("partial/all expansion restores original edges and preserves grouped-to-file counts", () => {
  const graph = fixture(), index = grouping.index(graph, "folder"), src = index.membership.get("a");
  const partial = grouping.project(graph, index, new Set([src]));
  assert.equal(partial.nodes.length, 4); assert.equal(partial.internalEdges, 0);
  assert.equal(partial.edges.find((edge: any) => edge.id === "aa"), graph.edges[0]);
  assert.equal(partial.edges.find((edge: any) => edge.id === "ab"), graph.edges[1]);
  assert.equal(partial.edges.filter((edge: any) => edge.count).length, 3);
  const all = grouping.project(graph, index, new Set(index.groups.keys()));
  assert.deepEqual(new Set(all.nodes), new Set(graph.nodes)); assert.deepEqual(new Set(all.edges), new Set(graph.edges));
  assert.equal(all.internalEdges, 0);
  assert.equal(grouping.project(graph, grouping.index(graph, "none"), new Set()).nodes, graph.nodes);
});

test("filtered projection shows included/total membership and retains hidden member search without dropping counts", () => {
  const graph = fixture(), index = grouping.index(graph, "folder");
  const data = grouping.project({ nodes: graph.nodes.slice(0, 1), edges: [graph.edges[0]] }, index, new Set(), "symbols");
  assert.equal(data.nodes.length, 1); assert.match(data.nodes[0].relativePath, /1\/2 symbols/);
  assert.match(data.nodes[0].searchText, /src\/a.m/); assert.doesNotMatch(data.nodes[0].searchText, /src\/b.m/);
  assert.equal(data.internalEdges, 1);
});

test("package groups use innermost qualified package; private/classes remain owned, ordinary folders fall back", () => {
  const graph = { metadata: { root: "/fixture" }, edges: [], nodes: [
    node("a", "/fixture/src/+one/+two/a.m"), node("b", "/fixture/src/+one/+two/private/b.m"),
    node("c", "/fixture/src/+one/+two/@Class/c.m"), node("d", "/fixture/src/+one/d.m"),
    node("e", "/fixture/other/+one/+two/e.m"), node("f", "/fixture/ordinary/f.m")
  ] };
  const index = grouping.index(graph, "package");
  assert.equal(index.groups.size, 4);
  assert.equal(index.membership.get("a"), index.membership.get("b")); assert.equal(index.membership.get("a"), index.membership.get("c"));
  assert.notEqual(index.membership.get("a"), index.membership.get("d")); assert.notEqual(index.membership.get("a"), index.membership.get("e"));
  assert.equal(index.groups.get(index.membership.get("a")).label, "one.two [src/+one/+two]");
  assert.equal(index.groups.get(index.membership.get("e")).label, "one.two [other/+one/+two]");
  assert.equal(index.groups.get(index.membership.get("f")).type, "folder");
});

test("path identities separate external/root-prefix folders, respect Windows case, and preserve POSIX case", () => {
  const graph = { metadata: { root: "E:\\repo" }, edges: [], nodes: [
    node("a", "E:\\repo\\src\\a.m"), node("b", "e:/REPO/SRC/b.m"), node("c", "E:/repository/src/c.m", true),
    node("d", "F:/other/src/d.m", true), node("e", "E:/repo/root.m")
  ] };
  const index = grouping.index(graph, "folder");
  assert.equal(index.groups.size, 4); assert.equal(index.membership.get("a"), index.membership.get("b"));
  assert.notEqual(index.membership.get("c"), index.membership.get("d"));
  assert.match(index.groups.get(index.membership.get("c")).label, /^External:/);
  assert.equal(index.groups.get(index.membership.get("e")).label, "(root)");
  assert.equal(grouping.index({ metadata: { root: "/fixture" }, edges: [], nodes: [node("A", "/fixture/Foo/a.m"), node("B", "/fixture/foo/b.m")] }, "folder").groups.size, 2);
});

test("package ownership includes a package analysis root, private roots, and only contiguous qualified ancestors", () => {
  for (const root of ["/fixture/+outer/+inner", "/fixture/+outer/+inner/private", "/fixture/+outer/+inner/@Class"]) {
    const graph = { metadata: { root }, edges: [], nodes: [node("a", `${root}/a.m`)] };
    assert.equal(grouping.index(graph, "package").groups.values().next().value.label, "outer.inner");
  }
  const graph = { metadata: { root: "/fixture" }, edges: [], nodes: [node("a", "/fixture/+outer/ordinary/+inner/a.m")] };
  assert.equal(grouping.index(graph, "package").groups.values().next().value.label, "inner");
});

test("synthetic identities cannot overwrite analyzer IDs and are deterministic across refresh/filtering", () => {
  const graph = fixture(), first = grouping.index(graph, "folder"), collision = first.membership.get("a");
  graph.nodes.push(node(collision, "/fixture/extra/id.m"));
  const index = grouping.index(graph, "folder"); assert.notEqual(index.membership.get("a"), collision);
  const projected = grouping.project(graph, index, new Set());
  graph.edges.push({ ...graph.edges[0]!, id: projected.edges[0].id, source: "root", target: "root" });
  const next = grouping.index(graph, "folder"), full = grouping.project(graph, next, new Set());
  assert.notEqual(full.edges[0].id, projected.edges[0].id);
  const filtered = grouping.project({ nodes: graph.nodes.filter((node) => node.id !== "root"), edges: graph.edges.slice(0, 5) }, next, new Set());
  assert.equal(filtered.edges[0].id, full.edges[0].id);
  assert.deepEqual(Array.from(next.groups.keys()), Array.from(grouping.index(graph, "folder").groups.keys()));
});

test("grouped SVG is vector, escapes labels, retains aggregate counts/internal totals, and searches member names", () => {
  const graph = fixture(); graph.nodes[0]!.path = "/fixture/src<&/a.m"; graph.nodes[1]!.path = "/fixture/src<&/b.m";
  const data = grouping.project(graph, grouping.index(graph, "folder"), new Set());
  const positions = new Map(), sizes = new Map(data.nodes.map((node: any) => [node.id, geometry.labelBox(node.relativePath)]));
  geometry.grid(data.nodes, positions, sizes);
  const svg = geometry.svgDocument(data, positions, sizes, { scope: "graph", search: "a.m" }).source;
  assert.match(svg, /src&lt;&amp;/); assert.match(svg, /class="link-count"/); assert.match(svg, />2<\/text>/);
  assert.match(svg, /2 links are internal/); assert.match(svg, /5 original nodes and 5 original links/);
  assert.doesNotMatch(svg, /<image/); assert.equal((svg.match(/opacity="0.15"/g) || []).length, 2);
});

test("5000-node projection preserves every relationship without quadratic aggregation", () => {
  const nodes = Array.from({ length: 5000 }, (_, i) => node(String(i), `/fixture/folder${Math.floor(i / 100)}/file${i}.m`));
  const edges = nodes.slice(1).map((item, i) => ({ id: `e${i}`, source: String(i), target: item.id }));
  const graph = { metadata: { root: "/fixture" }, nodes, edges };
  const start = performance.now(), data = grouping.project(graph, grouping.index(graph, "folder"), new Set());
  assert.equal(data.nodes.length, 50); assert.equal(data.edges.length, 49); assert.equal(data.internalEdges, 4950);
  assert.equal(data.edges.reduce((sum: number, edge: any) => sum + edge.count, 0) + data.internalEdges, 4999);
  assert.ok(performance.now() - start < 5000, "group projection exceeded the generous five-second regression bound");
});

test("opposite aggregate directions have distinct curved hit targets and count positions in SVG and bounds", () => {
  const graph = fixture(), data = grouping.project(graph, grouping.index(graph, "folder"), new Set());
  const positions = new Map(), sizes = new Map(data.nodes.map((node: any) => [node.id, geometry.labelBox(node.relativePath)]));
  geometry.grid(data.nodes, positions, sizes);
  const first = geometry.edgeGeometry(data.edges[0], positions, sizes), second = geometry.edgeGeometry(data.edges[1], positions, sizes);
  assert.match(first.d, / Q /); assert.match(second.d, / Q /); assert.notEqual(first.d, second.d);
  const a = geometry.linkCountPoint(data.edges[0], positions, sizes), b = geometry.linkCountPoint(data.edges[1], positions, sizes);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 24);
  const bounds = geometry.bounds(data, positions, sizes);
  for (const value of [a, b]) assert.ok(value.x >= bounds.minX && value.x <= bounds.minX + bounds.width && value.y >= bounds.minY && value.y <= bounds.minY + bounds.height);
  const svg = geometry.svgDocument(data, positions, sizes, { scope: "graph" }).source;
  assert.equal((svg.match(/ Q /g) || []).length, 2);
});
