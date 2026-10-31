import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { graphToCsv, graphToDot } from "../../src/core/exporters";
import { validateGraph, type DependencyGraph } from "../../src/model";

/** Entry point for VSCodium/VS Code's --extensionTestsPath runner. */
export async function run(): Promise<void> {
  const artifacts = process.env.MATLAB_VIZ_TEST_ARTIFACTS;
  const profile = process.env.MATLAB_VIZ_HOST_PROFILE;
  const fixtures = process.env.MATLAB_VIZ_HOST_FIXTURES;
  const executable = process.env.MATLAB_VIZ_TEST_EXECUTABLE;
  assert.ok(artifacts && profile && fixtures && executable, "Host test environment is incomplete");
  const logFile = path.join(artifacts, "vscodium-host.log");
  const observations: string[] = [];
  const log = (message: string): void => { observations.push(message); console.log(`[MATLAB Viz host test] ${message}`); };
  const config = vscode.workspace.getConfiguration("matlabViz");
  const project = path.join(fixtures, "project");
  const missing = path.join(fixtures, "missing-project");
  const storage = path.join(profile, "User", "workspaceStorage");
  async function command(name: string, ...args: unknown[]): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        vscode.commands.executeCommand(name, ...args),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`${name} did not finish; notification may be blocking`)), 90_000); })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async function cachedGraph(): Promise<DependencyGraph> {
    for (const entry of await fs.readdir(storage, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const cache = path.join(storage, entry.name, "daw-0.matlab-viz", "last-graph.json");
      try { return validateGraph(JSON.parse(await fs.readFile(cache, "utf8"))); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    throw new Error("Installed-host graph cache was not written");
  }
  try {
    const extension = vscode.extensions.getExtension("daw-0.matlab-viz");
    assert.ok(extension, "Development extension is absent");
    await extension.activate();
    for (const [setting, value] of Object.entries({ matlabExecutable: executable, analysisMode: "project", includeExternal: false,
      includeIsolated: true, watchFiles: false, "project.reanalyzeAll": true, "project.analyzeReferences": false })) {
      await config.update(setting, value, vscode.ConfigurationTarget.Global);
    }
    await command("matlabViz.analyzeSelection", vscode.Uri.file(project));
    const original = await cachedGraph();
    assert.equal(original.nodes.length, 4);
    assert.equal(original.edges.length, 2);
    log("Actual Project command and graph cache: 4 nodes, 2 edges");

    const plain = await fs.mkdtemp(path.join(os.tmpdir(), "matlab-viz-host-plain-"));
    await fs.writeFile(path.join(plain, "single.m"), "value = 1;\n");
    await command("matlabViz.analyzeSelection", vscode.Uri.file(plain));
    assert.equal((await cachedGraph()).metadata.generatedAt, original.metadata.generatedAt);
    log("Missing-project error returned while its notification was not dismissed; previous cache retained");
    await command("matlabViz.analyzeSelection", vscode.Uri.file(project));
    assert.notEqual((await cachedGraph()).metadata.generatedAt, original.metadata.generatedAt);
    log("Real file-analysis retry succeeded with the previous error notification untouched");

    await command("matlabViz.showGraph");
    for (const name of ["matlabViz.showCallHierarchy", "matlabViz.traceSymbolReferences"]) {
      // The active graph is not a MATLAB editor, producing a bounded input error.
      await command(name);
      await command("matlabViz.analyzeSelection", vscode.Uri.file(project));
      assert.equal((await cachedGraph()).edges.length, 2);
      log(`Retry succeeded after ${name} input error without dismissing notifications`);
    }
    await command("matlabViz.analyzeSelection", vscode.Uri.file(missing));
    const result = await cachedGraph();
    assert.equal(result.nodes.length, 4);
    assert.equal(result.edges.length, 1);
    assert.equal(result.problems.length, 1);
    assert.equal(result.nodes.filter((node) => node.missing).length, 1);
    assert.ok(result.problems[0]?.file?.endsWith("/leaf.m"));
    await fs.writeFile(path.join(artifacts, "host-missing-project.json"), JSON.stringify(result, null, 2));
    await fs.writeFile(path.join(artifacts, "host-missing-project.dot"), graphToDot(result));
    await fs.writeFile(path.join(artifacts, "host-missing-project.csv"), graphToCsv(result));
    await command("matlabViz.showGraph");
    log("Actual missing-file Project command: 4 nodes, 1 edge, 1 missing node, 1 notice; JSON/DOT/CSV saved");
    await fs.writeFile(path.join(artifacts, "vscodium-host-result.json"), JSON.stringify({ passed: true, observations }, null, 2));
  } catch (error) {
    log(error instanceof Error ? error.stack ?? error.message : String(error));
    await fs.writeFile(path.join(artifacts, "vscodium-host-result.json"), JSON.stringify({ passed: false, observations }, null, 2));
    throw error;
  } finally {
    await fs.writeFile(logFile, observations.join("\n") + "\n");
  }
}
