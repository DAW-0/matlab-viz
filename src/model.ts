export type AnalysisMode = "auto" | "project" | "folder";

export interface GraphNode {
  id: string;
  label: string;
  path: string;
  relativePath: string;
  extension: string;
  kind: string;
  external: boolean;
  missing: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  details?: string;
}

export interface ProductDependency {
  name: string;
  version?: string;
  productNumber?: string;
  certain?: boolean;
  introducedBy?: string;
}

export interface AnalysisProblem {
  file?: string;
  message: string;
  severity: "error" | "warning" | "information";
}

export interface GraphMetadata {
  schemaVersion: number;
  generatedAt: string;
  root: string;
  mode: "project" | "folder";
  matlabVersion: string;
  durationSeconds: number;
  projectName?: string;
  nodeCount?: number;
  edgeCount?: number;
}

export interface DependencyGraph {
  metadata: GraphMetadata;
  nodes: GraphNode[];
  edges: GraphEdge[];
  products: ProductDependency[];
  problems: AnalysisProblem[];
}

export interface AnalysisOptions {
  mode: AnalysisMode;
  includeExternal: boolean;
  includeIsolated: boolean;
  maximumFiles: number;
  reanalyzeAll: boolean;
  analyzeReferences: boolean;
  analyzeAddOns: boolean;
  analyzeModelParameters: boolean;
}

export interface AnalysisResult {
  graph: DependencyGraph;
  stdout: string;
  stderr: string;
}

export function validateGraph(value: unknown): DependencyGraph {
  if (!value || typeof value !== "object") {
    throw new Error("MATLAB returned an invalid graph document.");
  }
  const graph = value as Partial<DependencyGraph>;
  if (!graph.metadata || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error("MATLAB graph document is missing metadata, nodes, or edges.");
  }
  graph.products ??= [];
  graph.problems ??= [];
  graph.metadata.nodeCount = graph.nodes.length;
  graph.metadata.edgeCount = graph.edges.length;
  return graph as DependencyGraph;
}
