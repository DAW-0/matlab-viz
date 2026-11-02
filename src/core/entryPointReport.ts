import * as path from "node:path";
import type { AnalysisProblem, DependencyGraph, GraphEdge, GraphMetadata, GraphNode, ProductDependency } from "../model";

export type ScopeDisposition = "reachable" | "outside" | "unattributed";
export interface ScopedEvidence<T> {
  item: T;
  disposition: ScopeDisposition;
  /** Original node identities matched by exact file/name evidence, never basenames. */
  nodeIds: string[];
}

export interface EntryPointReport {
  reportVersion: 1;
  kind: "entry-point-dependencies";
  analysis: GraphMetadata;
  entryPoint: GraphNode;
  scope: "all-analyzed-outgoing-dependencies";
  nodes: Array<{ node: GraphNode; depth: number; viaEdgeId?: string }>;
  edges: GraphEdge[];
  notices: ScopedEvidence<AnalysisProblem>[];
  products: ScopedEvidence<ProductDependency>[];
  counts: {
    nodes: number; edges: number; unresolvedNames: number; missingFiles: number;
    reachableNotices: number; outsideNotices: number; unattributedNotices: number;
    repositoryNodes: number; repositoryEdges: number; repositoryNotices: number;
  };
  limitations: string[];
}

/** Reverse reachability is potential change exposure, not a runtime prediction. */
export interface ImpactReport extends Omit<EntryPointReport, "kind" | "scope" | "entryPoint" | "counts"> {
  kind: "file-impact";
  selectedFile: GraphNode;
  scope: "all-analyzed-incoming-dependents";
  counts: EntryPointReport["counts"] & { directDependents: number; totalDependents: number };
}

export interface ImpactDependencyPath extends Omit<EntryPointDependencyPath, "kind" | "entryPointId"> {
  kind: "analyzed-impact-path";
  selectedFileId: string;
}

/** One minimum-hop route through original analyzed links, not an execution trace. */
export interface EntryPointDependencyPath {
  kind: "analyzed-dependency-path";
  entryPointId: string;
  targetId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  hops: number;
  interpretation: string;
}

/**
 * Reconstruct the report's BFS predecessor chain. Equal-length routes can exist;
 * the chosen one follows original edge order and is never inferred from names.
 */
export function buildEntryPointDependencyPath(report: EntryPointReport, targetId: string): EntryPointDependencyPath | undefined {
  const route = buildAnalyzedPath(report, report.entryPoint, targetId, false);
  return route && {
    ...route, kind: "analyzed-dependency-path", entryPointId: report.entryPoint.id, targetId,
    interpretation: "One shortest route through original analyzed file links, not the only route or a runtime execution trace. Dynamic dependencies may be absent; link kinds and details are preserved, not promoted to function calls."
  };
}

/** Return dependent -> selected file, preserving the ORIGINAL arrow direction. */
export function buildImpactDependencyPath(report: ImpactReport, targetId: string): ImpactDependencyPath | undefined {
  const route = buildAnalyzedPath(report, report.selectedFile, targetId, true);
  return route && {
    ...route, kind: "analyzed-impact-path", selectedFileId: report.selectedFile.id, targetId,
    interpretation: "One shortest analyzed dependency route from this dependent to the selected file. Original arrows are not reversed. This is potential change exposure, not proof of runtime execution, breakage, or a required code change. Dynamic dependencies may be absent."
  };
}

function buildAnalyzedPath(report: Pick<EntryPointReport, "nodes" | "edges">, seed: GraphNode, targetId: string, incoming: boolean):
  { nodes: GraphNode[]; edges: GraphEdge[]; hops: number } | undefined {
  const byId = new Map(report.nodes.map(record => [record.node.id, record]));
  const byEdgeId = new Map(report.edges.map(edge => [edge.id, edge]));
  let current = byId.get(targetId);
  if (!current) return undefined;
  const chainNodes: GraphNode[] = [];
  const chainEdges: GraphEdge[] = [];
  const visited = new Set<string>();
  // Iteration avoids call-stack overflow for long dependency chains. Check each
  // predecessor against its recorded BFS depth so corrupt evidence fails closed.
  while (current) {
    if (visited.has(current.node.id) || !Number.isSafeInteger(current.depth) || current.depth < 0) {
      throw new Error("The saved dependency path has invalid predecessor evidence.");
    }
    visited.add(current.node.id);
    chainNodes.push(current.node);
    if (current.node.id === seed.id) {
      if (current.depth !== 0) throw new Error("The saved dependency path has an invalid entry depth.");
      break;
    }
    const edge: GraphEdge | undefined = current.viaEdgeId ? byEdgeId.get(current.viaEdgeId) : undefined;
    const predecessor: EntryPointReport["nodes"][number] | undefined = edge ? byId.get(incoming ? edge.target : edge.source) : undefined;
    if (!edge || !predecessor || (incoming ? edge.source : edge.target) !== current.node.id || predecessor.depth !== current.depth - 1) {
      throw new Error("The saved dependency path has missing or inconsistent link evidence.");
    }
    chainEdges.push(edge);
    current = predecessor;
  }
  // Reverse traversal records ancestors -> seed already. Outgoing traversal
  // records target -> entry, so only that mode needs to reverse the chain.
  if (!incoming) { chainNodes.reverse(); chainEdges.reverse(); }
  return { nodes: chainNodes, edges: chainEdges, hops: chainEdges.length };
}

/**
 * A view-independent report of original analyzed evidence, not a new analysis.
 * Iterative BFS records minimum file hops and a real predecessor edge. Filtering,
 * grouping, cycle isolation and trace-depth controls never enter this function.
 */
export function buildEntryPointReport(graph: DependencyGraph, entryId: string): EntryPointReport {
  const { seed, ...evidence } = buildFileScope(graph, entryId, false);
  return { ...evidence, kind: "entry-point-dependencies", entryPoint: seed, scope: "all-analyzed-outgoing-dependencies" };
}

export function buildImpactReport(graph: DependencyGraph, selectedId: string): ImpactReport {
  const { seed, ...evidence } = buildFileScope(graph, selectedId, true);
  const direct = new Set(evidence.edges.filter(edge => edge.target === selectedId && edge.source !== selectedId).map(edge => edge.source));
  return { ...evidence, kind: "file-impact", selectedFile: seed, scope: "all-analyzed-incoming-dependents",
    counts: { ...evidence.counts, directDependents: direct.size, totalDependents: evidence.nodes.length - 1 } };
}

/** Shared evidence rules; only the traversal index changes for impact reports.
 * Never reverse graph edges: their source/target, kinds and details are evidence. */
function buildFileScope(graph: DependencyGraph, entryId: string, incoming: boolean):
  Omit<EntryPointReport, "kind" | "scope" | "entryPoint"> & { seed: GraphNode } {
  if (graph.metadata.graphType && graph.metadata.graphType !== "files") {
    throw new Error(`${incoming ? "Impact" : "Entry-point"} reports require a file dependency graph, not a call or reference graph.`);
  }
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const entryPoint = byId.get(entryId);
  if (!entryPoint || entryPoint.unresolved) throw new Error(`Select an original file node for the ${incoming ? "impact" : "entry-point"} report.`);
  const adjacency = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) {
    const key = incoming ? edge.target : edge.source;
    const list = adjacency.get(key) ?? [];
    list.push(edge); adjacency.set(key, list);
  }
  const nodes: EntryPointReport["nodes"] = [{ node: entryPoint, depth: 0 }];
  const visited = new Set([entryId]);
  let dangling = 0;
  // Use an index instead of shifting: large chains remain linear-time.
  for (let i = 0; i < nodes.length; i++) {
    const current = nodes[i]!;
    for (const edge of adjacency.get(current.node.id) ?? []) {
      const next = byId.get(incoming ? edge.source : edge.target);
      if (!next) { dangling++; continue; }
      if (!visited.has(next.id)) {
        visited.add(next.id); nodes.push({ node: next, depth: current.depth + 1, viaEdgeId: edge.id });
      }
    }
  }
  const edges = graph.edges.filter(edge => visited.has(edge.source) && visited.has(edge.target));
  const evidence = evidenceIndex(graph);
  function classify<T>(item: T, file: string | undefined): ScopedEvidence<T> {
    // Native unresolved names may contain separators. Exact name evidence takes
    // precedence over interpreting that text as a root-relative filesystem path.
    const nodeIds = file ? [...(evidence.get(`name:${file}`) ?? evidence.get(evidenceKey(file, graph.metadata.root)) ?? [])] : [];
    return { item, nodeIds, disposition: nodeIds.some(id => visited.has(id)) ? "reachable" : nodeIds.length ? "outside" : "unattributed" };
  }
  const notices = graph.problems.map(item => classify(item, item.file));
  const products = graph.products.map(item => classify(item, item.introducedBy));
  const count = (disposition: ScopeDisposition) => notices.filter(item => item.disposition === disposition).length;
  const limitations = [
    incoming ? "Scope includes the selected file and all direct/transitive dependents found by following incoming analyzed links, with no display-depth limit. Counts exclude the selected file from dependents, even in cycles. Original arrow directions are preserved."
      : "Scope includes the entry file and every node reachable through original outgoing analyzed links, with no display-depth limit. It is not a runtime call trace.",
    "Constructed function names, eval, callbacks, object dispatch, workspace state and data-dependent branches may be absent or over-approximated. No dynamic target or inferred link was added.",
    "Reachable notices have exact file/name evidence in scope; outside notices match only nodes outside this trace. Neither category proves runtime necessity or irrelevance.",
    "Unattributed notices have no exact node association. General analysis errors, truncation and unresolved scope must still be reviewed, even when reachable notices are zero.",
    "Coverage is limited to this saved analysis and its backend, search paths and external policy. Hidden or excluded dependencies are not recovered. Product records are evidence, not license checks.",
    "No file existence, path resolution, input data, cache compatibility, simulation or numerical correctness was checked by generating this report."
  ];
  if (incoming) limitations.push("Impact means potential change exposure in this saved static graph, not proof that a file runs, will break, or needs editing. Dependencies used by these dependents but not leading back to the selected file are not included. Zero dependents does not prove a change is safe.");
  if (graph.metadata.analysisIncludeExternal !== true) limitations.push("External analysis was disabled or not recorded; external coverage cannot be assumed.");
  if (dangling) limitations.push(`${dangling} ${incoming ? "incoming" : "outgoing"} link(s) in the trace reference absent nodes; those ${incoming ? "sources" : "targets"} could not be traversed.`);
  return {
    reportVersion: 1, analysis: { ...graph.metadata }, seed: entryPoint,
    nodes, edges, notices, products,
    counts: { nodes: nodes.length, edges: edges.length,
      unresolvedNames: nodes.filter(({ node }) => node.unresolved).length,
      missingFiles: nodes.filter(({ node }) => !node.unresolved && node.missing).length,
      reachableNotices: count("reachable"), outsideNotices: count("outside"), unattributedNotices: count("unattributed"),
      repositoryNodes: graph.nodes.length, repositoryEdges: graph.edges.length, repositoryNotices: graph.problems.length },
    limitations
  };
}

/** Windows paths are case-insensitive; POSIX paths and unresolved names are not. */
function evidenceKey(value: string, root: string): string {
  const windows = /^(?:[a-z]:[\\/]|\\\\|\/\/)/i.test(value);
  if (windows) return `path:${path.posix.normalize(value.replaceAll("\\", "/")).toLowerCase()}`;
  if (value.startsWith("/")) return `path:${path.posix.normalize(value)}`;
  // Only explicit root-relative paths are expanded. Bare unresolved names must
  // never bind to an incidental same-basename file elsewhere in the graph.
  if (/[\\/]/.test(value)) return evidenceKey(`${root.replace(/[\\/]$/, "")}/${value.replaceAll("\\", "/")}`, root);
  return `name:${value}`;
}

function evidenceIndex(graph: DependencyGraph): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    // Bare file paths in old documents do not establish a root binding. They
    // remain unattributed unless explicitly marked as native unresolved names.
    if (!node.unresolved && !/^(?:[a-z]:[\\/]|[\\/])/i.test(node.path)) continue;
    const key = node.unresolved ? `name:${node.path}` : evidenceKey(node.path, graph.metadata.root);
    const ids = index.get(key) ?? new Set<string>(); ids.add(node.id); index.set(key, ids);
  }
  return index;
}

/** Portable, readable companion to the lossless report JSON. All tables are escaped. */
export function entryPointReportToMarkdown(report: EntryPointReport): string {
  return fileScopeReportToMarkdown(report);
}

export function impactReportToMarkdown(report: ImpactReport): string {
  return fileScopeReportToMarkdown(report);
}

function fileScopeReportToMarkdown(report: EntryPointReport | ImpactReport): string {
  const impact = report.kind === "file-impact";
  const seed = impact ? report.selectedFile : report.entryPoint;
  const cell = (value: unknown): string => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll("|", "&#124;").replaceAll("`", "&#96;").replace(/[\r\n]+/g, " ");
  const lines = [impact ? "# MATLAB Viz file impact report" : "# MATLAB Viz entry-point dependency report", "",
    `${impact ? "Selected file" : "Entry point"}: ${cell(seed.path)}`, `Analysis root: ${cell(report.analysis.root)}`,
    `Analysis generated: ${cell(report.analysis.generatedAt)}; backend: ${cell(report.analysis.mode)}`,
    `External analysis: ${report.analysis.analysisIncludeExternal === true ? "enabled" : report.analysis.analysisIncludeExternal === false ? "disabled" : "not recorded"}`, "",
    `Scope: ${report.counts.nodes} original nodes (including ${impact ? "selected file" : "entry"}), ${report.counts.edges} original links, ${report.counts.unresolvedNames} unresolved names, ${report.counts.missingFiles} missing files.`,
    ...(impact ? [`Dependents: ${report.counts.directDependents} direct; ${report.counts.totalDependents} total (excluding selected file). Minimum hops measure each dependent's route toward the selected file; arrows retain original source/target direction.`] : []),
    `Notices: ${report.counts.reachableNotices} reachable, ${report.counts.outsideNotices} outside, ${report.counts.unattributedNotices} unattributed; ${report.counts.repositoryNotices} total.`, "",
    "## Limits and interpretation", "", ...report.limitations.map(limit => `- ${limit}`), "",
    "## Reachable original nodes", "", "| ID | File/name | Minimum hops | Evidence |", "|---|---|---:|---|",
    ...report.nodes.map(({ node, depth }) => `| ${cell(node.id)} | ${cell(node.path)} | ${depth} | ${node.unresolved ? "unresolved name" : node.missing ? "missing file" : "analyzed file (not rechecked)"} |`), "",
    "## Original links in scope", "", "| Source ID | Target ID | Kind | Details |", "|---|---|---|---|",
    ...report.edges.map(edge => `| ${cell(edge.source)} | ${cell(edge.target)} | ${cell(edge.kind)} | ${cell(edge.details)} |`), "",
    "## All analysis notices (nothing suppressed)", "", "| Scope | Severity | File/name | Message |", "|---|---|---|---|",
    ...report.notices.map(({ item, disposition }) => `| ${disposition} | ${cell(item.severity)} | ${cell(item.file)} | ${cell(item.message)} |`), "",
    "## Product evidence (not license validation)", "", "| Scope | Product | Introduced by | Certain |", "|---|---|---|---|",
    ...report.products.map(({ item, disposition }) => `| ${disposition} | ${cell(item.name)} | ${cell(item.introducedBy)} | ${cell(item.certain)} |`), ""];
  return lines.join("\n");
}
