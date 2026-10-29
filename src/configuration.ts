import * as vscode from "vscode";
import type { AnalysisOptions } from "./model";

export function readAnalysisOptions(): AnalysisOptions {
  const config = vscode.workspace.getConfiguration("matlabViz");
  return {
    mode: config.get<AnalysisOptions["mode"]>("analysisMode", "auto"),
    includeExternal: config.get("includeExternal", false),
    includeIsolated: config.get("includeIsolated", true),
    maximumFiles: config.get("maximumFiles", 5000),
    reanalyzeAll: config.get("project.reanalyzeAll", false),
    analyzeReferences: config.get("project.analyzeReferences", true),
    analyzeAddOns: config.get("project.analyzeAddOns", false),
    analyzeModelParameters: config.get("project.analyzeModelParameters", false)
  };
}

export function defaultLayout(): string {
  return vscode.workspace.getConfiguration("matlabViz").get("defaultLayout", "force");
}
