import assert from "node:assert/strict";
import test from "node:test";
import { readAnalysisTarget, storeCallTarget, storeReferenceTarget } from "../src/core/analysisState";
import type { DependencyGraph } from "../src/model";

function graph(type: "files" | "call-hierarchy" | "references", target?: unknown): DependencyGraph {
  return { metadata: { schemaVersion: 1, generatedAt: "cached", root: "/fixture", mode: "language-service", graphType: type,
    matlabVersion: "test", durationSeconds: 0, ...(target === undefined ? {} : { analysisTarget: target as any }) },
    nodes: [], edges: [], products: [], problems: [] };
}

test("call target serialization is detached from mutable editor objects", () => {
  const seed = { name: "entry", kind: 12, uri: { fsPath: "/fixture/entry.m" },
    range: { start: { line: 0, character: 0 }, end: { line: 3, character: 0 } },
    selectionRange: { start: { line: 0, character: 17 }, end: { line: 0, character: 22 } } };
  const target = storeCallTarget("outgoing", seed);
  seed.range.end.line = 99;
  const restored = readAnalysisTarget(graph("call-hierarchy", JSON.parse(JSON.stringify(target))));
  assert.equal(restored?.type, "call-hierarchy");
  if (restored?.type !== "call-hierarchy") assert.fail();
  assert.equal(restored.direction, "outgoing");
  assert.equal(restored.seed.range.end.line, 3);
});

test("reference targets survive JSON with file paths and exact cursor positions", () => {
  const target = storeReferenceTarget({ uri: { fsPath: "C:\\fixture\\file.m" }, position: { line: 8, character: 4 } });
  assert.deepEqual(readAnalysisTarget(graph("references", JSON.parse(JSON.stringify(target)))), target);
});

test("invalid, future-version, and mismatched targets are rejected", () => {
  for (const target of [null, { version: 2, type: "references", anchor: { path: "/a", position: { line: 0, character: 0 } } },
    { version: 1, type: "files" }, { version: 1, type: "references", anchor: { path: "/a", position: { line: -1, character: 0 } } }]) {
    assert.equal(readAnalysisTarget(graph("references", target)), undefined);
  }
  assert.equal(readAnalysisTarget(graph("call-hierarchy")), undefined);
  assert.deepEqual(readAnalysisTarget(graph("files")), { version: 1, type: "files" });
});

test("legacy variable references recover only an unambiguous declaration location", () => {
  const cached = graph("references"); cached.metadata.rootSymbol = "value";
  cached.nodes = [{ id: "value", label: "value", path: "/fixture/leaf.m", relativePath: "leaf.m#value", extension: ".m",
    kind: "variable", external: false, missing: false, line: 8, character: 0 }];
  assert.deepEqual(readAnalysisTarget(cached), { version: 1, type: "references", anchor: { path: "/fixture/leaf.m", position: { line: 8, character: 0 } } });
  cached.nodes.push({ ...cached.nodes[0]!, id: "other" });
  assert.equal(readAnalysisTarget(cached), undefined);
});
