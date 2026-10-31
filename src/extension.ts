import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { rename } from "node:fs/promises";
import * as vscode from "vscode";
import { readAnalysisOptions, readSymbolAnalysisOptions } from "./configuration";
import { readAnalysisTarget, storeCallTarget, storeReferenceTarget } from "./core/analysisState";
import { GRAPH_VIEW_TYPE, GraphPanel, SidebarProvider } from "./graphPanel";
import { runMatlabAnalysis } from "./matlabRunner";
import { validateGraph, type DependencyGraph } from "./model";
import {
  SymbolAnalyzer,
  type CallDirection,
  type ResolvedSymbol,
  type SymbolAnchor
} from "./symbolAnalyzer";

class MatlabVizController implements vscode.Disposable {
  private readonly output = vscode.window.createOutputChannel("MATLAB Viz", { log: true });
  private readonly panel: GraphPanel;
  private readonly sidebar: SidebarProvider;
  private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 25);
  private readonly symbolAnalyzer = new SymbolAnalyzer(this.output);
  private graph: DependencyGraph | undefined;
  private lastRoot: string | undefined;
  private running = false;
  private refreshTimer: NodeJS.Timeout | undefined;
  private watcher: vscode.FileSystemWatcher | undefined;
  private lastSymbolAction: CallDirection | "references" | undefined;
  private lastCallSeed: ResolvedSymbol | undefined;
  private lastReferenceAnchor: SymbolAnchor | undefined;
  public readonly ready: Promise<void>;

  public constructor(private readonly context: vscode.ExtensionContext) {
    this.panel = new GraphPanel(context.extensionUri, (depth) => this.refresh(depth));
    this.sidebar = new SidebarProvider(() => this.analyze(), () => this.showGraph(), () => this.refresh());
    this.status.command = "matlabViz.showGraph";
    this.status.tooltip = "Show the MATLAB Viz dependency graph";
    this.status.text = "$(type-hierarchy) MATLAB Viz";
    this.status.show();

    this.ready = this.restoreGraph();

    context.subscriptions.push(
      this,
      this.output,
      this.panel,
      this.status,
      vscode.window.registerWebviewPanelSerializer(GRAPH_VIEW_TYPE, {
        deserializeWebviewPanel: async (panel, state: unknown) => {
          this.output.appendLine("[MATLAB Viz] Restoring the editor-owned graph panel.");
          // Adopt first so an early Show command can reuse the restored panel.
          this.panel.restore(panel, state);
          await this.ready;
          if (this.graph) this.panel.setGraph(this.graph);
          else this.panel.showUnavailable("The cached graph could not be restored. Run a MATLAB Viz analysis to generate a new graph.");
        }
      }),
      vscode.window.registerWebviewViewProvider("matlabViz.sidebar", this.sidebar),
      vscode.commands.registerCommand("matlabViz.analyzeWorkspace", () => this.analyze()),
      vscode.commands.registerCommand("matlabViz.analyzeSelection", (uri?: vscode.Uri) => this.analyze(uri)),
      vscode.commands.registerCommand("matlabViz.refresh", () => this.refresh()),
      vscode.commands.registerCommand("matlabViz.showGraph", () => this.showGraph()),
      vscode.commands.registerCommand("matlabViz.exportGraph", async () => { await this.ready; await this.panel.exportGraph(); }),
      vscode.commands.registerCommand("matlabViz.openLogs", () => this.output.show()),
      vscode.commands.registerCommand("matlabViz.configureMatlab", () => this.configureMatlab()),
      vscode.commands.registerCommand("matlabViz.showCallHierarchy", () => this.analyzeCallHierarchy("both")),
      vscode.commands.registerCommand("matlabViz.showCallers", () => this.analyzeCallHierarchy("incoming")),
      vscode.commands.registerCommand("matlabViz.showCallees", () => this.analyzeCallHierarchy("outgoing")),
      vscode.commands.registerCommand("matlabViz.traceSymbolReferences", () => this.analyzeSymbolReferences()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("matlabViz.watchFiles")) this.configureWatcher();
      })
    );
    this.configureWatcher();
  }

  public dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.watcher?.dispose();
  }

  public async analyze(resource?: vscode.Uri): Promise<void> {
    await this.ready;
    if (this.running) {
      void vscode.window.showInformationMessage("A MATLAB Viz analysis is already running.");
      return;
    }
    this.running = true;
    try {
      const root = await this.resolveRoot(resource);
      if (!root) return;
      this.status.text = "$(loading~spin) MATLAB Viz analyzing";
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `MATLAB Viz: analyzing ${path.basename(root)}`,
          cancellable: true
        },
        async (progress, token) => {
          progress.report({ message: "Starting MATLAB dependency analysis…" });
          const helper = vscode.Uri.joinPath(this.context.extensionUri, "matlab").fsPath;
          const result = await runMatlabAnalysis(root, helper, readAnalysisOptions(), token, this.output);
          this.lastRoot = root;
          this.lastSymbolAction = undefined;
          this.lastCallSeed = undefined;
          this.lastReferenceAnchor = undefined;
          this.graph = result.graph;
          result.graph.metadata.analysisTarget = { version: 1, type: "files" };
          this.panel.update(result.graph);
          this.sidebar.setGraph(result.graph);
          await this.persistGraph(result.graph);
          this.status.text = `$(type-hierarchy) ${result.graph.nodes.length} files · ${result.graph.edges.length} edges`;
          this.notifyProblems(result.graph);
        }
      );
    } catch (error) {
      this.handleAnalysisError(error, "analysis");
    } finally {
      this.running = false;
    }
  }

  public async refresh(depth?: number): Promise<void> {
    await this.ready;
    if (this.graph && this.graph.metadata.graphType && this.graph.metadata.graphType !== "files" && !this.lastSymbolAction) {
      const message = "This cached symbol graph has no valid saved Refresh target. Run its MATLAB Viz function or reference command once to save a new target.";
      this.output.appendLine(`[MATLAB Viz] ${message}`);
      void vscode.window.showInformationMessage(message);
      return;
    }
    if (this.lastSymbolAction === "references") {
      await this.analyzeSymbolReferences(this.lastReferenceAnchor);
      return;
    }
    if (this.lastSymbolAction) {
      await this.analyzeCallHierarchy(this.lastSymbolAction, this.lastCallSeed, depth ?? this.graph?.metadata.analysisDepth);
      return;
    }
    if (this.lastRoot) {
      await this.analyze(vscode.Uri.file(this.lastRoot));
    } else {
      await this.analyze();
    }
  }

  public async showGraph(): Promise<void> {
    await this.ready;
    if (this.graph) {
      await this.panel.show(this.graph);
    } else {
      void vscode.window.showInformationMessage("No MATLAB Viz graph is loaded. Analyze a workspace first.");
    }
  }

  private async analyzeCallHierarchy(
    direction: CallDirection,
    seed?: ResolvedSymbol,
    requestedDepth?: number
  ): Promise<void> {
    await this.ready;
    if (this.running) {
      void vscode.window.showInformationMessage("A MATLAB Viz analysis is already running.");
      return;
    }
    this.running = true;
    const label = direction === "both" ? "call hierarchy" : direction === "incoming" ? "callers" : "callees";
    this.status.text = `$(loading~spin) MATLAB Viz ${label}`;
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `MATLAB Viz: tracing ${label}…`, cancellable: true },
        async (_progress, token) => {
          const options = readSymbolAnalysisOptions();
          if (requestedDepth !== undefined && Number.isFinite(requestedDepth)) {
            options.maximumDepth = Math.max(1, Math.min(20, Math.trunc(requestedDepth)));
          }
          const result = await this.symbolAnalyzer.analyzeCallHierarchy(direction, options, token, seed);
          result.graph.metadata.analysisTarget = storeCallTarget(direction, result.seed);
          this.lastSymbolAction = direction;
          this.lastCallSeed = result.seed;
          this.lastReferenceAnchor = undefined;
          await this.acceptGraph(result.graph);
        }
      );
    } catch (error) {
      this.handleAnalysisError(error, "function analysis");
    } finally {
      this.running = false;
    }
  }

  private async analyzeSymbolReferences(anchor?: SymbolAnchor): Promise<void> {
    await this.ready;
    if (this.running) {
      void vscode.window.showInformationMessage("A MATLAB Viz analysis is already running.");
      return;
    }
    this.running = true;
    this.status.text = "$(loading~spin) MATLAB Viz references";
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "MATLAB Viz: tracing symbol references…", cancellable: true },
        async (_progress, token) => {
          const result = await this.symbolAnalyzer.analyzeReferences(readSymbolAnalysisOptions(), token, anchor);
          result.graph.metadata.analysisTarget = storeReferenceTarget(result.anchor);
          this.lastSymbolAction = "references";
          this.lastReferenceAnchor = result.anchor;
          this.lastCallSeed = undefined;
          await this.acceptGraph(result.graph);
        }
      );
    } catch (error) {
      this.handleAnalysisError(error, "symbol reference analysis");
    } finally {
      this.running = false;
    }
  }

  private async acceptGraph(graph: DependencyGraph): Promise<void> {
    this.graph = graph;
    this.lastRoot = graph.metadata.root;
    this.panel.update(graph);
    this.sidebar.setGraph(graph);
    await this.persistGraph(graph);
    this.status.text = `$(type-hierarchy) ${graph.nodes.length} symbols · ${graph.edges.length} edges`;
    this.notifyProblems(graph);
  }

  private notifyProblems(graph: DependencyGraph): void {
    if (graph.problems.length === 0) {
      return;
    }
    const count = (severity: "error" | "warning" | "information"): number =>
      graph.problems.filter((problem) => problem.severity === severity).length;
    const descriptions = [
      [count("error"), "error"],
      [count("warning"), "warning"],
      [count("information"), "information notice"]
    ]
      .filter(([amount]) => Number(amount) > 0)
      .map(([amount, label]) => `${amount} ${label}${Number(amount) === 1 ? "" : "s"}`)
      .join(", ");
    void vscode.window
      .showWarningMessage(
        `MATLAB Viz generated the graph successfully with ${descriptions}.`,
        "View Analysis Notices",
        "Show Logs"
      )
      .then((action) => {
        if (action === "View Analysis Notices") this.panel.showProblems();
        if (action === "Show Logs") this.output.show();
      });
  }

  private handleAnalysisError(error: unknown, operation: string): void {
    if (error instanceof vscode.CancellationError) {
      this.output.appendLine(`[MATLAB Viz] ${operation} cancelled.`);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      this.output.error(`${operation}: ${message}`);
      // A notification's promise settles only on action/dismissal. Do not hold
      // the analysis lock (or let a late dismissal reset a newer run's state).
      void vscode.window.showErrorMessage(`MATLAB Viz ${operation} failed: ${message}`, "Show Logs")
        .then((action) => {
          if (action === "Show Logs") this.output.show();
        });
    }
    this.status.text = "$(type-hierarchy) MATLAB Viz";
  }

  private async resolveRoot(resource?: vscode.Uri): Promise<string | undefined> {
    if (resource?.scheme === "file") {
      const stat = await vscode.workspace.fs.stat(resource);
      return stat.type & vscode.FileType.Directory ? resource.fsPath : path.dirname(resource.fsPath);
    }
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) {
      const picked = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, title: "Select MATLAB analysis root" });
      return picked?.[0]?.fsPath;
    }
    if (folders.length === 1) return folders[0]?.uri.fsPath;
    const selected = await vscode.window.showQuickPick(
      folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
      { title: "Select the workspace folder to analyze" }
    );
    return selected?.folder.uri.fsPath;
  }

  private async configureMatlab(): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      title: "Select the MATLAB executable",
      filters: process.platform === "win32" ? { Executable: ["exe"] } : undefined
    });
    if (selected?.[0]) {
      await vscode.workspace.getConfiguration("matlabViz").update(
        "matlabExecutable",
        selected[0].fsPath,
        vscode.ConfigurationTarget.Global
      );
      void vscode.window.showInformationMessage(`MATLAB Viz will use ${selected[0].fsPath}.`);
    }
  }

  private configureWatcher(): void {
    this.watcher?.dispose();
    this.watcher = undefined;
    if (!vscode.workspace.getConfiguration("matlabViz").get("watchFiles", false)) return;
    this.watcher = vscode.workspace.createFileSystemWatcher("**/*.{m,mlx,p,slx,mdl,mlapp,prj}");
    const schedule = (): void => {
      if (this.refreshTimer) clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => void this.refresh(), 1200);
    };
    this.watcher.onDidChange(schedule);
    this.watcher.onDidCreate(schedule);
    this.watcher.onDidDelete(schedule);
  }

  private async persistGraph(graph: DependencyGraph): Promise<void> {
    const folder = this.context.storageUri ?? this.context.globalStorageUri;
    const pending = vscode.Uri.joinPath(folder, `last-graph.${randomUUID()}.pending.json`);
    try {
      await vscode.workspace.fs.createDirectory(folder);
      await vscode.workspace.fs.writeFile(pending, Buffer.from(JSON.stringify(graph), "utf8"));
      const destination = vscode.Uri.joinPath(folder, "last-graph.json");
      if (folder.scheme === "file") {
        // The generic FileService overwrite path can unlink the destination
        // first. A same-directory native rename replaces it without that gap.
        await rename(pending.fsPath, destination.fsPath);
      } else {
        await vscode.workspace.fs.rename(pending, destination, { overwrite: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.output.error(`Graph generated but cache could not be saved: ${message}`);
      void vscode.window.showWarningMessage("MATLAB Viz generated the graph, but could not save its cache. See the MATLAB Viz log.");
    }
  }

  private async restoreGraph(): Promise<void> {
    const folder = this.context.storageUri ?? this.context.globalStorageUri;
    try {
      const uri = vscode.Uri.joinPath(folder, "last-graph.json");
      let raw: Uint8Array | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { raw = await vscode.workspace.fs.readFile(uri); break; } catch (error) {
          const code = (error as { code?: string })?.code;
          if (attempt === 2 || (code !== "FileNotFound" && code !== "ENOENT")) throw error;
          await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
        }
      }
      if (!raw) return;
      this.graph = validateGraph(JSON.parse(Buffer.from(raw).toString("utf8")));
      this.lastRoot = this.graph.metadata.root;
      const target = readAnalysisTarget(this.graph);
      if (target?.type === "call-hierarchy") {
        const seed = target.seed;
        const range = (value: typeof seed.range): vscode.Range => new vscode.Range(value.start.line, value.start.character, value.end.line, value.end.character);
        this.lastSymbolAction = target.direction;
        this.lastCallSeed = { name: seed.name, kind: seed.kind as vscode.SymbolKind, uri: vscode.Uri.file(seed.path),
          range: range(seed.range), selectionRange: range(seed.selectionRange), containerName: seed.containerName };
      } else if (target?.type === "references") {
        this.lastSymbolAction = "references";
        this.lastReferenceAnchor = { uri: vscode.Uri.file(target.anchor.path),
          position: new vscode.Position(target.anchor.position.line, target.anchor.position.character) };
      }
      this.panel.setGraph(this.graph);
      this.sidebar.setGraph(this.graph);
      const type = this.graph.metadata.graphType ?? "files";
      this.status.text = `$(type-hierarchy) ${this.graph.nodes.length} ${type === "files" ? "files" : "symbols"} · ${this.graph.edges.length} ${type === "references" ? "references" : type === "call-hierarchy" ? "calls" : "dependencies"}`;
      this.output.appendLine(`[MATLAB Viz] Restored cached ${type} graph: ${this.graph.nodes.length} nodes, ${this.graph.edges.length} edges; Refresh target: ${target?.type ?? "unavailable"}.`);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== "FileNotFound" && code !== "ENOENT") {
        this.output.appendLine(`[MATLAB Viz] Cached graph could not be restored: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const controller = new MatlabVizController(context);
  await controller.ready;
}

export function deactivate(): void {}
