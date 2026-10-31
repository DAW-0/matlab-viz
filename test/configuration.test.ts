import assert from "node:assert/strict";
import * as path from "node:path";
import test from "node:test";
import { loadExtensionModule } from "./support/loadModule";
import type { AnalysisOptions } from "../src/model";

function options(root: string, workspace?: string, values: Record<string, unknown> = {}) {
  let resource: any;
  const configuration = loadExtensionModule<{ readAnalysisOptions: (root: string) => AnalysisOptions }>("configuration.js", {
    vscode: { Uri: { file: (fsPath: string) => ({ fsPath }) }, workspace: {
      getConfiguration: (_name: string, value: unknown) => { resource = value; return { get: (name: string, fallback: unknown) => values[name] ?? fallback }; },
      getWorkspaceFolder: () => workspace ? { uri: { fsPath: workspace } } : undefined
    } }
  });
  return { value: JSON.parse(JSON.stringify(configuration.readAnalysisOptions(root))) as AnalysisOptions, resource };
}

test("selected-folder analysis adds only its containing workspace as lookup context", () => {
  const workspace = path.resolve("/repo"), root = path.join(workspace, "selected");
  const result = options(root, workspace);
  assert.deepEqual(result.value.searchRoots, [workspace]);
  assert.equal(result.resource.fsPath, root);
  assert.equal(result.value.includeExternal, false, "lookup context silently enabled external nodes");
  assert.deepEqual(options(workspace, workspace).value.searchRoots, []);
});

test("workspace lookup is optional and additional roots resolve/deduplicate predictably", () => {
  const workspace = path.resolve("/repo"), root = path.join(workspace, "selected");
  const result = options(root, workspace, { "folder.useWorkspacePath": false,
    "folder.additionalSearchRoots": ["shared", "shared", root, " "] });
  assert.deepEqual(result.value.searchRoots, [path.join(workspace, "shared")]);
});

test("a root outside a workspace never searches unrelated parents implicitly", () => {
  const root = path.resolve("/outside/selected");
  assert.deepEqual(options(root).value.searchRoots, []);
  assert.deepEqual(options(root, undefined, { "folder.additionalSearchRoots": ["../helpers"] }).value.searchRoots, [path.resolve(root, "../helpers")]);
});
