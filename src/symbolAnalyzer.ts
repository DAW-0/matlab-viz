import * as path from "node:path";
import * as vscode from "vscode";
import type { SymbolAnalysisOptions } from "./configuration";
import { findMatlabCallCandidates, findMatlabDeclarations } from "./core/matlabSyntax";
import type { AnalysisProblem, DependencyGraph, GraphEdge, GraphNode } from "./model";

export type CallDirection = "both" | "incoming" | "outgoing";

interface ResolvedSymbol {
  name: string;
  kind: vscode.SymbolKind;
  uri: vscode.Uri;
  range: vscode.Range;
  selectionRange: vscode.Range;
  containerName?: string;
}

interface LocatedCall {
  symbol: ResolvedSymbol;
  location: vscode.Location;
}

const FUNCTION_KINDS = new Set([
  vscode.SymbolKind.Function,
  vscode.SymbolKind.Method,
  vscode.SymbolKind.Constructor
]);

function rangeSize(range: vscode.Range): number {
  return (range.end.line - range.start.line) * 1_000_000 + range.end.character - range.start.character;
}

function symbolId(symbol: ResolvedSymbol): string {
  return `${symbol.uri.toString()}#${symbol.selectionRange.start.line}:${symbol.selectionRange.start.character}:${symbol.name}`;
}

function locationFromDefinition(definition: vscode.Location | vscode.LocationLink): vscode.Location {
  if ("targetUri" in definition) {
    return new vscode.Location(definition.targetUri, definition.targetSelectionRange ?? definition.targetRange);
  }
  return definition;
}

function isDocumentSymbol(value: vscode.DocumentSymbol | vscode.SymbolInformation): value is vscode.DocumentSymbol {
  return "range" in value && "selectionRange" in value;
}

export class SymbolAnalyzer {
  private readonly documentCache = new Map<string, Thenable<vscode.TextDocument>>();
  private readonly symbolCache = new Map<string, Promise<ResolvedSymbol[]>>();

  public constructor(private readonly output: vscode.OutputChannel) {}

  public async analyzeCallHierarchy(
    direction: CallDirection,
    options: SymbolAnalysisOptions,
    token: vscode.CancellationToken
  ): Promise<DependencyGraph> {
    const started = Date.now();
    const seed = await this.functionSeed();
    if (!seed) {
      throw new Error("Place the cursor in a MATLAB function or on a resolvable function name.");
    }
    this.output.appendLine(
      `[MATLAB Viz] Building ${direction} call hierarchy for ${seed.name} at ${seed.uri.fsPath}:${seed.selectionRange.start.line + 1}`
    );
    const nodes = new Map<string, ResolvedSymbol>([[symbolId(seed), seed]]);
    const edges = new Map<string, GraphEdge>();
    const problems: AnalysisProblem[] = [];
    const queue: Array<{ symbol: ResolvedSymbol; depth: number; direction: "incoming" | "outgoing" }> = [];
    if (direction !== "incoming") queue.push({ symbol: seed, depth: 0, direction: "outgoing" });
    if (direction !== "outgoing") queue.push({ symbol: seed, depth: 0, direction: "incoming" });
    const processed = new Set<string>();

    while (queue.length > 0 && nodes.size < options.maximumNodes) {
      if (token.isCancellationRequested) throw new vscode.CancellationError();
      const current = queue.shift();
      if (!current || current.depth >= options.maximumDepth) continue;
      const currentId = symbolId(current.symbol);
      const processKey = `${current.direction}:${currentId}`;
      if (processed.has(processKey)) continue;
      processed.add(processKey);
      let calls: LocatedCall[];
      try {
        calls = current.direction === "outgoing"
          ? await this.outgoingCalls(current.symbol, options, token)
          : await this.incomingCalls(current.symbol, options, token);
      } catch (error) {
        problems.push({
          file: current.symbol.uri.fsPath,
          message: `${current.direction} analysis for ${current.symbol.name}: ${error instanceof Error ? error.message : String(error)}`,
          severity: "warning"
        });
        continue;
      }
      for (const call of calls) {
        if (nodes.size >= options.maximumNodes) break;
        const relatedId = symbolId(call.symbol);
        nodes.set(relatedId, call.symbol);
        const source = current.direction === "outgoing" ? currentId : relatedId;
        const target = current.direction === "outgoing" ? relatedId : currentId;
        if (source === target) continue;
        const edgeKey = `${source}\n${target}`;
        const line = call.location.range.start.line + 1;
        const existing = edges.get(edgeKey);
        if (existing) {
          const suffix = `, ${line}`;
          if (!existing.details?.endsWith(suffix)) existing.details = `${existing.details ?? "lines"}${suffix}`;
        } else {
          edges.set(edgeKey, {
            id: `call-${edges.size + 1}`,
            source,
            target,
            kind: "calls",
            details: `call at ${this.relativePath(call.location.uri)}:${line}`
          });
        }
        queue.push({ symbol: call.symbol, depth: current.depth + 1, direction: current.direction });
      }
    }
    if (nodes.size >= options.maximumNodes && queue.length > 0) {
      problems.push({
        message: `Call hierarchy stopped at the configured maximum of ${options.maximumNodes} nodes.`,
        severity: "warning"
      });
    }
    return this.makeGraph("call-hierarchy", seed, nodes, edges, problems, started);
  }

  public async analyzeReferences(
    options: SymbolAnalysisOptions,
    token: vscode.CancellationToken
  ): Promise<DependencyGraph> {
    const started = Date.now();
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== "file") {
      throw new Error("Open a MATLAB source file and place the cursor on a function or variable.");
    }
    const position = editor.selection.active;
    const wordRange = editor.document.getWordRangeAtPosition(position, /[A-Za-z]\w*/);
    if (!wordRange) throw new Error("No MATLAB symbol was found at the cursor.");
    const selectedName = editor.document.getText(wordRange);
    const definitions = await this.definitions(editor.document.uri, position);
    const definition = definitions[0] ?? new vscode.Location(editor.document.uri, wordRange);
    const central = await this.symbolAtDefinition(definition, selectedName);
    const centralId = symbolId(central);
    const nodes = new Map<string, ResolvedSymbol>([[centralId, central]]);
    const edges = new Map<string, GraphEdge>();
    const problems: AnalysisProblem[] = [];
    const references = (await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeReferenceProvider",
      editor.document.uri,
      position
    )) ?? [];
    this.output.appendLine(`[MATLAB Viz] Found ${references.length} references for ${selectedName}.`);
    const groupedLines = new Map<string, number[]>();
    for (const reference of references) {
      if (token.isCancellationRequested) throw new vscode.CancellationError();
      if (!options.includeExternal && !vscode.workspace.getWorkspaceFolder(reference.uri)) continue;
      const container = await this.containingFunction(reference.uri, reference.range.start) ?? await this.fileSymbol(reference.uri);
      const containerId = symbolId(container);
      if (containerId === centralId) continue;
      nodes.set(containerId, container);
      const key = `${containerId}\n${centralId}`;
      const lines = groupedLines.get(key) ?? [];
      lines.push(reference.range.start.line + 1);
      groupedLines.set(key, lines);
      if (nodes.size >= options.maximumNodes) break;
    }
    for (const [key, lines] of groupedLines) {
      const [source, target] = key.split("\n") as [string, string];
      edges.set(key, {
        id: `reference-${edges.size + 1}`,
        source,
        target,
        kind: "references",
        details: `lines ${[...new Set(lines)].sort((a, b) => a - b).join(", ")}`
      });
    }
    if (references.length === 0) {
      problems.push({ message: `The MATLAB language service returned no references for ${selectedName}.`, severity: "information" });
    }
    if (nodes.size >= options.maximumNodes) {
      problems.push({ message: `Reference graph stopped at ${options.maximumNodes} nodes.`, severity: "warning" });
    }
    return this.makeGraph("references", central, nodes, edges, problems, started);
  }

  private async functionSeed(): Promise<ResolvedSymbol | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== "file") return undefined;
    const position = editor.selection.active;
    const containing = await this.containingFunction(editor.document.uri, position);
    const definitions = await this.definitions(editor.document.uri, position);
    for (const definition of definitions) {
      const symbol = await this.containingFunction(definition.uri, definition.range.start);
      if (
        symbol &&
        (!containing || symbolId(symbol) !== symbolId(containing) || containing.selectionRange.contains(position))
      ) {
        return symbol;
      }
    }
    return containing;
  }

  private async outgoingCalls(
    symbol: ResolvedSymbol,
    options: SymbolAnalysisOptions,
    token: vscode.CancellationToken
  ): Promise<LocatedCall[]> {
    const document = await this.document(symbol.uri);
    const startOffset = document.offsetAt(symbol.range.start);
    const endOffset = document.offsetAt(symbol.range.end);
    const candidates = findMatlabCallCandidates(document.getText(), startOffset, endOffset);
    const calls = new Map<string, LocatedCall>();
    for (const candidate of candidates.slice(0, 500)) {
      if (token.isCancellationRequested) throw new vscode.CancellationError();
      const position = document.positionAt(candidate.nameOffset);
      const definitions = await this.definitions(document.uri, position);
      for (const definition of definitions) {
        if (!options.includeExternal && !vscode.workspace.getWorkspaceFolder(definition.uri)) continue;
        const target = await this.containingFunction(definition.uri, definition.range.start);
        if (!target || symbolId(target) === symbolId(symbol)) continue;
        const id = symbolId(target);
        if (!calls.has(id)) calls.set(id, { symbol: target, location: new vscode.Location(document.uri, new vscode.Range(position, position.translate(0, candidate.name.length))) });
        break;
      }
    }
    return [...calls.values()];
  }

  private async incomingCalls(
    symbol: ResolvedSymbol,
    options: SymbolAnalysisOptions,
    token: vscode.CancellationToken
  ): Promise<LocatedCall[]> {
    const references = (await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeReferenceProvider",
      symbol.uri,
      symbol.selectionRange.start
    )) ?? [];
    const calls = new Map<string, LocatedCall>();
    for (const reference of references) {
      if (token.isCancellationRequested) throw new vscode.CancellationError();
      if (!options.includeExternal && !vscode.workspace.getWorkspaceFolder(reference.uri)) continue;
      const caller = await this.containingFunction(reference.uri, reference.range.start);
      if (!caller || symbolId(caller) === symbolId(symbol)) continue;
      const id = symbolId(caller);
      if (!calls.has(id)) calls.set(id, { symbol: caller, location: reference });
    }
    return [...calls.values()];
  }

  private async definitions(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]> {
    const result = (await vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
      "vscode.executeDefinitionProvider",
      uri,
      position
    )) ?? [];
    return result.map(locationFromDefinition);
  }

  private async containingFunction(uri: vscode.Uri, position: vscode.Position): Promise<ResolvedSymbol | undefined> {
    const symbols = await this.symbols(uri);
    return symbols
      .filter((symbol) => FUNCTION_KINDS.has(symbol.kind) && symbol.range.contains(position))
      .sort((first, second) => rangeSize(first.range) - rangeSize(second.range))[0];
  }

  private async symbolAtDefinition(location: vscode.Location, fallbackName: string): Promise<ResolvedSymbol> {
    const symbols = await this.symbols(location.uri);
    const exact = symbols
      .filter((symbol) => symbol.selectionRange.contains(location.range.start))
      .sort((first, second) => rangeSize(first.selectionRange) - rangeSize(second.selectionRange))[0];
    if (exact && (exact.name === fallbackName || FUNCTION_KINDS.has(exact.kind))) return exact;
    const document = await this.document(location.uri);
    const wordRange = document.getWordRangeAtPosition(location.range.start, /[A-Za-z]\w*/) ?? location.range;
    const name = document.getText(wordRange) || fallbackName;
    return {
      name,
      kind: vscode.SymbolKind.Variable,
      uri: location.uri,
      range: wordRange,
      selectionRange: wordRange,
      containerName: (await this.containingFunction(location.uri, location.range.start))?.name
    };
  }

  private async fileSymbol(uri: vscode.Uri): Promise<ResolvedSymbol> {
    const document = await this.document(uri);
    const range = new vscode.Range(new vscode.Position(0, 0), document.lineAt(Math.max(0, document.lineCount - 1)).range.end);
    return {
      name: path.basename(uri.fsPath),
      kind: vscode.SymbolKind.File,
      uri,
      range,
      selectionRange: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0))
    };
  }

  private document(uri: vscode.Uri): Thenable<vscode.TextDocument> {
    const key = uri.toString();
    let cached = this.documentCache.get(key);
    if (!cached) {
      cached = vscode.workspace.openTextDocument(uri);
      this.documentCache.set(key, cached);
    }
    return cached;
  }

  private symbols(uri: vscode.Uri): Promise<ResolvedSymbol[]> {
    const key = uri.toString();
    let cached = this.symbolCache.get(key);
    if (!cached) {
      cached = this.loadSymbols(uri);
      this.symbolCache.set(key, cached);
    }
    return cached;
  }

  private async loadSymbols(uri: vscode.Uri): Promise<ResolvedSymbol[]> {
    const provided = (await vscode.commands.executeCommand<Array<vscode.DocumentSymbol | vscode.SymbolInformation>>(
      "vscode.executeDocumentSymbolProvider",
      uri
    )) ?? [];
    const result: ResolvedSymbol[] = [];
    const append = (symbol: vscode.DocumentSymbol | vscode.SymbolInformation, parent?: string): void => {
      if (isDocumentSymbol(symbol)) {
        result.push({
          name: symbol.name,
          kind: symbol.kind,
          uri,
          range: symbol.range,
          selectionRange: symbol.selectionRange,
          containerName: parent
        });
        for (const child of symbol.children) append(child, symbol.name);
      } else {
        result.push({
          name: symbol.name,
          kind: symbol.kind,
          uri: symbol.location.uri,
          range: symbol.location.range,
          selectionRange: symbol.location.range,
          containerName: symbol.containerName
        });
      }
    };
    for (const symbol of provided) append(symbol);
    const document = await this.document(uri);
    const functionSymbols = result.filter((symbol) => FUNCTION_KINDS.has(symbol.kind));
    if (functionSymbols.some((symbol) => symbol.range.end.line > symbol.range.start.line)) return result;

    for (const declaration of findMatlabDeclarations(document.getText())) {
      const nameStart = document.positionAt(declaration.nameOffset);
      const range = new vscode.Range(document.positionAt(declaration.startOffset), document.positionAt(declaration.endOffset));
      const existing = functionSymbols.find(
        (symbol) => symbol.name === declaration.name && Math.abs(symbol.selectionRange.start.line - nameStart.line) <= 1
      );
      if (existing) {
        existing.range = range;
      } else {
        result.push({
          name: declaration.name,
          kind: declaration.kind === "class" ? vscode.SymbolKind.Class : vscode.SymbolKind.Function,
          uri,
          range,
          selectionRange: new vscode.Range(nameStart, nameStart.translate(0, declaration.name.length))
        });
      }
    }
    return result;
  }

  private makeGraph(
    graphType: "call-hierarchy" | "references",
    root: ResolvedSymbol,
    symbols: Map<string, ResolvedSymbol>,
    edges: Map<string, GraphEdge>,
    problems: AnalysisProblem[],
    started: number
  ): DependencyGraph {
    const rootFolder = vscode.workspace.getWorkspaceFolder(root.uri)?.uri.fsPath ?? path.dirname(root.uri.fsPath);
    const nodes: GraphNode[] = [...symbols].map(([id, symbol]) => this.graphNode(id, symbol, rootFolder));
    return {
      metadata: {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        root: rootFolder,
        mode: "language-service",
        graphType,
        rootSymbol: root.name,
        matlabVersion: "language service",
        durationSeconds: (Date.now() - started) / 1000,
        nodeCount: nodes.length,
        edgeCount: edges.size
      },
      nodes,
      edges: [...edges.values()],
      products: [],
      problems
    };
  }

  private graphNode(id: string, symbol: ResolvedSymbol, rootFolder: string): GraphNode {
    const relative = path.relative(rootFolder, symbol.uri.fsPath).replaceAll("\\", "/") || path.basename(symbol.uri.fsPath);
    const external = relative.startsWith("../") || path.isAbsolute(relative);
    const line = symbol.selectionRange.start.line;
    const kind = vscode.SymbolKind[symbol.kind] ?? "Symbol";
    return {
      id,
      label: symbol.name,
      path: symbol.uri.fsPath,
      relativePath: `${relative}#${symbol.name}:${line + 1}`,
      extension: path.extname(symbol.uri.fsPath).toLowerCase(),
      kind: kind.toLowerCase(),
      external,
      missing: false,
      line,
      character: symbol.selectionRange.start.character,
      endLine: symbol.selectionRange.end.line,
      endCharacter: symbol.selectionRange.end.character,
      symbolKind: kind,
      containerName: symbol.containerName
    };
  }

  private relativePath(uri: vscode.Uri): string {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    return folder ? path.relative(folder.uri.fsPath, uri.fsPath).replaceAll("\\", "/") : uri.fsPath;
  }
}
