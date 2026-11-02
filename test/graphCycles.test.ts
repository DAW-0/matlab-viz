import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import test from "node:test";
import * as vm from "node:vm";

const adapter = { exports: {} as any };
vm.runInNewContext(readFileSync(path.resolve(__dirname, "../../media/graphCycles.js"), "utf8"), { module: adapter });
const cycles = adapter.exports;
function graph(ids: string[], pairs: string[][]) {
  return { nodes: ids.map((id) => ({ id, label: id })), edges: pairs.map(([source, target], i) => ({ id: `edge${i}`, source, target })) };
}
function validateWitness(component: any, value: ReturnType<typeof graph>) {
  assert.ok(component.witness.edges.length > 0);
  assert.equal(component.witness.nodes[0], component.witness.nodes.at(-1));
  assert.equal(component.witness.edges.length + 1, component.witness.nodes.length);
  component.witness.edges.forEach((id: string, i: number) => {
    const edge = value.edges.find((edge) => edge.id === id)!; assert.ok(edge);
    assert.equal(edge.source, component.witness.nodes[i]); assert.equal(edge.target, component.witness.nodes[i + 1]);
    assert.ok(component.nodes.some((node: any) => node.id === edge.source));
  });
}

test("empty/acyclic/dangling graphs do not acquire cycles from node order or parallel edges", () => {
  for (const value of [graph([], []), graph(["a"], []), graph(["c", "b", "a"], [["a", "b"], ["a", "b"], ["b", "c"], ["c", "absent"]])]) {
    assert.equal(cycles.analyze(value).components.length, 0);
  }
});

test("self-links, mutual recursion, multiple loops in one SCC and one-way intercomponent links are distinguished", () => {
  const value = graph(["a", "b", "c", "d", "e", "f", "g"], [["a", "b"], ["b", "a"], ["b", "c"], ["c", "b"], ["c", "d"], ["d", "d"], ["e", "f"], ["f", "e"], ["f", "g"]]);
  const saved = JSON.stringify(value), index = cycles.analyze(value);
  assert.deepEqual(Array.from(index.components, (component: any) => component.nodes.length), [3, 2, 1]);
  assert.equal(index.edgeToComponent.size, 7, "bridges/tails were marked cyclic");
  assert.equal(index.components[2].selfLinks, 1);
  index.components.forEach((component: any) => validateWitness(component, value));
  assert.equal(JSON.stringify(value), saved);
});

test("grouped-looking opposite arrows without an original return path are not cycles", () => {
  const value = graph(["folderA/a", "folderA/b", "folderB/a", "folderB/b"], [["folderA/a", "folderB/a"], ["folderB/b", "folderA/b"]]);
  assert.equal(cycles.analyze(value).components.length, 0);
});

test("selection and component IDs are stable, collision-free for arbitrary original IDs, and preserve parallel evidence", () => {
  const value = graph(["all", "component:\"all\"", "<x>"], [["all", "all"], ["all", "all"], ["component:\"all\"", "<x>"], ["<x>", "component:\"all\""]]);
  const index = cycles.analyze(value), reordered = cycles.analyze({ nodes: [...value.nodes].reverse(), edges: [...value.edges].reverse() });
  assert.deepEqual(Array.from(index.byId.keys()).sort(), Array.from(reordered.byId.keys()).sort());
  const all = cycles.selection(index); assert.equal(all.nodes.size, 3); assert.equal(all.edges.size, 4);
  const single = cycles.selection(index, index.nodeToComponent.get("all"));
  assert.equal(single.nodes.size, 1); assert.equal(single.edges.size, 2);
  assert.equal(cycles.selection(index, "missing").components.length, 0);
  index.components.forEach((component: any) => validateWitness(component, value));
});

test("SCC membership agrees with independent reachability on 200 deterministic random directed graphs", () => {
  let seed = 41;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let run = 0; run < 200; run++) {
    const ids = Array.from({ length: 8 }, (_, i) => String(i)), pairs: string[][] = [];
    for (const a of ids) for (const b of ids) if (random() < .16) pairs.push([a, b]);
    const value = graph(ids, pairs), index = cycles.analyze(value);
    const reach = ids.map(() => ids.map(() => false));
    pairs.forEach(([a, b]) => { reach[Number(a)]![Number(b)] = true; });
    for (let k = 0; k < 8; k++) for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) reach[a]![b] ||= reach[a]![k]! && reach[k]![b]!;
    for (const a of ids) {
      assert.equal(index.nodeToComponent.has(a), reach[Number(a)]![Number(a)], `run ${run}, node ${a}`);
      for (const b of ids) if (index.nodeToComponent.has(a)) assert.equal(index.nodeToComponent.get(a) === index.nodeToComponent.get(b), reach[Number(a)]![Number(b)]! && reach[Number(b)]![Number(a)]!);
    }
    index.components.forEach((component: any) => validateWitness(component, value));
  }
});

test("a 50000-node chain/ring avoids recursion limits and retains a real full-length witness", () => {
  const ids = Array.from({ length: 50_000 }, (_, i) => String(i));
  const value = graph(ids, ids.slice(1).map((id, i) => [String(i), id]));
  assert.equal(cycles.analyze(value).components.length, 0);
  value.edges.push({ id: "closing", source: ids.at(-1)!, target: "0" });
  const start = performance.now(), index = cycles.analyze(value);
  assert.equal(index.components.length, 1); assert.equal(index.components[0].nodes.length, 50_000);
  assert.equal(index.components[0].edges.length, 50_000); assert.equal(index.components[0].witness.edges.length, 50_000);
  assert.equal(index.components[0].witness.nodes[0], index.components[0].witness.nodes.at(-1));
  assert.ok(performance.now() - start < 15_000, "ring analysis exceeded a generous 15-second regression bound");
});
