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
  line?: number;
  character?: number;
  endLine?: number;
  endCharacter?: number;
  symbolKind?: string;
  containerName?: string;
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
  mode: "project" | "folder" | "language-service";
  graphType?: "files" | "call-hierarchy" | "references";
  rootSymbol?: string;
  analysisDepth?: number;
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
  if (!graph.metadata || typeof graph.metadata !== "object" || Array.isArray(graph.metadata)) {
    throw new Error("MATLAB graph document is missing valid metadata.");
  }
  // Accept legacy scalar-struct collections as well as the current array format.
  graph.nodes = graphCollection<GraphNode>(graph.nodes, "nodes", ["id", "label", "path"]);
  graph.edges = graphCollection<GraphEdge>(graph.edges, "edges", ["id", "source", "target", "kind"]);
  graph.products = graphCollection<ProductDependency>(graph.products ?? [], "products", ["name"]);
  graph.problems = graphCollection<AnalysisProblem>(graph.problems ?? [], "problems", ["message", "severity"]);
  if (graph.problems.some((problem) => !["error", "warning", "information"].includes(problem.severity))) {
    throw new Error("MATLAB graph document contains an invalid problem severity.");
  }
  graph.metadata.nodeCount = graph.nodes.length;
  graph.metadata.edgeCount = graph.edges.length;
  return graph as DependencyGraph;
}

function graphCollection<T>(value: unknown, field: string, stringFields: string[]): T[] {
  if (value === undefined || value === null) {
    throw new Error(`MATLAB graph document is missing the ${field} collection.`);
  }
  const items: unknown[] = Array.isArray(value) ? value : [value];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)
      || stringFields.some((key) => typeof (item as Record<string, unknown>)[key] !== "string")) {
      throw new Error(`MATLAB graph document contains invalid ${field}; expected graph records in an array.`);
    }
  }
  return items as T[];
}
