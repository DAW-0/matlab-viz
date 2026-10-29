import type { DependencyGraph } from "../model";

function quoteDot(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n")}"`;
}

export function graphToDot(graph: DependencyGraph): string {
  const lines = [
    "digraph MatlabViz {",
    "  graph [rankdir=LR, overlap=false, splines=true];",
    "  node [shape=box, style=rounded, fontname=\"Arial\"];",
    "  edge [color=\"#7f8c8d\"];"
  ];
  for (const node of graph.nodes) {
    const attributes = [
      `label=${quoteDot(node.relativePath || node.label)}`,
      `tooltip=${quoteDot(node.path)}`,
      `color=${quoteDot(node.missing ? "#d32f2f" : node.external ? "#f9a825" : "#1976d2")}`
    ];
    lines.push(`  ${quoteDot(node.id)} [${attributes.join(", ")}];`);
  }
  for (const edge of graph.edges) {
    lines.push(
      `  ${quoteDot(edge.source)} -> ${quoteDot(edge.target)} [label=${quoteDot(edge.kind || "dependency")}];`
    );
  }
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

export function graphToCsv(graph: DependencyGraph): string {
  const escape = (value: unknown): string => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = [["source", "target", "kind", "sourcePath", "targetPath"]];
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) {
    rows.push([
      edge.source,
      edge.target,
      edge.kind,
      byId.get(edge.source)?.path ?? "",
      byId.get(edge.target)?.path ?? ""
    ]);
  }
  return `${rows.map((row) => row.map(escape).join(",")).join("\r\n")}\r\n`;
}

export function reachableNodeIds(
  graph: DependencyGraph,
  startId: string,
  direction: "dependencies" | "impact",
  maximumDepth = Number.POSITIVE_INFINITY
): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const from = direction === "dependencies" ? edge.source : edge.target;
    const to = direction === "dependencies" ? edge.target : edge.source;
    const values = adjacency.get(from) ?? [];
    values.push(to);
    adjacency.set(from, values);
  }
  const visited = new Set<string>([startId]);
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth >= maximumDepth) {
      continue;
    }
    for (const next of adjacency.get(current.id) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push({ id: next, depth: current.depth + 1 });
      }
    }
  }
  return visited;
}
