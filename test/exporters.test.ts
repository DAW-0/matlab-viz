import assert from "node:assert/strict";
import test from "node:test";
import { graphToCsv, graphToDot, reachableNodeIds } from "../src/core/exporters";
import type { DependencyGraph } from "../src/model";

const graph: DependencyGraph = {
  metadata: {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    root: "/project",
    mode: "folder",
    matlabVersion: "test",
    durationSeconds: 0
  },
  nodes: ["a", "b", "c", "d"].map((id) => ({
    id,
    label: `${id}.m`,
    path: `/project/${id}.m`,
    relativePath: `${id}.m`,
    extension: ".m",
    kind: "MATLAB code",
    external: false,
    missing: false
  })),
  edges: [
    { id: "e1", source: "a", target: "b", kind: "call" },
    { id: "e2", source: "b", target: "c", kind: "call" },
    { id: "e3", source: "d", target: "b", kind: "call" }
  ],
  products: [],
  problems: []
};

test("dependency traversal follows edges forward", () => {
  assert.deepEqual([...reachableNodeIds(graph, "a", "dependencies", 2)].sort(), ["a", "b", "c"]);
});

test("impact traversal follows edges backward", () => {
  assert.deepEqual([...reachableNodeIds(graph, "c", "impact", 2)].sort(), ["a", "b", "c", "d"]);
});

test("DOT exporter preserves directed edges", () => {
  const dot = graphToDot(graph);
  assert.match(dot, /"a" -> "b"/);
  assert.match(dot, /digraph MatlabViz/);
});

test("CSV exporter includes paths and edge kinds", () => {
  const csv = graphToCsv(graph);
  assert.match(csv, /source,target,kind,sourcePath,targetPath/);
  assert.match(csv, /a,b,call,\/project\/a\.m,\/project\/b\.m/);
});
