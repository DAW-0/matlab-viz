import * as path from "node:path";
import type { DependencyGraph } from "../../src/model";
import { cancellationToken, loadExtensionModule, TestCancellationError } from "./loadModule";

class Position {
  constructor(public line: number, public character: number) {}
  public translate(line = 0, character = 0) { return new Position(this.line + line, this.character + character); }
  public isEqual(other: Position) { return this.line === other.line && this.character === other.character; }
}
class Range {
  public start: Position; public end: Position;
  constructor(a: Position | number, b: Position | number, c?: number, d?: number) {
    this.start = typeof a === "number" ? new Position(a, b as number) : a;
    this.end = typeof a === "number" ? new Position(c!, d!) : b as Position;
  }
  public contains(point: Position) {
    const compare = (a: Position, b: Position) => a.line - b.line || a.character - b.character;
    return compare(point, this.start) >= 0 && compare(point, this.end) <= 0;
  }
}
class Uri {
  public scheme = "file";
  constructor(public fsPath: string) {}
  public toString() { return `file:${this.fsPath}`; }
}
class Document {
  public isDirty = false;
  constructor(public uri: Uri, public source: string) {}
  public get lineCount() { return this.source.split("\n").length; }
  public getText(range?: Range) { return range ? this.source.slice(this.offsetAt(range.start), this.offsetAt(range.end)) : this.source; }
  public offsetAt(point: Position) { const lines = this.source.split("\n"); return lines.slice(0, point.line).reduce((sum, line) => sum + line.length + 1, 0) + point.character; }
  public positionAt(offset: number) { const lines = this.source.slice(0, offset).split("\n"); return new Position(lines.length - 1, lines.at(-1)!.length); }
  public lineAt(index: number) { return { range: new Range(new Position(index, 0), new Position(index, this.source.split("\n")[index]?.length ?? 0)) }; }
  public getWordRangeAtPosition(point: Position) {
    const offset = this.offsetAt(point);
    for (const match of this.source.matchAll(/[A-Za-z]\w*/g)) if (offset >= match.index! && offset <= match.index! + match[0].length) {
      return new Range(this.positionAt(match.index!), this.positionAt(match.index! + match[0].length));
    }
    return undefined;
  }
}

/** Only the editor boundary is adapted: production symbol/index/merge code runs unchanged. */
export function symbolHarness(sourceFiles: Record<string, string>) {
  const root = path.resolve("/fixture");
  const files = new Map(Object.entries(sourceFiles).map(([file, source]) => [path.resolve(root, file), source]));
  const documents = new Map<string, Document>();
  const output: string[] = [];
  const unreadable = new Set<string>();
  const options = { maximumDepth: 3, maximumNodes: 250, includeExternal: false, requestTimeoutSeconds: 1, analysisTimeoutSeconds: 10 };
  const document = (name: string) => {
    const file = path.resolve(root, name);
    let value = documents.get(file);
    if (!value) { if (!files.has(file)) throw new Error(`Fixture absent: ${file}`); value = new Document(new Uri(file), files.get(file)!); documents.set(file, value); }
    return value;
  };
  const location = (file: string, word: string, occurrence = 0) => {
    const doc = document(file); let index = -1;
    for (let count = 0; count <= occurrence; count++) index = doc.source.indexOf(word, index + 1);
    if (index < 0) throw new Error(`Fixture word absent: ${word}`);
    return { uri: doc.uri, range: new Range(doc.positionAt(index), doc.positionAt(index + word.length)) };
  };
  let definitions: any[] | Error = [], references: any[] | Error = [];
  const window: any = {};
  const within = (uri: Uri) => { const relative = path.relative(root, uri.fsPath); return !relative.startsWith("..") && !path.isAbsolute(relative); };
  const symbolKinds: any = { File: 0, Class: 4, Method: 5, Constructor: 8, Function: 11, Variable: 12 };
  for (const [name, value] of Object.entries(symbolKinds)) symbolKinds[value as number] = name;
  const module = loadExtensionModule<any>("symbolAnalyzer.js", {
    vscode: { Position, Range, Uri, Location: class { constructor(public uri: Uri, public range: Range) {} }, SymbolKind: symbolKinds,
      CancellationError: TestCancellationError, CancellationTokenSource: class { public token = cancellationToken(); public cancel() { this.token.cancel(); } public dispose() {} },
      window,
      commands: { async executeCommand(name: string) {
        const value = name === "vscode.executeDefinitionProvider" ? definitions : name === "vscode.executeReferenceProvider" ? references : [];
        if (value instanceof Error) throw value; return value;
      } },
      workspace: { get textDocuments() { return [...documents.values()]; },
        getWorkspaceFolder: (uri: Uri) => within(uri) ? { uri: new Uri(root) } : undefined,
        openTextDocument: async (uri: Uri) => document(uri.fsPath),
        findFiles: async () => [...files.keys()].map((file) => new Uri(file)).filter(within),
        fs: { readFile: async (uri: Uri) => { if (unreadable.has(uri.fsPath)) throw new Error("Expected read failure"); return Buffer.from(files.get(uri.fsPath)!); } }
      }
    }
  });
  const analyzer = new module.SymbolAnalyzer({ appendLine: (value: string) => output.push(value) });
  return { root, output, document, location,
    failRead(file: string) { unreadable.add(path.resolve(root, file)); },
    providers: (value: { definitions?: any[] | Error; references?: any[] | Error }) => { definitions = value.definitions ?? []; references = value.references ?? []; },
    setFile(file: string, source: string, dirty = false) { if (!dirty) files.set(path.resolve(root, file), source); const doc = document(file); doc.source = source; doc.isDirty = dirty; },
    async analyze(file: string, word: string, overrides: Partial<typeof options> = {}, occurrence = 0) {
      const target = location(file, word, occurrence);
      window.activeTextEditor = { document: document(file), selection: { active: target.range.start } };
      const result = await analyzer.analyzeReferences({ ...options, ...overrides }, cancellationToken());
      return { graph: JSON.parse(JSON.stringify(result.graph)) as DependencyGraph, anchor: result.anchor };
    },
    async refresh(anchor: any) {
      const result = await analyzer.analyzeReferences(options, cancellationToken(), anchor);
      return JSON.parse(JSON.stringify(result.graph)) as DependencyGraph;
    }
  };
}
