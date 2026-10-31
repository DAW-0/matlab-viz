import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { validateGraph, type DependencyGraph } from "../../src/model";

/** Real editor/provider and MATLAB-process accuracy checks in an owned fixture workspace. */
export async function run(): Promise<void> {
  const artifacts = process.env.MATLAB_VIZ_TEST_ARTIFACTS!, profile = process.env.MATLAB_VIZ_HOST_PROFILE!;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  assert.ok(root && path.relative(artifacts, root) && !path.relative(artifacts, root).startsWith("..") && !path.isAbsolute(path.relative(artifacts, root)), "Accuracy workspace must be a child of its owned artifacts directory");
  const observations: string[] = [];
  const log = (value: string) => { observations.push(value); console.log(value); };
  const config = vscode.workspace.getConfiguration("matlabViz");
  const registered: vscode.Disposable[] = [];
  let mode: "declaration" | "partial" | "empty" | "hung" = "declaration";
  async function cached(): Promise<DependencyGraph> {
    const storage = path.join(profile, "User", "workspaceStorage");
    for (const folder of await fs.readdir(storage, { withFileTypes: true })) {
      if (!folder.isDirectory()) continue;
      try { return validateGraph(JSON.parse(await fs.readFile(path.join(storage, folder.name, "daw-0.matlab-viz/last-graph.json"), "utf8"))); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    throw new Error("Graph cache absent");
  }
  async function select(file: string, word: string) {
    const document = await vscode.workspace.openTextDocument(path.join(root!, file));
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const position = document.positionAt(document.getText().indexOf(word));
    editor.selection = new vscode.Selection(position, position);
    return document;
  }
  async function location(file: string, word: string) {
    const document = await vscode.workspace.openTextDocument(path.join(root!, file));
    const position = document.positionAt(document.getText().indexOf(word));
    return new vscode.Location(document.uri, new vscode.Range(position, position.translate(0, word.length)));
  }
  try {
    const target = "function value = accuracyTarget()\nvalue = 42;\nend\n";
    const files: Record<string, string> = {
      "accuracyTarget.m": target,
      "accuracyCaller.m": "function value = accuracyCaller\nvalue = accuracyTarget();\nvalue = accuracyTarget();\nend\n",
      "accuracyScript.m": "callback = @accuracyTarget;\naccuracyTarget\n",
      "accuracyLocal.m": "function value = accuracyLocal\nvalue=accuracyTarget();\nend\nfunction value=accuracyTarget\nvalue=1;\nend\n",
      "area/private/accuracyTarget.m": target,
      "area/privateCaller.m": "function value=privateCaller\nvalue=accuracyTarget();\nend\n",
      "+pkg/accuracyTarget.m": target,
      "qualified.m": "pkg.accuracyTarget();\n",
      "array.m": "accuracyTarget=[1,2];\nvalue=accuracyTarget(1);\n",
      "variable.m": "function value = variable(sharedValue)\nvalue = sharedValue + 1;\nend\n",
      "sharedValue.m": "function value = sharedValue\nvalue = 7;\nend\n",
      "path-selected/accuracyPathMain.m": "function value = accuracyPathMain\nvalue = accuracyPathLeaf();\nend\n",
      "shared/accuracyPathLeaf.m": "function value = accuracyPathLeaf\nvalue = 7;\nend\n"
    };
    for (const [relative, source] of Object.entries(files)) {
      const file = path.join(root, relative); await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, source, { encoding: "utf8", flag: "wx" });
    }
    for (const [name, value] of Object.entries({ watchFiles: false, analysisMode: "folder", includeExternal: false,
      "folder.useWorkspacePath": true, "folder.additionalSearchRoots": [], "symbols.requestTimeoutSeconds": 1, "symbols.analysisTimeoutSeconds": 30 })) {
      await config.update(name, value, vscode.ConfigurationTarget.Global);
    }
    const declaration = await location("accuracyTarget.m", "accuracyTarget");
    registered.push(vscode.languages.registerDefinitionProvider({ scheme: "file", pattern: "**/*.m" }, {
      provideDefinition(document, position) {
        if (mode === "hung") return new Promise<never>(() => {});
        const word = document.getText(document.getWordRangeAtPosition(position));
        return mode !== "empty" && word === "accuracyTarget" ? [declaration] : [];
      }
    }));
    registered.push(vscode.languages.registerReferenceProvider({ scheme: "file", pattern: "**/*.m" }, {
      async provideReferences(document, position) {
        if (mode === "hung") return new Promise<never>(() => {});
        const word = document.getText(document.getWordRangeAtPosition(position));
        if (word === "sharedValue") return [...document.getText().matchAll(/\bsharedValue\b/g)].map((match) => {
          const start = document.positionAt(match.index!); return new vscode.Location(document.uri, new vscode.Range(start, start.translate(0, word.length)));
        });
        if (word !== "accuracyTarget" || mode === "empty") return [];
        return mode === "partial" ? [declaration, await location("accuracyCaller.m", "accuracyTarget")] : [declaration];
      }
    }));
    await select("accuracyTarget.m", "accuracyTarget");
    await vscode.commands.executeCommand("matlabViz.traceSymbolReferences");
    let graph = await cached();
    assert.equal(graph.nodes.length, 3); assert.equal(graph.edges.length, 2);
    assert.ok(graph.edges.some((edge) => edge.details?.includes("lines 2, 3")));
    assert.ok(graph.nodes.some((node) => node.label === "accuracyScript.m"));
    assert.ok(!graph.nodes.some((node) => ["accuracyLocal", "privateCaller", "qualified.m", "array.m"].includes(node.label)));
    await fs.writeFile(path.join(artifacts, "references-declaration-only.json"), JSON.stringify(graph, null, 2));
    log("Declaration-only provider recovered three symbols/two reference edges, grouped lines, and the script caller without local/private/package/array false positives");
    mode = "partial";
    await vscode.commands.executeCommand("matlabViz.refresh"); graph = await cached();
    assert.equal(graph.edges.length, 2); assert.ok(graph.edges.some((edge) => edge.details?.includes("MATLAB syntax + language service")));
    mode = "empty"; await select("accuracyScript.m", "accuracyTarget");
    await vscode.commands.executeCommand("matlabViz.traceSymbolReferences"); graph = await cached();
    assert.equal(graph.nodes.length, 3); assert.equal(graph.metadata.rootSymbol, "accuracyTarget");
    log("Partial providers merge evidence; selecting a function use works with empty Definition/References providers");
    await select("variable.m", "sharedValue"); await vscode.commands.executeCommand("matlabViz.traceSymbolReferences");
    graph = await cached(); assert.equal(graph.nodes.length, 2); assert.equal(graph.edges.length, 1);
    assert.equal(graph.nodes.find((node) => node.label === "sharedValue")?.kind, "variable");
    assert.ok(!graph.problems.some((problem) => problem.message.includes("Recovered")));
    mode = "hung"; await select("accuracyTarget.m", "accuracyTarget");
    await vscode.commands.executeCommand("matlabViz.traceSymbolReferences"); graph = await cached();
    assert.equal(graph.nodes.length, 3); assert.equal(graph.problems.filter((problem) => problem.severity === "warning").length, 2);
    mode = "declaration"; await vscode.commands.executeCommand("matlabViz.refresh");
    assert.equal((await cached()).edges.length, 2);
    log("Variable references remain provider-scoped; hung providers produce warnings plus syntax results and recover on Refresh");

    await config.update("includeExternal", true, vscode.ConfigurationTarget.Global);
    await config.update("maximumFiles", 1, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand("matlabViz.analyzeSelection", vscode.Uri.file(path.join(root, "path-selected")));
    graph = await cached(); assert.equal(graph.metadata.graphType, "files");
    assert.equal(graph.nodes.length, 2); assert.equal(graph.edges.length, 1);
    assert.equal(graph.nodes.filter((node) => node.external).length, 1);
    assert.equal(graph.metadata.searchRoots?.length, 1);
    await config.update("includeExternal", false, vscode.ConfigurationTarget.Global); await vscode.commands.executeCommand("matlabViz.refresh");
    assert.equal((await cached()).nodes.length, 1); assert.equal((await cached()).edges.length, 0);
    await config.update("includeExternal", true, vscode.ConfigurationTarget.Global);
    await config.update("folder.useWorkspacePath", false, vscode.ConfigurationTarget.Global); await vscode.commands.executeCommand("matlabViz.refresh");
    assert.equal((await cached()).nodes.length, 1);
    await config.update("folder.additionalSearchRoots", ["shared"], vscode.ConfigurationTarget.Global); await vscode.commands.executeCommand("matlabViz.refresh");
    graph = await cached(); assert.equal(graph.nodes.length, 2); assert.equal(graph.edges.length, 1);
    await fs.writeFile(path.join(artifacts, "folder-workspace-lookup.json"), JSON.stringify(graph, null, 2));
    log("Real MATLAB folder commands resolve sibling dependencies without expanding source count, respect external filtering, and support opt-out/relative lookup roots");
    await config.update("folder.additionalSearchRoots", ["missing-lookup-root"], vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand("matlabViz.refresh");
    assert.equal((await cached()).metadata.generatedAt, graph.metadata.generatedAt);
    await config.update("folder.additionalSearchRoots", ["shared"], vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand("matlabViz.refresh");
    assert.equal((await cached()).nodes.length, 2);
    log("Invalid lookup roots preserve the previous graph and retry succeeds without dismissing the error notification");
    await fs.writeFile(path.join(artifacts, "accuracy-result.json"), JSON.stringify({ passed: true, observations }, null, 2));
  } catch (error) {
    log(error instanceof Error ? error.stack ?? error.message : String(error));
    await fs.writeFile(path.join(artifacts, "accuracy-result.json"), JSON.stringify({ passed: false, observations }, null, 2));
    throw error;
  } finally { registered.forEach((item) => item.dispose()); await fs.writeFile(path.join(artifacts, "accuracy.log"), observations.join("\n")); }
}
