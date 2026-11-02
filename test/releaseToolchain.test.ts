import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import test from "node:test";

const root = path.resolve(__dirname, "../..");
const requireHere = createRequire(__filename);

test("only patched minimatch resolves for each reviewed current toolchain consumer", () => {
  for (const parent of ["eslint", "@eslint/config-array", "@vscode/vsce", "@typescript-eslint/typescript-estree"]) {
    const fromParent = createRequire(requireHere.resolve(parent));
    assert.equal(fromParent("minimatch/package.json").version, "11.0.1", parent);
    const { minimatch, Minimatch } = fromParent("minimatch");
    assert.equal(minimatch("src/core/exporters.ts", "src/**/*.ts", { dot: true }), true);
    assert.equal(minimatch("test/host/reports.ts", "src/**/*.ts", { dot: true }), false);
    assert.equal(new Minimatch("**/*.ts", { dot: true }).match("test/host/reports.ts"), true);
    assert.equal(minimatch(".tools/private-profile/state.json", ".tools/**", { dot: true }), true);
    assert.equal(minimatch("media/graph.js", "media/**", { dot: true }), true);
  }
});

test("flat ESLint configuration includes real TS source/tests and ignores generated/private output", async () => {
  const { ESLint } = requireHere("eslint");
  const engine = new ESLint({ cwd: root });
  assert.equal(await engine.isPathIgnored(path.join(root, "src/extension.ts")), false);
  assert.equal(await engine.isPathIgnored(path.join(root, "test/graphPanel.test.ts")), false);
  assert.equal(await engine.isPathIgnored(path.join(root, ".tools/private/file.ts")), true);
  assert.equal(await engine.isPathIgnored(path.join(root, "dist-test/test/file.ts")), true);
  const [result] = await engine.lintText("const deliberatelyUnused = 1;", { filePath: "src/release-lint-probe.ts" });
  assert.ok(result.messages.some((item: { ruleId: string }) => item.ruleId?.includes("no-unused-vars")), "Lint must still enforce recommended rules");
});

test("patched preprocessing handles amplified glob input within a bounded child process", () => {
  const modulePath = createRequire(requireHere.resolve("@vscode/vsce")).resolve("minimatch");
  // The advisory's optimizationLevel=2 preprocessing amplifies repeated
  // globstar/parent sections. Bound the probe even if a future edit regresses
  // the dependency pin; never let an adversarial test hang the full suite.
  const probe = `const {Minimatch}=require(${JSON.stringify(modulePath)});new Minimatch('**/../'.repeat(14)+'*.ts',{optimizationLevel:2});`;
  const result = spawnSync(process.execPath, ["-e", probe], { timeout: 5000, windowsHide: true, encoding: "utf8" });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
});

test("release manifest, policies and packaged guides agree on license and narrow support", () => {
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(manifest.license, "MIT"); assert.equal(manifest.engines.vscode, "^1.143.0");
  assert.equal(manifest.capabilities.untrustedWorkspaces.supported, false);
  assert.equal(manifest.capabilities.virtualWorkspaces.supported, false);
  assert.match(readFileSync(path.join(root, "LICENSE"), "utf8"), /Permission is hereby granted, free of charge/);
  assert.match(readFileSync(path.join(root, "SUPPORT.md"), "utf8"), /1\.143\.17232/);
  assert.match(readFileSync(path.join(root, "SECURITY.md"), "utf8"), /security\/advisories\/new/);
});
