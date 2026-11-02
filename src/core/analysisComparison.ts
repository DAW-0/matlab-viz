import * as path from "node:path";
import { buildEntryPointReport, buildImpactReport } from "./entryPointReport";
import { validateGraph, type AnalysisProblem, type DependencyGraph, type GraphEdge, type GraphNode, type ProductDependency } from "../model";

export interface AnalysisBaseline {
  baselineVersion: 1;
  kind: "matlab-viz-analysis-baseline";
  savedAt: string;
  graph: DependencyGraph;
}
export interface EvidenceDelta<T> { added: T[]; removed: T[]; unchanged: number }
export interface NodeChange { before: GraphNode; after: GraphNode; fields: string[] }
export interface LinkEvidence { source: string; target: string; kind: string; records: GraphEdge[] }
export interface LinkChange { before: LinkEvidence; after: LinkEvidence }
export interface GraphDelta {
  nodes: EvidenceDelta<GraphNode> & { changed: NodeChange[] };
  links: EvidenceDelta<LinkEvidence> & { changed: LinkChange[] };
}
export interface ComparisonScope extends GraphDelta {
  mode: "dependencies" | "impact";
  selectedFile: GraphNode;
  status: "compared" | "seed-absent-in-baseline";
  beforeNodes?: number;
  afterNodes: number;
  beforeLinks?: number;
  afterLinks: number;
}
export interface AnalysisComparison extends GraphDelta {
  comparisonVersion: 1;
  kind: "matlab-viz-analysis-comparison";
  baseline: { savedAt: string; analysis: DependencyGraph["metadata"] };
  current: DependencyGraph["metadata"];
  notices: EvidenceDelta<AnalysisProblem>;
  products: EvidenceDelta<ProductDependency>;
  /** Retain unchanged coverage evidence too; absence from a delta is not safety. */
  analysisNotices: { baseline: AnalysisProblem[]; current: AnalysisProblem[] };
  productEvidence: { baseline: ProductDependency[]; current: ProductDependency[] };
  coverageDifferences: Array<{ field: string; before: unknown; after: unknown }>;
  scope?: ComparisonScope;
  limitations: string[];
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const absolute = (value: string) => /^(?:[a-z]:[\\/]|\\\\|\/)/i.test(value);
/** Windows locations are case-insensitive; POSIX paths and native names are not. */
function location(value: string): string {
  const windows = /^(?:[a-z]:[\\/]|\\\\|\/\/)/i.test(value);
  let normalized = path.posix.normalize(windows ? value.replaceAll("\\", "/") : value);
  // posix.normalize collapses UNC's double slash. Retain it so an unrelated
  // POSIX /server/share tree cannot be mistaken for a Windows network root.
  if (windows && /^[\\/]{2}/.test(value)) normalized = `/${normalized}`;
  if (normalized.length > 1 && !/^[a-z]:\/$/i.test(normalized)) normalized = normalized.replace(/\/+$/, "");
  return windows ? normalized.toLowerCase() : normalized;
}
function nodeKey(node: GraphNode): string {
  if (node.unresolved) return `name:${node.path}`;
  if (!absolute(node.path)) throw new Error("Comparison requires established absolute file paths; unresolved names must be explicitly marked. No locations are guessed.");
  return `file:${location(node.path)}`;
}
function fileEvidence(file: string | undefined, index: IndexedGraph): string {
  if (!file) return "none:";
  // Exact unresolved text wins, including names containing separators.
  if (index.names.has(file)) return `name:${file}`;
  if (absolute(file)) return `file:${location(file)}`;
  if (/[\\/]/.test(file)) return `file:${location(`${index.graph.metadata.root.replace(/[\\/]$/, "")}/${file.replaceAll("\\", "/")}`)}`;
  return `name:${file}`;
}

interface IndexedGraph { graph: DependencyGraph; nodes: Map<string, GraphNode>; ids: Map<string, string>; names: Set<string> }
/** Reject ambiguous identities rather than comparing volatile analyzer IDs. */
function indexGraph(graph: DependencyGraph): IndexedGraph {
  if ((graph.metadata.graphType ?? "files") !== "files") throw new Error("Analysis comparison requires file dependency graphs, not call or reference graphs.");
  if (graph.metadata.schemaVersion !== 1) throw new Error("Unsupported graph schema for analysis comparison; regenerate both analyses with a supported version.");
  if (!absolute(graph.metadata.root)) throw new Error("Comparison requires an absolute analysis root.");
  if ((graph.metadata.analysisIncludeExternal !== undefined && typeof graph.metadata.analysisIncludeExternal !== "boolean")
    || (graph.metadata.searchRoots !== undefined && (!Array.isArray(graph.metadata.searchRoots) || graph.metadata.searchRoots.some(value => typeof value !== "string")))) {
    throw new Error("Invalid recorded coverage metadata in comparison graph.");
  }
  const nodes = new Map<string, GraphNode>(), ids = new Map<string, string>();
  for (const node of graph.nodes) {
    if (!node.id || !node.path || ["unresolved", "missing", "external"].some(field => {
      const value = node[field as "unresolved" | "missing" | "external"]; return value !== undefined && typeof value !== "boolean";
    })) throw new Error("Invalid node identity or status in comparison graph.");
    const key = nodeKey(node);
    if (nodes.has(key) || ids.has(node.id)) throw new Error("Ambiguous duplicate file/name or node ID in comparison graph; no matching is guessed.");
    nodes.set(key, node); ids.set(node.id, key);
  }
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (!edge.id || edgeIds.has(edge.id) || !ids.has(edge.source) || !ids.has(edge.target) || (edge.details !== undefined && typeof edge.details !== "string")) {
      throw new Error("Comparison graph has duplicate links, invalid link details, or absent endpoints; repair/regenerate the analysis before comparing.");
    }
    edgeIds.add(edge.id);
  }
  if (graph.problems.some(item => item.file !== undefined && typeof item.file !== "string")
    || graph.products.some(item => item.introducedBy !== undefined && typeof item.introducedBy !== "string")) {
    throw new Error("Invalid file/name evidence in analysis notices or product records.");
  }
  return { graph, nodes, ids, names: new Set(graph.nodes.filter(node => node.unresolved).map(node => node.path)) };
}

export function createAnalysisBaseline(graph: DependencyGraph, savedAt = new Date().toISOString()): AnalysisBaseline {
  const copy = validateGraph(clone(graph)); indexGraph(copy);
  if (!Number.isFinite(Date.parse(savedAt))) throw new Error("Invalid baseline save time.");
  return { baselineVersion: 1, kind: "matlab-viz-analysis-baseline", savedAt, graph: copy };
}
export function readAnalysisBaseline(value: unknown): AnalysisBaseline {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid MATLAB Viz analysis baseline document.");
  const item = value as Partial<AnalysisBaseline>;
  if (item.kind !== "matlab-viz-analysis-baseline" || item.baselineVersion !== 1 || typeof item.savedAt !== "string") {
    throw new Error("Expected a version-1 MATLAB Viz analysis baseline, not a graph/report export or unsupported baseline version.");
  }
  return createAnalysisBaseline(validateGraph(clone(item.graph)), item.savedAt);
}

function multiset<T>(before: T[], after: T[], key: (item: T, side: "before" | "after") => string): EvidenceDelta<T> {
  const remaining = new Map<string, T[]>();
  for (const item of before) { const id = key(item, "before"), list = remaining.get(id) ?? []; list.push(item); remaining.set(id, list); }
  const added: T[] = []; let unchanged = 0;
  for (const item of after) { const list = remaining.get(key(item, "after")); if (list?.length) { list.pop(); unchanged++; } else added.push(item); }
  return { added, removed: [...remaining.values()].flat(), unchanged };
}
function links(index: IndexedGraph, edges: GraphEdge[]): Map<string, LinkEvidence> {
  const result = new Map<string, LinkEvidence>();
  for (const edge of edges) {
    const source = index.ids.get(edge.source)!, target = index.ids.get(edge.target)!;
    const key = JSON.stringify([source, target, edge.kind]);
    const item = result.get(key) ?? { source, target, kind: edge.kind, records: [] };
    item.records.push(edge); result.set(key, item);
  }
  return result;
}
function graphDelta(before: IndexedGraph, after: IndexedGraph, beforeNodes = before.graph.nodes, afterNodes = after.graph.nodes,
  beforeEdges = before.graph.edges, afterEdges = after.graph.edges): GraphDelta {
  const oldNodes = new Map(beforeNodes.map(node => [nodeKey(node), node])), newNodes = new Map(afterNodes.map(node => [nodeKey(node), node]));
  const added: GraphNode[] = [], removed: GraphNode[] = [], changed: NodeChange[] = []; let unchanged = 0;
  // File contents are deliberately not compared: only these recorded attributes
  // are evidence. Reordered IDs/labels and display-relative paths are not edits.
  const fields = ["kind", "missing", "external", "extension", "unresolved"] as const;
  const attribute = (node: GraphNode, field: typeof fields[number]) => field === "unresolved" ? Boolean(node.unresolved)
    : node.unresolved && (field === "missing" || field === "external") ? "not-established" : node[field] ?? null;
  for (const [key, node] of newNodes) {
    const previous = oldNodes.get(key);
    if (!previous) { added.push(node); continue; }
    const differences = fields.filter(field => attribute(previous, field) !== attribute(node, field));
    if (differences.length) changed.push({ before: previous, after: node, fields: differences }); else unchanged++;
  }
  for (const [key, node] of oldNodes) if (!newNodes.has(key)) removed.push(node);
  const oldLinks = links(before, beforeEdges), newLinks = links(after, afterEdges);
  const addedLinks: LinkEvidence[] = [], removedLinks: LinkEvidence[] = [], changedLinks: LinkChange[] = []; let sameLinks = 0;
  const details = (item: LinkEvidence) => JSON.stringify(item.records.map(edge => edge.details ?? "").sort());
  for (const [key, item] of newLinks) {
    const previous = oldLinks.get(key);
    if (!previous) addedLinks.push(item);
    else if (details(previous) !== details(item)) changedLinks.push({ before: previous, after: item });
    else sameLinks++;
  }
  for (const [key, item] of oldLinks) if (!newLinks.has(key)) removedLinks.push(item);
  return { nodes: { added, removed, changed, unchanged }, links: { added: addedLinks, removed: removedLinks, changed: changedLinks, unchanged: sameLinks } };
}

export function compareAnalyses(baseline: AnalysisBaseline, current: DependencyGraph,
  scope?: { mode: "dependencies" | "impact"; nodeId: string }): AnalysisComparison {
  // Detach both inputs: validation normalizes metadata, and exported reports
  // must remain exact snapshots even if callers later mutate their graph.
  const saved = readAnalysisBaseline(baseline), after = indexGraph(validateGraph(clone(current))), before = indexGraph(saved.graph);
  if (location(before.graph.metadata.root) !== location(after.graph.metadata.root)) {
    throw new Error("Baseline and current analysis have different roots. Select a baseline from this same repository/root; automatic relocation matching is not supported.");
  }
  const oldMeta = before.graph.metadata, newMeta = after.graph.metadata;
  const coverageDifferences: AnalysisComparison["coverageDifferences"] = [];
  for (const field of ["mode", "matlabVersion", "analysisIncludeExternal", "searchRoots", "projectName"] as const) {
    // Lookup order can change which same-named MATLAB file resolves. Normalize
    // path spelling, but never sort away that recorded precedence evidence.
    const normalize = (value: unknown) => field === "searchRoots" && Array.isArray(value) ? value.map(item => location(String(item))) : value ?? null;
    if (JSON.stringify(normalize(oldMeta[field])) !== JSON.stringify(normalize(newMeta[field]))) {
      coverageDifferences.push({ field, before: oldMeta[field] ?? null, after: newMeta[field] ?? null });
    }
  }
  const result: AnalysisComparison = {
    comparisonVersion: 1, kind: "matlab-viz-analysis-comparison", baseline: { savedAt: saved.savedAt, analysis: oldMeta }, current: newMeta,
    ...graphDelta(before, after),
    notices: multiset(before.graph.problems, after.graph.problems, (item, side) => JSON.stringify([item.severity, item.message, fileEvidence(item.file, side === "before" ? before : after)])),
    products: multiset(before.graph.products, after.graph.products, (item, side) => JSON.stringify([item.name, item.version ?? null, item.productNumber ?? null, item.certain ?? null, fileEvidence(item.introducedBy, side === "before" ? before : after)])),
    analysisNotices: { baseline: before.graph.problems, current: after.graph.problems },
    productEvidence: { baseline: before.graph.products, current: after.graph.products },
    coverageDifferences,
    limitations: [
      "This compares saved static analysis evidence, not source contents, runtime execution, numerical behavior or predicted breakage. Unchanged node metadata does not prove unchanged code.",
      "File identity uses established absolute paths (Windows case-insensitive, POSIX case-sensitive); native unresolved names use exact text. Analyzer IDs and ordering are ignored. Renames/moves appear as removal plus addition; no rename or relocation inference is made.",
      "Links match original source/target file identities and relationship kind. Changes in details or parallel-record count are reported separately. Original arrows are preserved; link IDs are not stable identities.",
      "Notices match severity, exact message and normalized exact file/name evidence, preserving duplicate counts. No longer reported does not prove resolved; wording or coverage changes can remove/add notices.",
      "Analysis backend, MATLAB version, external policy and lookup roots can change coverage. Differences are listed, not attributed automatically to code changes. Other analysis options, path state, toolboxes, exclusions, dynamic dependencies and truncation may not be fully recorded.",
      "All original baseline/current analysis notices must still be reviewed, including unchanged ones. Zero differences does not prove equal behavior, complete coverage, or a safe change. Product differences are evidence, not license checks.",
      "View filters, grouping, cycle isolation and trace depth do not affect this comparison. No MATLAB run, disk existence check or source execution was performed. Scope comparison includes all analyzed hops, not a runtime call trace."
    ]
  };
  if (scope) {
    if (!["dependencies", "impact"].includes(scope.mode)) throw new Error("Unsupported comparison scope.");
    const seedKey = after.ids.get(scope.nodeId), selectedFile = seedKey && after.nodes.get(seedKey);
    if (!seedKey || !selectedFile || selectedFile.unresolved) throw new Error("Select an original current file node for scope comparison.");
    const build = scope.mode === "impact" ? buildImpactReport : buildEntryPointReport;
    const newScope = build(after.graph, selectedFile.id), oldSeed = before.nodes.get(seedKey);
    const oldScope = oldSeed ? build(before.graph, oldSeed.id) : undefined;
    // An absent baseline seed is not an empty analyzed scope. Expose unavailable
    // comparison explicitly rather than manufacturing an 'all nodes added' diff.
    const delta = oldScope ? graphDelta(before, after, oldScope.nodes.map(item => item.node), newScope.nodes.map(item => item.node), oldScope.edges, newScope.edges)
      : { nodes: { added: [], removed: [], changed: [], unchanged: 0 }, links: { added: [], removed: [], changed: [], unchanged: 0 } };
    result.scope = { mode: scope.mode, selectedFile, status: oldScope ? "compared" : "seed-absent-in-baseline",
      ...(oldScope ? { beforeNodes: oldScope.nodes.length, beforeLinks: oldScope.edges.length } : {}), afterNodes: newScope.nodes.length, afterLinks: newScope.edges.length, ...delta };
  }
  return result;
}

/** Human-readable export; the complete JSON is authoritative for record details. */
export function comparisonToMarkdown(report: AnalysisComparison): string {
  const cell = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll("|", "&#124;").replaceAll("`", "&#96;").replace(/[\r\n]+/g, " ");
  const lines = ["# MATLAB Viz analysis comparison", "", `Root: ${cell(report.current.root)}`,
    `Baseline analysis: ${cell(report.baseline.analysis.generatedAt)}; saved: ${cell(report.baseline.savedAt)}`,
    `Current analysis: ${cell(report.current.generatedAt)}`, "", "## Coverage differences", "",
    ...report.coverageDifferences.map(item => `- ${cell(item.field)}: ${cell(JSON.stringify(item.before))} → ${cell(JSON.stringify(item.after))}`),
    ...(report.coverageDifferences.length ? [] : ["No differences in the recorded coverage fields; unrecorded options may still differ."]), "",
    "## Limits and interpretation", "", ...report.limitations.map(item => `- ${cell(item)}`), ""];
  function delta(title: string, value: GraphDelta) {
    lines.push(`## ${title}`, "", `Nodes: ${value.nodes.added.length} added, ${value.nodes.removed.length} removed, ${value.nodes.changed.length} metadata changed, ${value.nodes.unchanged} unchanged metadata.`,
      `Relationships: ${value.links.added.length} added, ${value.links.removed.length} removed, ${value.links.changed.length} evidence changed, ${value.links.unchanged} unchanged.`, "");
    for (const [label, nodes] of [["Added nodes", value.nodes.added], ["Removed nodes", value.nodes.removed]] as const) {
      lines.push(`### ${label}`, "", ...nodes.map(node => `- ${cell(node.path)}${node.unresolved ? " (unresolved name)" : ""}`), "");
    }
    lines.push("### Node metadata changes", "", ...value.nodes.changed.map(item => `- ${cell(item.after.path)}: ${cell(item.fields.join(", "))}; before ${cell(JSON.stringify(item.before))}; after ${cell(JSON.stringify(item.after))}`), "");
    for (const [label, links] of [["Added relationships", value.links.added], ["Removed relationships", value.links.removed]] as const) {
      lines.push(`### ${label}`, "", ...links.map(item => `- ${cell(item.source)} → ${cell(item.target)} (${cell(item.kind)}): ${cell(JSON.stringify(item.records))}`), "");
    }
    lines.push("### Relationship evidence changes", "", ...value.links.changed.map(item => `- ${cell(item.after.source)} → ${cell(item.after.target)} (${cell(item.after.kind)}): before ${cell(JSON.stringify(item.before.records))}; after ${cell(JSON.stringify(item.after.records))}`), "");
  }
  delta("Entire analysis", report);
  if (report.scope) {
    lines.push("## Selected scope", "", `${report.scope.mode}: ${cell(report.scope.selectedFile.path)}`, `Status: ${report.scope.status}`, "");
    if (report.scope.status === "compared") {
      lines.push(`Nodes: ${report.scope.beforeNodes} → ${report.scope.afterNodes}; original links: ${report.scope.beforeLinks} → ${report.scope.afterLinks}.`, "");
      delta("Scope differences", report.scope);
    } else lines.push("The seed was absent from the baseline. Its previous scope is unavailable, not assumed empty.", "");
  }
  for (const [label, items] of [["Notices newly reported", report.notices.added], ["Notices no longer reported (not proven resolved)", report.notices.removed],
    ["Product records added", report.products.added], ["Product records removed", report.products.removed],
    ["All baseline notices", report.analysisNotices.baseline], ["All current notices", report.analysisNotices.current],
    ["All baseline product evidence", report.productEvidence.baseline], ["All current product evidence", report.productEvidence.current]] as const) {
    lines.push(`## ${label}`, "", ...items.map(item => `- ${cell(JSON.stringify(item))}`), "");
  }
  return lines.join("\n");
}
