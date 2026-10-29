import * as path from "node:path";
import * as vscode from "vscode";
import { readAnalysisOptions } from "./configuration";
import { GraphPanel, SidebarProvider } from "./graphPanel";
import { runMatlabAnalysis } from "./matlabRunner";
import type { DependencyGraph } from "./model";

class MatlabVizController implements vscode.Disposable {
  private readonly output = vscode.window.createOutputChannel("MatlabViz", { log: true });
  private readonly panel: GraphPanel;
  private readonly sidebar: SidebarProvider;
  private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 25);
  private graph: DependencyGraph | undefined;
  private lastRoot: string | undefined;
  private running = false;
  private refreshTimer: NodeJS.Timeout | undefined;
  private watcher: vscode.FileSystemWatcher | undefined;

  public constructor(private readonly context: vscode.ExtensionContext) {
    this.panel = new GraphPanel(context.extensionUri, () => this.refresh());
    this.sidebar = new SidebarProvider(() => this.analyze(), () => this.showGraph(), () => this.refresh());
    this.status.command = "matlabViz.showGraph";
    this.status.tooltip = "Show the MatlabViz dependency graph";
    this.status.text = "$(type-hierarchy) MatlabViz";
    this.status.show();

    context.subscriptions.push(
      this,
      this.output,
      this.panel,
      this.status,
      vscode.window.registerWebviewViewProvider("matlabViz.sidebar", this.sidebar),
      vscode.commands.registerCommand("matlabViz.analyzeWorkspace", () => this.analyze()),
      vscode.commands.registerCommand("matlabViz.analyzeSelection", (uri?: vscode.Uri) => this.analyze(uri)),
      vscode.commands.registerCommand("matlabViz.refresh", () => this.refresh()),
      vscode.commands.registerCommand("matlabViz.showGraph", () => this.showGraph()),
      vscode.commands.registerCommand("matlabViz.exportGraph", () => this.panel.exportGraph()),
      vscode.commands.registerCommand("matlabViz.openLogs", () => this.output.show()),
      vscode.commands.registerCommand("matlabViz.configureMatlab", () => this.configureMatlab()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("matlabViz.watchFiles")) this.configureWatcher();
      })
    );
    this.configureWatcher();
    void this.restoreGraph();
  }

  public dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.watcher?.dispose();
  }

  public async analyze(resource?: vscode.Uri): Promise<void> {
    if (this.running) {
      void vscode.window.showInformationMessage("A MatlabViz analysis is already running.");
      return;
    }
    const root = await this.resolveRoot(resource);
    if (!root) return;
    this.lastRoot = root;
    this.running = true;
    this.status.text = "$(loading~spin) MatlabViz analyzing";
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `MatlabViz: analyzing ${path.basename(root)}`,
          cancellable: true
        },
        async (progress, token) => {
          progress.report({ message: "Starting MATLAB dependency analysis…" });
          const helper = vscode.Uri.joinPath(this.context.extensionUri, "matlab").fsPath;
          const result = await runMatlabAnalysis(root, helper, readAnalysisOptions(), token, this.output);
          this.graph = result.graph;
          this.panel.setGraph(result.graph);
          this.sidebar.setGraph(result.graph);
          this.panel.show(result.graph);
          await this.persistGraph(result.graph);
          this.status.text = `$(type-hierarchy) ${result.graph.nodes.length} files · ${result.graph.edges.length} edges`;
          if (result.graph.problems.length > 0) {
            void vscode.window.showWarningMessage(
              `MatlabViz generated the graph with ${result.graph.problems.length} analysis problem(s).`
            );
          }
        }
      );
    } catch (error) {
      if (error instanceof vscode.CancellationError) {
        this.output.appendLine("[MatlabViz] Analysis cancelled.");
      } else {
        const message = error instanceof Error ? error.message : String(error);
        this.output.error(message);
        const action = await vscode.window.showErrorMessage(`MatlabViz analysis failed: ${message}`, "Show Logs");
        if (action === "Show Logs") this.output.show();
      }
      this.status.text = "$(type-hierarchy) MatlabViz";
    } finally {
      this.running = false;
    }
  }

  public async refresh(): Promise<void> {
    if (this.lastRoot) {
      await this.analyze(vscode.Uri.file(this.lastRoot));
    } else {
      await this.analyze();
    }
  }

  public showGraph(): void {
    if (this.graph) {
      this.panel.show(this.graph);
    } else {
      void vscode.window.showInformationMessage("No MatlabViz graph is loaded. Analyze a workspace first.");
    }
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
      void vscode.window.showInformationMessage(`MatlabViz will use ${selected[0].fsPath}.`);
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
    await vscode.workspace.fs.createDirectory(folder);
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(folder, "last-graph.json"),
      Buffer.from(JSON.stringify(graph), "utf8")
    );
  }

  private async restoreGraph(): Promise<void> {
    const folder = this.context.storageUri ?? this.context.globalStorageUri;
    try {
      const raw = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, "last-graph.json"));
      this.graph = JSON.parse(Buffer.from(raw).toString("utf8")) as DependencyGraph;
      this.lastRoot = this.graph.metadata.root;
      this.sidebar.setGraph(this.graph);
      this.status.text = `$(type-hierarchy) ${this.graph.nodes.length} files · ${this.graph.edges.length} edges`;
    } catch {
      // A cache is optional on first activation.
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  new MatlabVizController(context);
}

export function deactivate(): void {}
