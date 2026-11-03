import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import test from "node:test";

const root = path.resolve(__dirname, "../..");
const requireHere = createRequire(__filename);

test("marketplace icon preserves four-corner graph semantics and stays self-contained", () => {
  const source = readFileSync(path.join(root, "media/marketplace-icon.svg"), "utf8");
  assert.equal((source.match(/<circle\b/g) ?? []).length, 4);
  for (const [x, y] of [[64, 64], [192, 64], [64, 192], [192, 192]]) {
    assert.ok(source.includes(`cx="${x}" cy="${y}"`));
  }
  assert.match(source, /blue dependency arrows converge/);
  assert.match(source, /green impact arrow leads/);
  assert.doesNotMatch(source, /<(?:image|script|foreignObject|text)\b|(?:href|onload)=/i);
});

test("marketplace PNG is reproducible, square, legible-sized and wired to the manifest", () => {
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(manifest.icon, "media/marketplace-icon.png");
  assert.equal(manifest.preview, true);
  assert.equal(manifest.galleryBanner.theme, "dark");
  // Activity-bar SVG remains monochrome and separate from the gallery bitmap.
  assert.equal(manifest.contributes.viewsContainers.activitybar[0].icon, "media/icon.svg");
  const png = readFileSync(path.join(root, manifest.icon));
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 256);
  assert.equal(png.readUInt32BE(20), 256);
  const { Resvg } = requireHere("@resvg/resvg-js");
  const rendered = new Resvg(readFileSync(path.join(root, "media/marketplace-icon.svg")), {
    fitTo: { mode: "width", value: 256 }
  }).render().asPng();
  assert.ok(png.equals(rendered), "PNG must match the pinned renderer's SVG output");
  const small = new Resvg(readFileSync(path.join(root, "media/marketplace-icon.svg")), {
    fitTo: { mode: "width", value: 32 }
  }).render();
  assert.equal(small.width, 32);
  assert.equal(small.height, 32);
  assert.ok(small.asPng().length > 100);
});

test("activity-bar glyph matches four nodes and three arrows using only theme-controlled monochrome", () => {
  const source = readFileSync(path.join(root, "media/icon.svg"), "utf8");
  assert.match(source, /viewBox="0 0 24 24"/);
  assert.equal((source.match(/<circle\b/g) ?? []).length, 4);
  assert.equal((source.match(/<path\b/g) ?? []).length, 3);
  for (const [x, y] of [[5, 5], [19, 5], [5, 19], [19, 19]]) {
    assert.ok(source.includes(`cx="${x}" cy="${y}"`));
  }
  assert.match(source, /cx="5" cy="5" r="2\.75" fill="currentColor"/);
  assert.doesNotMatch(source, /<(?:rect|image|script|foreignObject|text)\b|(?:href|onload)=/i);
  const colors = [...source.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map(match => match[1]);
  assert.ok(colors.length > 0 && colors.every(color => color === "none" || color === "currentColor"));
  const { Resvg } = requireHere("@resvg/resvg-js");
  // The editor supplies the tint. Substitute representative foregrounds only
  // in test memory, never hard-code them into the shipped activity-bar SVG.
  for (const color of ["#c5c5c5", "#424242"]) {
    const rendered = new Resvg(source.replaceAll("currentColor", color), {
      fitTo: { mode: "width", value: 24 }
    }).render();
    assert.equal(rendered.width, 24);
    assert.equal(rendered.height, 24);
    assert.ok(rendered.asPng().length > 100);
  }
});
