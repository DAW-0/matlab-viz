import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

// Rasterize only our repository-owned, font-free vector. The pinned renderer
// makes the checked-in marketplace PNG reproducible without a GUI or network.
const source = new URL("../media/marketplace-icon.svg", import.meta.url);
const output = new URL("../media/marketplace-icon.png", import.meta.url);
const rendered = new Resvg(readFileSync(source), { fitTo: { mode: "width", value: 256 } }).render();
assert.equal(rendered.width, 256);
assert.equal(rendered.height, 256);
const bytes = rendered.asPng();
if (process.argv.includes("--check")) {
  assert.ok(readFileSync(output).equals(bytes), "Marketplace PNG is stale; run npm run icon:build");
  console.log("Marketplace PNG matches its SVG source (256 x 256).");
} else {
  writeFileSync(output, bytes);
  console.log(`Rendered marketplace icon: ${fileURLToPath(output)}`);
}
