import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { validateGraph, type DependencyGraph } from "../../src/model";

/** Read-only source checks against the user's WEST examples; writes only test artifacts/cache. */
export async function run(): Promise<void> {
  const artifacts = process.env.MATLAB_VIZ_TEST_ARTIFACTS!, profile = process.env.MATLAB_VIZ_HOST_PROFILE!;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  assert.ok(root && artifacts && profile, "Repository accuracy environment missing");
  const name = "load_heating_control_scheme_configuration_from_pulse";
  const file = path.join(root, "lib", `${name}.m`);
  const caller = path.join(root, "utils", "replay_heating_control.m");
  const original = await fs.readFile(file), originalCaller = await fs.readFile(caller);
  const registered: vscode.Disposable[] = [];
  const observations: string[] = [];
  async function cached(): Promise<DependencyGraph> {
    for (const folder of await fs.readdir(path.join(profile, "User/workspaceStorage"), { withFileTypes: true })) {
      if (!folder.isDirectory()) continue;
      try { return validateGraph(JSON.parse(await fs.readFile(path.join(profile, "User/workspaceStorage", folder.name, "daw-0.matlab-viz/last-graph.json"), "utf8"))); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    throw new Error("Repository test graph absent");
  }
  try {
    const config = vscode.workspace.getConfiguration("matlabViz");
    for (const [key, value] of Object.entries({ watchFiles: false, "symbols.maximumNodes": 250, "symbols.analysisTimeoutSeconds": 180 })) {
      await config.update(key, value, vscode.ConfigurationTarget.Global);
    }
    const document = await vscode.workspace.openTextDocument(file);
    const position = document.positionAt(document.getText().indexOf(name));
    const declaration = new vscode.Location(document.uri, new vscode.Range(position, position.translate(0, name.length)));
    registered.push(vscode.languages.registerDefinitionProvider({ scheme: "file", pattern: "**/*.m" }, {
      provideDefinition(source, cursor) { return source.getText(source.getWordRangeAtPosition(cursor)) === name ? [declaration] : []; }
    }));
    registered.push(vscode.languages.registerReferenceProvider({ scheme: "file", pattern: "**/*.m" }, {
      provideReferences(source, cursor) {
        const word = source.getText(source.getWordRangeAtPosition(cursor));
        if (word === name) return [declaration];
        if (word !== "tar_file_path") return [];
        return [...source.getText().matchAll(/\btar_file_path\b/g)].map((match) => {
          const start = source.positionAt(match.index!); return new vscode.Location(source.uri, new vscode.Range(start, start.translate(0, word.length)));
        });
      }
    }));
    let editor = await vscode.window.showTextDocument(document, { preview: false });
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand("matlabViz.traceSymbolReferences");
    const graph = await cached();
    assert.equal(graph.nodes.length, 2); assert.equal(graph.edges.length, 1);
    assert.ok(graph.nodes.some((node) => node.label === "replay_heating_control.m"));
    assert.ok(!graph.nodes.some((node) => node.label === "replay_fueling_control.m"));
    assert.ok(graph.edges[0]?.details?.includes("lines 134;"));
    assert.ok(graph.edges[0]?.details?.includes("MATLAB syntax"));
    await fs.writeFile(path.join(artifacts, "west-function-references.json"), JSON.stringify(graph, null, 2));
    observations.push("WEST function: declaration-only provider recovered replay_heating_control.m at line 134; the commented fueling reference stayed excluded (2 nodes/1 edge)");
    editor = await vscode.window.showTextDocument(document, { preview: false });
    const variable = document.positionAt(document.getText().indexOf("tar_file_path"));
    editor.selection = new vscode.Selection(variable, variable);
    await vscode.commands.executeCommand("matlabViz.traceSymbolReferences");
    const variables = await cached();
    assert.equal(variables.nodes.length, 2); assert.equal(variables.edges.length, 1);
    assert.ok(variables.edges[0]?.details?.includes("lines 9, 10, 14, 16;"));
    assert.ok(!variables.problems.some((problem) => problem.message.includes("Recovered")));
    await fs.writeFile(path.join(artifacts, "west-variable-references.json"), JSON.stringify(variables, null, 2));
    assert.ok((await fs.readFile(file)).equals(original)); assert.ok((await fs.readFile(caller)).equals(originalCaller));
    observations.push("WEST variable: provider-scoped tar_file_path occurrences remain lines 9, 10, 14, 16; both source files are byte-for-byte unchanged");
    await fs.writeFile(path.join(artifacts, "repository-accuracy-result.json"), JSON.stringify({ passed: true, observations }, null, 2));
  } catch (error) {
    observations.push(error instanceof Error ? error.stack ?? error.message : String(error));
    await fs.writeFile(path.join(artifacts, "repository-accuracy-result.json"), JSON.stringify({ passed: false, observations }, null, 2));
    throw error;
  } finally { registered.forEach((item) => item.dispose()); await fs.writeFile(path.join(artifacts, "repository-accuracy.log"), observations.join("\n")); }
}
