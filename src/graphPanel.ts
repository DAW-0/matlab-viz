import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { defaultLayout } from "./configuration";
import { graphToCsv, graphToDot } from "./core/exporters";
import type { DependencyGraph } from "./model";

interface WebviewMessage {
  type: string;
  path?: string;
  format?: string;
  data?: string;
  encoding?: "utf8" | "base64";
  line?: number;
  character?: number;
  depth?: number;
  scope?: string;
  nodes?: number;
  edges?: number;
  width?: number;
  height?: number;
  message?: string;
}

function nonce(): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
}

export const GRAPH_VIEW_TYPE = "matlabViz.graph";

export class GraphPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private graph: DependencyGraph | undefined;
  private ready = false;
  private needsGraph = true;
  private restoredState: unknown;
  private unavailableMessage: string | undefined;
  private pendingExport: { type: "requestExport"; format: string; scope: string; scale: number } | undefined;
  private lastExportDirectory: vscode.Uri | undefined;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly refresh: (depth?: number) => Promise<void>,
    private readonly services: { state?: vscode.Memento; output?: vscode.LogOutputChannel } = {}
  ) {
    const saved = services.state?.get<string>("exportDirectory");
    if (saved) { try { this.lastExportDirectory = vscode.Uri.parse(saved); } catch { /* An optional export preference must not prevent activation. */ } }
  }

  public dispose(): void {
    this.panel?.dispose();
  }

  public async show(graph?: DependencyGraph): Promise<void> {
    if (graph) this.setGraph(graph);
    if (!this.panel) {
      // An editor-owned tab can exist before its lazy serializer has run.
      // Activate that tab rather than creating a second graph in the main window.
      const groups = vscode.window.tabGroups?.all ?? [];
      const pending = groups.flatMap((group) => group.tabs.map((tab, index) => ({ group, tab, index })))
        .find(({ tab }) => {
          const type = (tab.input as vscode.TabInputWebview)?.viewType;
          return type === GRAPH_VIEW_TYPE || type === `mainThreadWebview-${GRAPH_VIEW_TYPE}`;
        });
      if (pending) {
        this.services.output?.appendLine(`[MATLAB Viz] Revealing saved graph tab: column=${pending.group.viewColumn}, index=${pending.index}, active=${vscode.window.tabGroups.activeTabGroup.viewColumn}.`);
        for (let attempt = 0; vscode.window.tabGroups.activeTabGroup.viewColumn !== pending.group.viewColumn && attempt < groups.length; attempt++) {
          await vscode.commands.executeCommand("workbench.action.focusNextGroup");
          const until = Date.now() + 500;
          while (vscode.window.tabGroups.activeTabGroup.viewColumn !== pending.group.viewColumn && Date.now() < until) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
        if (vscode.window.tabGroups.activeTabGroup.viewColumn === pending.group.viewColumn) {
          // A restored auxiliary group can be logically active while the
          // main window still owns DOM focus. Index-based commands otherwise
          // reopen the main window's editor instead of this graph tab.
          await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
          await vscode.commands.executeCommand("workbench.action.openEditorAtIndex", pending.index);
        }
        this.services.output?.appendLine(`[MATLAB Viz] Saved graph activation requested; active column=${vscode.window.tabGroups.activeTabGroup.viewColumn}.`);
        this.postGraph();
        return;
      }
      const panel = vscode.window.createWebviewPanel(
        GRAPH_VIEW_TYPE,
        "MATLAB Viz Dependency Graph",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")]
        }
      );
      this.attach(panel);
    } else {
      // Omitting the column preserves the owning editor group/auxiliary window.
      this.panel.reveal();
    }
    this.postGraph();
  }

  /** Update the graph without moving or focusing an existing webview panel. */
  public update(graph: DependencyGraph): void {
    this.setGraph(graph);
    if (!this.panel) void this.show();
  }

  /** Populate the cache without opening a new panel during activation. */
  public setGraph(graph: DependencyGraph): void {
    if (this.graph !== graph) this.needsGraph = true;
    this.graph = graph;
    this.unavailableMessage = undefined;
    this.postGraph();
  }

  /** Adopt the editor-owned restored panel without revealing or relocating it. */
  public restore(panel: vscode.WebviewPanel, state: unknown): void {
    this.restoredState = state;
    this.attach(panel);
  }

  public showUnavailable(message: string): void {
    this.unavailableMessage = message;
    this.postGraph();
  }

  private attach(panel: vscode.WebviewPanel): void {
    if (this.panel && this.panel !== panel) this.panel.dispose();
    this.panel = panel;
    this.ready = false;
    this.needsGraph = true;
    panel.title = "MATLAB Viz Dependency Graph";
    panel.iconPath = vscode.Uri.joinPath(this.extensionUri, "media", "icon.svg");
    panel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")] };
    panel.webview.onDidReceiveMessage((message: WebviewMessage) => this.panel === panel ? this.receive(message) : undefined);
    panel.onDidDispose(() => { if (this.panel === panel) { this.panel = undefined; this.ready = false; } });
    panel.onDidChangeViewState(() => { if (panel.visible && this.panel === panel) this.postGraph(); });
    panel.webview.html = this.html(panel.webview);
  }

  public async showProblems(): Promise<void> {
    if (!this.graph?.problems.length) {
      return;
    }
    await this.show();
    void this.panel?.webview.postMessage({ type: "showProblems" });
  }

  public async exportGraph(): Promise<void> {
    try { await this.chooseExport(); }
    catch (error) { this.reportExportError(error instanceof Error ? error.message : String(error)); }
  }

  private async chooseExport(): Promise<void> {
    if (!this.graph) {
      void vscode.window.showInformationMessage("Run a MATLAB Viz analysis before exporting a graph.");
      return;
    }
    const format = await vscode.window.showQuickPick(
      [
        { label: "JSON", description: "Complete graph model", extension: "json" },
        { label: "Graphviz DOT", description: "Portable directed graph", extension: "dot" },
        { label: "CSV", description: "Dependency edge table", extension: "csv" },
        { label: "SVG", description: "Zoomable vector graph with full labels", extension: "svg", visual: true },
        { label: "PNG", description: "Raster graph with selectable resolution", extension: "png", visual: true }
      ],
      { title: "Export MATLAB Viz graph" }
    );
    if (!format) {
      return;
    }
    if (format.visual) {
      const scope = await vscode.window.showQuickPick([
        { label: "Filtered graph", description: "All nodes allowed by the current filters, including offscreen nodes", value: "graph" },
        { label: "Current viewport", description: "Crop to the current pan and zoom", value: "viewport" }
      ], { title: "Visual export framing", placeHolder: "Search highlights do not remove nodes; dependency/impact and visibility filters do." });
      if (!scope) return;
      let scale = 1;
      if (format.extension === "png") {
        const resolution = await vscode.window.showQuickPick([
          { label: "2×", description: "24-pixel labels at native graph size (recommended)", value: 2 },
          { label: "1×", description: "12-pixel labels; smaller output", value: 1 },
          { label: "4×", description: "48-pixel labels; larger output", value: 4 }
        ], { title: "PNG resolution", placeHolder: "For very large graphs, use SVG: PNG is limited to 32 megapixels / 16,384 pixels per side." });
        if (!resolution) return;
        scale = resolution.value;
      }
      await this.show();
      this.pendingExport = { type: "requestExport", format: format.extension, scope: scope.value, scale };
      this.postGraph();
      return;
    }
    const content =
      format.extension === "json"
        ? `${JSON.stringify(this.graph, null, 2)}\n`
        : format.extension === "dot"
          ? graphToDot(this.graph)
          : graphToCsv(this.graph);
    await this.save(content, format.extension, "utf8");
  }

  private postGraph(): void {
    if (!this.panel || !this.ready) return;
    if (!this.graph) {
      if (this.unavailableMessage) void this.panel.webview.postMessage({ type: "restoreError", message: this.unavailableMessage });
      return;
    }
    if (this.needsGraph) {
      const sentGraph = this.graph;
      const sentPanel = this.panel;
      this.needsGraph = false;
      const viewState = this.restoredState;
      this.restoredState = undefined;
      void this.panel.webview.postMessage({
        type: "setGraph",
        graph: this.graph,
        defaultLayout: defaultLayout(),
        viewState
      }).then((delivered) => {
        if (!delivered && this.panel === sentPanel && this.graph === sentGraph) {
          this.needsGraph = true;
          this.restoredState = viewState;
        }
      });
    }
    if (this.pendingExport) {
      const request = this.pendingExport;
      this.pendingExport = undefined;
      this.services.output?.appendLine(`[MATLAB Viz] Export requested: ${request.format.toUpperCase()}, scope=${request.scope}, scale=${request.scale}.`);
      void this.panel.webview.postMessage(request);
    }
  }

  private async receive(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        this.ready = true;
        this.needsGraph = true;
        this.postGraph();
        break;
      case "openFile":
        if (message.path && fs.existsSync(message.path)) {
          const document = await vscode.workspace.openTextDocument(vscode.Uri.file(message.path));
          const editor = await vscode.window.showTextDocument(document, { preview: false });
          if (message.line !== undefined) {
            const position = new vscode.Position(message.line, message.character ?? 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
          }
        }
        break;
      case "refresh":
        await this.refresh(message.depth);
        break;
      case "export":
        await this.exportGraph();
        break;
      case "saveVisual":
        if (message.data && (message.format === "svg" || message.format === "png")) {
          const dimensions = message.width && message.height ? `, pixels=${message.width}x${message.height}` : "";
          this.services.output?.appendLine(`[MATLAB Viz] Visual export rendered: ${message.format.toUpperCase()}, scope=${message.scope}, nodes=${message.nodes}, edges=${message.edges}${dimensions}.`);
          await this.save(message.data, message.format, message.format === "png" ? "base64" : "utf8");
        }
        break;
      case "exportError":
        this.reportExportError(message.message ?? "Visual export could not be generated.");
        break;
    }
  }

  private async save(content: string, extension: string, encoding: "utf8" | "base64"): Promise<void> {
    try {
      const root = this.graph?.metadata.root ?? "matlab-dependencies";
      const defaultName = `${path.basename(root)}-dependencies.${extension}`;
      const uri = await vscode.window.showSaveDialog({
        defaultUri: this.lastExportDirectory ? vscode.Uri.joinPath(this.lastExportDirectory, defaultName) : vscode.Uri.file(path.join(root, defaultName)),
        filters: { [extension.toUpperCase()]: [extension] }
      });
      if (!uri) return;
      const buffer = Buffer.from(content.replace(/^data:image\/png;base64,/, ""), encoding);
      await vscode.workspace.fs.writeFile(uri, buffer);
      this.lastExportDirectory = vscode.Uri.joinPath(uri, "..");
      try { await this.services.state?.update("exportDirectory", this.lastExportDirectory.toString()); }
      catch (error) { this.services.output?.warn(`Export saved, but destination preference could not be stored: ${String(error)}`); }
      this.services.output?.appendLine(`[MATLAB Viz] Export saved: ${uri.fsPath} (${extension.toUpperCase()}, ${buffer.length} bytes).`);
      void vscode.window.showInformationMessage(`MATLAB Viz exported ${path.basename(uri.fsPath)}.`);
    } catch (error) { this.reportExportError(error instanceof Error ? error.message : String(error)); }
  }

  private reportExportError(message: string): void {
    this.services.output?.error(`Export failed: ${message}`);
    void vscode.window.showErrorMessage(`MATLAB Viz export failed: ${message}`);
  }

  private html(webview: vscode.Webview): string {
    const token = nonce();
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "graph.js"));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "graph.css"));
    const geometry = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "graphGeometry.js"));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${token}';">
  <link rel="stylesheet" href="${style}">
  <title>MATLAB Viz</title>
</head>
<body>
  <header id="toolbar">
    <input id="search" type="search" placeholder="Search files…" aria-label="Search files">
    <select id="layout" aria-label="Graph layout">
      <option value="force">Force</option><option value="hierarchical">Hierarchical</option>
      <option value="circle">Circle</option><option value="grid">Grid</option>
    </select>
    <select id="direction" aria-label="Trace direction">
      <option value="all">Entire graph</option><option value="dependencies">Dependencies</option>
      <option value="impact">Impact</option>
    </select>
    <label id="depth-label"><span id="depth-text">Trace depth</span> <input id="depth" type="number" min="1" max="20" value="3"></label>
    <label><input id="external" type="checkbox" checked> External</label>
    <label><input id="isolated" type="checkbox" checked> Isolated</label>
    <button id="fit" title="Fit graph to view">Fit</button>
    <button id="refresh" title="Rerun analysis; function hierarchies use the displayed depth">Refresh</button>
    <button id="problems" title="Show MATLAB analysis notices" hidden>Notices</button>
    <button id="export" title="Export graph">Export</button>
  </header>
  <div id="summary" role="status">No graph loaded</div>
  <main id="graph-main">
    <section id="canvas-wrap"><svg id="graph" role="img" aria-label="MATLAB dependency graph"></svg></section>
    <div id="details-resizer" role="separator" tabindex="0" aria-label="Resize details panel" aria-orientation="vertical" aria-controls="details" title="Drag to resize details. Arrow keys resize; Shift takes larger steps; Home/End set limits; Enter or double-click resets."></div>
    <aside id="details" aria-label="Selection and analysis details"><h2>Selection</h2><p>Select a node or edge.</p></aside>
  </main>
  <div id="tooltip" hidden></div>
  <script nonce="${token}" src="${geometry}"></script>
  <script nonce="${token}" src="${script}"></script>
</body>
</html>`;
  }
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private graph: DependencyGraph | undefined;

  public constructor(
    private readonly analyze: () => Promise<void>,
    private readonly show: () => void,
    private readonly refresh: (depth?: number) => Promise<void>
  ) {}

  public resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage(async (message: { type: string }) => {
      if (message.type === "analyze") await this.analyze();
      if (message.type === "show") this.show();
      if (message.type === "refresh") await this.refresh();
    });
    this.render();
  }

  public setGraph(graph: DependencyGraph): void {
    this.graph = graph;
    this.render();
  }

  private render(): void {
    if (!this.view) return;
    const itemLabel = this.graph?.metadata.graphType === "files" || !this.graph?.metadata.graphType ? "files" : "symbols";
    const edgeLabel = this.graph?.metadata.graphType === "references" ? "references" : this.graph?.metadata.graphType === "call-hierarchy" ? "calls" : "dependencies";
    const summary = this.graph
      ? `<p><strong>${this.graph.metadata.nodeCount}</strong> ${itemLabel}<br><strong>${this.graph.metadata.edgeCount}</strong> ${edgeLabel}<br><strong>${this.graph.problems.length}</strong> problems</p><p class="muted">${this.graph.metadata.mode} analysis<br>${this.graph.metadata.root}</p>`
      : "<p>No dependency graph has been generated in this session.</p>";
    this.view.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:12px}button{display:block;width:100%;margin:8px 0;padding:7px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0}.muted{opacity:.7;word-break:break-all}
</style></head><body>${summary}<button data-command="analyze">Analyze Workspace</button><button data-command="show">Show Graph</button><button data-command="refresh">Refresh</button><script>const vscode=acquireVsCodeApi();document.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>vscode.postMessage({type:b.dataset.command})));</script></body></html>`;
  }
}
