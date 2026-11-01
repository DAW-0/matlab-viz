import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import test from "node:test";
import * as vm from "node:vm";

const moduleAdapter = { exports: {} as any };
vm.runInNewContext(readFileSync(path.resolve(__dirname, "../../media/graphGeometry.js"), "utf8"), { module: moduleAdapter });
const geometry = moduleAdapter.exports;

test("anchored cluster placement keeps fixed rectangles unchanged and deterministically avoids crowded obstacles", () => {
  const nodes = ["a", "b", "c", "d"].map((id) => ({ id }));
  const fixed = Array.from({ length: 200 }, (_, i) => ({ id: `fixed${i}` }));
  const sizes = new Map([...nodes, ...fixed].map((node, i) => [node.id, geometry.labelBox("long label ".repeat(1 + i % 4))]));
  const positions = new Map<string, any>(); geometry.grid(fixed, positions, sizes);
  const snapshot = JSON.stringify([...positions]), anchor = { ...positions.get("fixed50") };
  geometry.placeCluster(nodes, anchor, fixed, positions, sizes);
  assert.equal(JSON.stringify(fixed.map((node) => [node.id, positions.get(node.id)])), snapshot);
  for (const a of nodes) for (const b of [...nodes, ...fixed]) {
    if (a.id === b.id) continue;
    const pa = positions.get(a.id), pb = positions.get(b.id), sa = sizes.get(a.id), sb = sizes.get(b.id);
    assert.ok(Math.abs(pa.x - pb.x) >= (sa.width + sb.width) / 2 || Math.abs(pa.y - pb.y) >= (sa.height + sb.height) / 2, `${a.id} overlaps ${b.id}`);
  }
  const result = JSON.stringify(nodes.map((node) => positions.get(node.id)));
  geometry.placeCluster(nodes, anchor, fixed, positions, sizes);
  assert.equal(JSON.stringify(nodes.map((node) => positions.get(node.id))), result);
});

test("free anchored clusters stay centered at the summary rather than depending on global layout/index", () => {
  const nodes = ["a", "b", "c"].map((id) => ({ id })), positions = new Map();
  const sizes = new Map(nodes.map((node) => [node.id, geometry.labelBox(node.id)]));
  geometry.placeCluster(nodes, { x: -1200, y: 950 }, [], positions, sizes);
  const box = geometry.bounds({ nodes, edges: [] }, positions, sizes, 0);
  assert.equal(box.minX + box.width / 2, -1200); assert.equal(box.minY + box.height / 2, 950);
  geometry.placeCluster([], { x: 0, y: 0 }, [], positions, sizes);
  assert.equal(positions.size, 3);
});
const fixture = (count: number) => {
  const nodes = Array.from({ length: count }, (_, index) => ({ id: String(index),
    label: `function_${index}`, relativePath: `${"long-directory/".repeat(index % 6)}function_${index}.m`, path: `/fixture/${index}.m` }));
  const edges = nodes.slice(1).map((node, index) => ({ id: `e${index}`, source: String(index), target: node.id }));
  return { nodes, edges };
};
function assertNoOverlaps(data: ReturnType<typeof fixture>, positions: Map<string, any>, sizes: Map<string, any>) {
  for (let a = 0; a < data.nodes.length; a++) for (let b = a + 1; b < data.nodes.length; b++) {
    const first = data.nodes[a]!, second = data.nodes[b]!, pa = positions.get(first.id), pb = positions.get(second.id);
    const sa = sizes.get(first.id), sb = sizes.get(second.id);
    assert.ok(Math.abs(pa.x - pb.x) >= (sa.width + sb.width) / 2 || Math.abs(pa.y - pb.y) >= (sa.height + sb.height) / 2,
      `${first.id} overlaps ${second.id}`);
  }
}

test("wrapped full labels preserve Unicode and XML characters without truncation", () => {
  const label = "a very long directory/".repeat(9) + "Δ_é_😀<&\".m";
  const box = geometry.labelBox(label);
  assert.equal(box.lines.join(""), label);
  assert.ok(box.lines.length > 1);
  assert.ok(box.width <= 360);
  assert.equal(box.height, box.lines.length * 16 + 22);
});

for (const kind of ["grid", "circle", "hierarchical", "separate"]) {
  test(`${kind} prevents rectangle overlap with 515 mixed-width/multiline nodes`, () => {
    const data = fixture(515), positions = new Map<string, any>();
    const sizes = new Map(data.nodes.map((node) => [node.id, geometry.labelBox(node.relativePath)]));
    if (kind === "separate") { for (const node of data.nodes) positions.set(node.id, { x: 0, y: 0 }); geometry.separate(data.nodes, positions, sizes); }
    else if (kind === "hierarchical") geometry.hierarchical(data, positions, sizes);
    else geometry[kind](data.nodes, positions, sizes);
    assertNoOverlaps(data, positions, sizes);
    const box = geometry.bounds(data, positions, sizes), view = geometry.fit(box, 900, 500);
    assert.ok(box.minX * view.k + view.x >= -1e-6);
    assert.ok(box.minY * view.k + view.y >= -1e-6);
    assert.ok((box.minX + box.width) * view.k + view.x <= 900 + 1e-6);
    assert.ok((box.minY + box.height) * view.k + view.y <= 500 + 1e-6);
  });
}

test("hierarchical ranks handle cycles, disconnected components, and a 5000-node chain", () => {
  const data = fixture(5);
  data.edges = [{ id: "a", source: "0", target: "1" }, { id: "b", source: "1", target: "0" },
    { id: "c", source: "1", target: "2" }, { id: "d", source: "3", target: "4" }];
  const sizes = new Map(data.nodes.map((node) => [node.id, geometry.labelBox(node.relativePath)])), positions = new Map<string, any>();
  geometry.hierarchical(data, positions, sizes);
  assert.equal(positions.get("0").x, positions.get("1").x);
  assert.ok(positions.get("2").x > positions.get("1").x);
  assertNoOverlaps(data, positions, sizes);
  const chain = fixture(5000), chainPositions = new Map<string, any>();
  geometry.hierarchical(chain, chainPositions, new Map(chain.nodes.map((node) => [node.id, geometry.labelBox(node.relativePath)])));
  assert.equal(chainPositions.size, 5000);
  assert.ok(chainPositions.get("4999").x > chainPositions.get("0").x);
});

test("edge endpoints meet rectangle boundaries at all angles without reversing direction", () => {
  const sizes = new Map([["a", { width: 330, height: 42 }], ["b", { width: 240, height: 70 }]]);
  for (const [x, y] of [[500, 0], [0, 300], [-500, 0], [0, -300], [500, 300]]) {
    const positions = new Map([["a", { x: 0, y: 0 }], ["b", { x: x!, y: y! }]]);
    const edge = geometry.edgeGeometry({ source: "a", target: "b" }, positions, sizes);
    assert.ok((edge.x2 - edge.x1) * x! + (edge.y2 - edge.y1) * y! > 0);
    const boundary = geometry.boundary({ x: 0, y: 0 }, sizes.get("a"), { x, y });
    assert.ok(Math.abs(Math.abs(boundary.x) - 165) < 1e-6 || Math.abs(Math.abs(boundary.y) - 21) < 1e-6);
  }
});

test("self-loop bounds and full-graph SVG are independent of pan/zoom and retain vector arrows/full labels", () => {
  const data = fixture(3); data.nodes[1]!.relativePath += "<&éΔ";
  data.edges.push({ id: "loop", source: "1", target: "1" });
  const sizes = new Map(data.nodes.map((node) => [node.id, geometry.labelBox(node.relativePath)])), positions = new Map<string, any>();
  geometry.grid(data.nodes, positions, sizes);
  const first = geometry.svgDocument(data, positions, sizes, { scope: "graph", transform: { x: -99999, y: 555, k: 8 }, selectedId: "1" });
  const second = geometry.svgDocument(data, positions, sizes, { scope: "graph", transform: { x: 0, y: 0, k: 1 }, selectedId: "1" });
  assert.equal(first.source, second.source);
  assert.equal((first.source.match(/data-node-id=/g) || []).length, 3);
  assert.equal((first.source.match(/data-edge-id=/g) || []).length, 3);
  assert.ok(first.source.includes('marker-end="url(#arrow-selected)"'));
  assert.ok(first.source.includes("&lt;&amp;éΔ"));
  assert.ok(!/<image|foreignObject|<script|…/.test(first.source));
  const viewport = geometry.svgDocument(data, positions, sizes, { scope: "viewport", width: 800, height: 600, transform: { x: 3, y: 4, k: 2 } });
  assert.ok(viewport.source.includes('viewBox="0 0 800 600"'));
  assert.ok(viewport.source.includes('transform="translate(3,4) scale(2)"'));
});

test("PNG dimensions are explicit and unsafe canvas sizes fail with actionable alternatives", () => {
  const result = geometry.rasterSize(1000, 500, 4);
  assert.equal(result.width, 4000); assert.equal(result.height, 2000);
  for (const size of [[20000, 300, 1], [6000, 6000, 1], [NaN, 1, 1], [0, 0, 2]]) {
    assert.throws(() => geometry.rasterSize(...size), /Choose SVG/);
  }
});
