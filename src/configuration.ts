import * as vscode from "vscode";
import * as path from "node:path";
import type { AnalysisOptions } from "./model";

export function readAnalysisOptions(rootPath?: string): AnalysisOptions {
  const resource = rootPath ? vscode.Uri.file(rootPath) : undefined;
  const config = vscode.workspace.getConfiguration("matlabViz", resource);
  const workspaceRoot = resource ? vscode.workspace.getWorkspaceFolder(resource)?.uri.fsPath : undefined;
  const roots = [...(workspaceRoot && config.get("folder.useWorkspacePath", true) ? [workspaceRoot] : []),
    ...config.get<string[]>("folder.additionalSearchRoots", [])];
  const seen = new Set<string>();
  const searchRoots = roots.filter((root) => root.trim()).map((root) => path.resolve(workspaceRoot ?? rootPath ?? ".", root))
    .filter((root) => {
      const key = process.platform === "win32" ? root.toLowerCase() : root;
      const selected = rootPath ? path.resolve(rootPath) : undefined;
      if ((selected && key === (process.platform === "win32" ? selected.toLowerCase() : selected)) || seen.has(key)) return false;
      seen.add(key); return true;
    });
  return {
    mode: config.get<AnalysisOptions["mode"]>("analysisMode", "auto"),
    includeExternal: config.get("includeExternal", false),
    includeIsolated: config.get("includeIsolated", true),
    maximumFiles: config.get("maximumFiles", 5000),
    reanalyzeAll: config.get("project.reanalyzeAll", false),
    analyzeReferences: config.get("project.analyzeReferences", true),
    analyzeAddOns: config.get("project.analyzeAddOns", false),
    analyzeModelParameters: config.get("project.analyzeModelParameters", false),
    searchRoots
  };
}

export function defaultLayout(): string {
  return vscode.workspace.getConfiguration("matlabViz").get("defaultLayout", "force");
}

export interface SymbolAnalysisOptions {
  maximumDepth: number;
  maximumNodes: number;
  includeExternal: boolean;
  requestTimeoutSeconds: number;
  analysisTimeoutSeconds: number;
}

export function readSymbolAnalysisOptions(): SymbolAnalysisOptions {
  const config = vscode.workspace.getConfiguration("matlabViz");
  return {
    maximumDepth: config.get("symbols.maximumDepth", 3),
    maximumNodes: config.get("symbols.maximumNodes", 250),
    includeExternal: config.get("includeExternal", false),
    requestTimeoutSeconds: config.get("symbols.requestTimeoutSeconds", 20),
    analysisTimeoutSeconds: config.get("symbols.analysisTimeoutSeconds", 180)
  };
}
