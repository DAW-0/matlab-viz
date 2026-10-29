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
}

function nonce(): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
}

export class GraphPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private graph: DependencyGraph | undefined;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly refresh: (depth?: number) => Promise<void>
  ) {}

  public dispose(): void {
    this.panel?.dispose();
  }

  public show(graph?: DependencyGraph): void {
    if (graph) {
      this.graph = graph;
    }
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "matlabViz.graph",
        "MATLAB Viz Dependency Graph",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")]
        }
      );
      this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, "media", "icon.svg");
      this.panel.webview.html = this.html(this.panel.webview);
      this.panel.webview.onDidReceiveMessage((message: WebviewMessage) => this.receive(message));
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    } else {
      this.panel.reveal(this.panel.viewColumn);
    }
    this.postGraph();
  }

  /** Update the graph without moving or focusing an existing webview panel. */
  public update(graph: DependencyGraph): void {
    this.graph = graph;
    if (this.panel) {
      this.postGraph();
    } else {
      this.show();
    }
  }

  public async exportGraph(): Promise<void> {
    if (!this.graph) {
      void vscode.window.showInformationMessage("Run a MATLAB Viz analysis before exporting a graph.");
      return;
    }
    const format = await vscode.window.showQuickPick(
      [
        { label: "JSON", description: "Complete graph model", extension: "json" },
        { label: "Graphviz DOT", description: "Portable directed graph", extension: "dot" },
        { label: "CSV", description: "Dependency edge table", extension: "csv" },
        { label: "SVG", description: "Current visual view", extension: "svg", visual: true },
        { label: "PNG", description: "Current visual view", extension: "png", visual: true }
      ],
      { title: "Export MATLAB Viz graph" }
    );
    if (!format) {
      return;
    }
    if (format.visual) {
      this.show();
      await this.panel?.webview.postMessage({ type: "requestExport", format: format.extension });
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
    if (this.panel && this.graph) {
      void this.panel.webview.postMessage({
        type: "setGraph",
        graph: this.graph,
        defaultLayout: defaultLayout()
      });
    }
  }

  private async receive(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case "ready":
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
        if (message.data && message.format) {
          await this.save(message.data, message.format, message.encoding ?? "utf8");
        }
        break;
    }
  }

  private async save(content: string, extension: string, encoding: "utf8" | "base64"): Promise<void> {
    const root = this.graph?.metadata.root ?? "matlab-dependencies";
    const defaultName = `${path.basename(root)}-dependencies.${extension}`;
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(root, defaultName)),
      filters: { [extension.toUpperCase()]: [extension] }
    });
    if (!uri) {
      return;
    }
    const buffer = Buffer.from(content.replace(/^data:image\/png;base64,/, ""), encoding);
    await vscode.workspace.fs.writeFile(uri, buffer);
    void vscode.window.showInformationMessage(`MATLAB Viz exported ${path.basename(uri.fsPath)}.`);
  }

  private html(webview: vscode.Webview): string {
    const token = nonce();
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "graph.js"));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "graph.css"));
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
    <label title="Trace depth. Refresh rebuilds a function hierarchy to this depth.">Depth <input id="depth" type="number" min="1" max="20" value="3"></label>
    <label><input id="external" type="checkbox" checked> External</label>
    <label><input id="isolated" type="checkbox" checked> Isolated</label>
    <button id="fit" title="Fit graph to view">Fit</button>
    <button id="refresh" title="Rerun analysis; function hierarchies use the displayed depth">Refresh</button>
    <button id="export" title="Export graph">Export</button>
  </header>
  <div id="summary" role="status">No graph loaded</div>
  <main>
    <section id="canvas-wrap"><svg id="graph" role="img" aria-label="MATLAB dependency graph"></svg></section>
    <aside id="details"><h2>Selection</h2><p>Select a node or edge.</p></aside>
  </main>
  <div id="tooltip" hidden></div>
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
