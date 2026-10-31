import type { DependencyGraph, SourcePosition, SourceRange, StoredAnalysisTarget, StoredSymbol } from "../model";

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function position(value: unknown): value is SourcePosition {
  return record(value) && Number.isInteger(value.line) && Number(value.line) >= 0
    && Number.isInteger(value.character) && Number(value.character) >= 0;
}

function compare(a: SourcePosition, b: SourcePosition): number {
  return a.line - b.line || a.character - b.character;
}

function range(value: unknown): value is SourceRange {
  return record(value) && position(value.start) && position(value.end) && compare(value.start, value.end) <= 0;
}

function symbol(value: unknown): value is StoredSymbol {
  return record(value) && typeof value.name === "string" && value.name.length > 0
    && typeof value.path === "string" && value.path.length > 0
    && Number.isInteger(value.kind) && Number(value.kind) >= 0 && Number(value.kind) <= 255
    && range(value.range) && range(value.selectionRange)
    && compare(value.range.start, value.selectionRange.start) <= 0
    && compare(value.selectionRange.end, value.range.end) <= 0
    && (value.containerName === undefined || typeof value.containerName === "string");
}

/** Cache records contain JSON values, never live editor objects or callbacks. */
export function readAnalysisTarget(graph: DependencyGraph): StoredAnalysisTarget | undefined {
  const value: unknown = graph.metadata.analysisTarget;
  const type = graph.metadata.graphType ?? "files";
  if (value === undefined) {
    if (type === "files") return { version: 1, type: "files" };
    // Older reference graphs can recover an unambiguous declaration anchor.
    // Older call graphs did not save direction; do not guess or run a file scan.
    if (type === "references" && graph.metadata.rootSymbol) {
      const candidates = graph.nodes.filter((node) => node.label === graph.metadata.rootSymbol
        && typeof node.path === "string" && node.path.length > 0
        && position({ line: node.line, character: node.character }));
      const node = candidates.length === 1 ? candidates[0] : undefined;
      if (node) return { version: 1, type: "references", anchor: {
        path: node.path, position: { line: node.line!, character: node.character! }
      } };
    }
    return undefined;
  }
  if (!record(value) || value.version !== 1 || value.type !== type) return undefined;
  if (value.type === "files") return { version: 1, type: "files" };
  if (value.type === "call-hierarchy" && ["both", "incoming", "outgoing"].includes(String(value.direction))
    && symbol(value.seed)) {
    return value as unknown as StoredAnalysisTarget;
  }
  if (value.type === "references" && record(value.anchor) && typeof value.anchor.path === "string"
    && value.anchor.path.length > 0 && position(value.anchor.position)) {
    return value as unknown as StoredAnalysisTarget;
  }
  return undefined;
}

export function storeCallTarget(direction: "both" | "incoming" | "outgoing", seed: {
  name: string; kind: number; uri: { fsPath: string }; range: SourceRange; selectionRange: SourceRange; containerName?: string
}): StoredAnalysisTarget {
  const copyPosition = (value: SourcePosition): SourcePosition => ({ line: value.line, character: value.character });
  const copyRange = (value: SourceRange): SourceRange => ({ start: copyPosition(value.start), end: copyPosition(value.end) });
  return { version: 1, type: "call-hierarchy", direction, seed: {
    name: seed.name, kind: seed.kind, path: seed.uri.fsPath, range: copyRange(seed.range),
    selectionRange: copyRange(seed.selectionRange), ...(seed.containerName ? { containerName: seed.containerName } : {})
  } };
}

export function storeReferenceTarget(anchor: { uri: { fsPath: string }; position: SourcePosition }): StoredAnalysisTarget {
  return { version: 1, type: "references", anchor: {
    path: anchor.uri.fsPath, position: { line: anchor.position.line, character: anchor.position.character }
  } };
}
