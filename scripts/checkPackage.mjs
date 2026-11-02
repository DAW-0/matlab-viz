import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
// Use the exact ZIP reader locked with VSCE; no runtime dependency is bundled.
const yauzl = createRequire(require.resolve("@vscode/vsce/package.json"))("yauzl");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expected = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const archive = process.argv[2];
if (!archive) throw new Error("Usage: node scripts/checkPackage.mjs path.vsix");
const files = new Map();
await new Promise((resolve, reject) => {
  yauzl.open(archive, { lazyEntries: true }, (error, zip) => {
    if (error) { reject(error); return; }
    zip.on("error", reject); zip.on("end", resolve);
    zip.on("entry", entry => {
      if (entry.fileName.endsWith("/")) { zip.readEntry(); return; }
      if (entry.uncompressedSize > 10 * 1024 * 1024 || files.has(entry.fileName)) { zip.close(); reject(new Error("Unexpected large or duplicate package entry")); return; }
      zip.openReadStream(entry, (streamError, stream) => {
        if (streamError) { zip.close(); reject(streamError); return; }
        const chunks = []; stream.on("data", chunk => chunks.push(chunk)); stream.on("error", reject);
        stream.on("end", () => { files.set(entry.fileName, Buffer.concat(chunks)); zip.readEntry(); });
      });
    });
    zip.readEntry();
  });
});
for (const name of ["README.md", "SECURITY.md", "SUPPORT.md", "dist/extension.js", "media/graph.js", "matlab/MatlabVizAnalyze.m",
  "docs/ENTRY_POINT_REPORTS.md", "docs/IMPACT_REPORTS.md", "docs/ANALYSIS_COMPARISON.md", "docs/RELEASE.md"]) {
  assert.ok([...files.keys()].some(item => item.toLowerCase() === `extension/${name}`.toLowerCase()), `Missing package file: ${name}`);
}
const packaged = JSON.parse(files.get("extension/package.json").toString("utf8"));
assert.equal(packaged.version, expected.version); assert.equal(packaged.license, "MIT");
assert.equal(packaged.engines.vscode, expected.engines.vscode);
// VSCE normalizes an extensionless source LICENSE to LICENSE.txt in the VSIX.
const license = [...files].find(([name]) => /^extension\/license(?:\.txt|\.md)?$/i.test(name));
assert.ok(license, "MIT license is missing from the package");
assert.match(license[1].toString("utf8"), /Permission is hereby granted, free of charge/);
for (const name of files.keys()) assert.ok(!/^extension\/(?:test|dist-test|node_modules|\.tools|scripts|\.github)\//i.test(name), `Private/development content leaked into VSIX: ${name}`);
// Required user guides ship for offline use. Release-generated registry links
// must be pinned, not drift to HEAD; the local source tag is pushed only with
// separate authorization before public publication.
if (process.argv[3] === "--tag") {
  const readme = [...files].find(([name]) => name.toLowerCase() === "extension/readme.md")[1].toString("utf8");
  assert.ok(readme.includes(`/blob/${process.argv[4]}/docs/`), "Release documentation links are not tag-pinned");
}
assert.ok(files.get("extension/dist/extension.js").includes(Buffer.from("matlabViz")));
console.log(JSON.stringify({ version: packaged.version, entries: files.size, license: packaged.license,
  sha256: createHash("sha256").update(readFileSync(archive)).digest("hex") }));
