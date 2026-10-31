import assert from "node:assert/strict";
import test from "node:test";
import { graphToCsv, graphToDot } from "../src/core/exporters";
import { validateGraph } from "../src/model";

const metadata = { schemaVersion: 1, root: "/fixture", mode: "folder", durationSeconds: 1 };
const first = { id: "a", label: "a.m", path: "/fixture/a.m" };
const second = { id: "b", label: "b.m", path: "/fixture/b.m" };
const edge = { id: "e1", source: "a", target: "b", kind: "dependency" };

test("legacy singleton collections normalize without dropping a missing-file notice", () => {
  const graph = validateGraph({ metadata: { ...metadata }, nodes: [first, second], edges: edge,
    products: { name: "MATLAB" }, problems: { file: second.path, message: "Referenced file does not exist.", severity: "warning" } });
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.products.length, 1);
  assert.equal(graph.problems.length, 1);
  assert.equal(graph.problems[0]?.file, second.path);
  assert.equal(graph.metadata.edgeCount, 1);
  assert.match(graphToDot(graph), /"a" -> "b"/);
  assert.match(graphToCsv(graph), /a,b,dependency,\/fixture\/a.m,\/fixture\/b.m/);
});

test("a singleton node and empty graph collections are accepted", () => {
  assert.equal(validateGraph({ metadata: { ...metadata }, nodes: first, edges: [] }).nodes.length, 1);
  const empty = validateGraph({ metadata: { ...metadata }, nodes: [], edges: [], products: [], problems: [] });
  assert.equal(empty.metadata.nodeCount, 0);
  assert.equal(empty.metadata.edgeCount, 0);
  assert.deepEqual(empty.problems, []);
});

test("invalid collection shapes identify the offending field", () => {
  for (const nodes of [null, undefined, "a", {}, [false]]) {
    assert.throws(() => validateGraph({ metadata: { ...metadata }, nodes, edges: [] }), /nodes/);
  }
  assert.throws(() => validateGraph({ metadata: { ...metadata }, nodes: [], edges: {} }), /edges/);
  assert.throws(() => validateGraph({ metadata: { ...metadata }, nodes: [], edges: [], products: "MATLAB" }), /products/);
  assert.throws(() => validateGraph({ metadata: { ...metadata }, nodes: [], edges: [], problems: { message: "bad", severity: "fatal" } }), /severity/);
  assert.throws(() => validateGraph({ metadata: [], nodes: [], edges: [] }), /metadata/);
});
