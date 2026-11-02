import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const git = (...args) => execFileSync("git", ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, ...args], { cwd: root, encoding: "utf8" }).trim();
const tag = `v${manifest.version}`;
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--out")) throw new Error("Usage: npm run package:release -- [--out path.vsix]");
if (git("status", "--porcelain")) throw new Error("Release packaging requires a clean committed worktree, including no untracked source files.");
const commit = git("rev-parse", "HEAD");
if (git("rev-parse", `${tag}^{commit}`) !== commit) throw new Error(`${tag} must point to the current commit. No tag is created or moved automatically.`);
const destination = path.resolve(root, args[1] ?? `.tools/releases/${tag}/matlab-viz-${manifest.version}.vsix`);
if (existsSync(destination)) throw new Error("Refusing to overwrite a release artifact. Choose a new --out path.");
mkdirSync(path.dirname(destination), { recursive: true });

// VSCE honors SOURCE_DATE_EPOCH for entry ordering and ZIP timestamps. The
// timestamp comes from the tagged commit, never the current machine clock.
// This command packages locally only: no account/token or publish command.
const epoch = git("show", "-s", "--format=%ct", commit);
const vsceRoot = path.dirname(require.resolve("@vscode/vsce/package.json"));
const base = `https://github.com/DAW-0/matlab-viz/blob/${tag}/`;
const result = spawnSync(process.execPath, [path.join(vsceRoot, "vsce"), "package", "--out", destination,
  "--baseContentUrl", base, "--baseImagesUrl", `https://github.com/DAW-0/matlab-viz/raw/${tag}/`], {
  cwd: root, stdio: "inherit", env: { ...process.env, SOURCE_DATE_EPOCH: epoch }
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const check = spawnSync(process.execPath, [path.join(root, "scripts/checkPackage.mjs"), destination, "--tag", tag], { cwd: root, stdio: "inherit" });
if (check.error) throw check.error;
if (check.status !== 0) process.exit(check.status ?? 1);
console.log(`Local release package: ${tag}, commit ${commit}, SOURCE_DATE_EPOCH=${epoch}`);
