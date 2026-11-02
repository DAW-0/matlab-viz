import type { DependencyGraph } from "../../src/model";

/** Controlled analyzed evidence, not a claim that MATLAB resolves dynamic calls.
 * The corresponding tiny MATLAB sources are under test/fixtures/entryPoint. */
export function entryPointFixture(root = "/fixture"): DependencyGraph {
  const nodes = ["scopeEntry.m", "scopeLeaf.m", "scopeDynamic.m", "scopeOther.m", "MissingInput.mat"].map((name, i) => ({
    id: `n${i}`, label: name, path: `${root}/${name}`, relativePath: name, extension: name.slice(name.lastIndexOf(".")),
    kind: "MATLAB code", external: false, missing: i === 4
  }));
  return {
    metadata: { schemaVersion: 1, generatedAt: "fixture", root, mode: "project", graphType: "files", matlabVersion: "fixture", durationSeconds: 0, analysisIncludeExternal: true },
    nodes: [...nodes, { id: "unknown", label: "UnavailableApi", path: "UnavailableApi", relativePath: "UnavailableApi", extension: "", kind: "unresolved dependency", external: false, missing: false, unresolved: true }],
    edges: [
      { id: "entry-leaf", source: "n0", target: "n1", kind: "function" },
      { id: "leaf-input", source: "n1", target: "n4", kind: "data" },
      { id: "other-api", source: "n3", target: "unknown", kind: "function" }
    ],
    problems: [
      { file: `${root}/MissingInput.mat`, severity: "warning", message: "Referenced file does not exist." },
      { file: "UnavailableApi", severity: "warning", message: "Unresolved name; may also represent workspace state." },
      { severity: "warning", message: "General analysis coverage cannot be established." },
      { file: `${root}/not-in-graph.m`, severity: "error", message: "This file could not be indexed." }
    ],
    products: [{ name: "Fixture Product", introducedBy: `${root}/scopeLeaf.m`, certain: false }, { name: "Unattributed Product" }]
  };
}
