# MATLAB Viz 0.3.7 validation

Date: 2026-10-31. Windows, installed VSCodium, MATLAB R2026b, and Node.js.
This batch covers webview layout, mouse interaction, visual exports, and
additional saved-tab restoration repairs. It does not close every item in
the [acceptance record](ACCEPTANCE_TESTS.md).

## Results

| Check | Result |
|---|---|
| TypeScript, ESLint, and production build | Passed |
| Deterministic Node regressions | 53 passed |
| Full suite with real MATLAB enabled | 54 passed; no failures, cancellations, or skips; approximately 201 seconds |
| Actual VSCodium suite | All eight phases passed |
| Large graph layout/Fit | All 515 nodes checked in Grid, Circle, Hierarchical, and Force: no overlapping rectangles, no Fit clipping, no overflowing text lines |
| Full SVG | 515 vector nodes, 648 explicit arrowed edges; browser XML parse passed; no bitmap or truncated labels |
| Filtered SVG/PNG | Exactly two nodes/one edge; 4x PNG decoded at 3042 x 472 and contained rendered pixels |
| Real mouse input | Click selection, retained trace during pan, rapid drag, stable DOM identity, and capture recovery passed |
| Oversized PNG | Actionable requested-dimensions/safety-limit error; no blank or silently downscaled output |
| Actual export log | Requests, rendered counts/pixel dimensions, saved paths/byte counts, and expected size-limit error checked |
| VSIX | 15 archive entries; production JS/CSS hashes match tested sources; no tests, profiles, logs, artifacts, or node_modules |

The full suite contains 54 tests: 53 deterministic regressions and one opt-in
real MATLAB process integration. The latter exercises six separate MATLAB
launches: singleton JSON, a single edge, file-limit and missing-project errors,
cancellation, and successful retry. It also checks Unicode paths, JSON/DOT/CSV
artifacts, and real runner logs. A busy-desktop run exceeded the original
four-minute test deadline even though its final assertions later completed.
The test-only allowance is now ten minutes; production analysis timeouts
are unchanged. The final complete run passed all 54 tests in approximately
201 seconds, including the real MATLAB integration.

## What the editor tests verified

The visual phase loads a retained repository graph into an isolated cache; it
does not rerun or modify the user's repository. The browser checks actual
node rectangles, text lengths, Fit boundaries, and every pair of nodes in all
four layouts. Force uses its documented hierarchical fallback for this large
graph. Separate regressions exercise rectangle separation for force results,
cycles/disconnected components, and a 5,000-node chain.

Trusted Chromium mouse events drive the actual editor, not only fake DOM
handlers. They caught capture loss while the button remained pressed and
click retargeting to the SVG capture owner. The repaired graph keeps the
gesture alive, reacquires capture, and updates only the dragged node and its
incident edges. Panning preserves the selected trace. Manual dragging is still
allowed to overlap nodes; selecting a layout again restores automatic spacing.

The visual phase uses real format/framing/resolution pickers and the editor's
simple save dialog, enabled only in that isolated profile. It saves a full SVG
after deliberately zooming past the graph's extents, parses the saved XML,
counts vector nodes/edges/arrowheads, and verifies no embedded bitmap. It then
exports a two-node dependency trace as SVG and 4x PNG, decodes the PNG in the
browser, checks its dimensions/nonblank pixels, and saves explicit viewport
output. The filtered PNG was also inspected visually for clear labels and a
visible arrow. A deliberately huge PNG must fail with an actionable message.

The seven subsequent phases repeat the 0.3.6 restart, Reload Window, detached
call/reference graph, original Refresh-target, and deliberately hung provider
checks. A logically active auxiliary group may not own actual DOM focus after
startup. Show now explicitly focuses that group before selecting its saved
tab. A queued initial Fit also checks for intervening user zoom before running.

The harness waits for paint only after explicitly showing the graph: background
analysis deliberately does not steal focus from the source editor, and hidden
webviews can suspend animation frames. Recursive debugger attachment and
closed-target reconnection are test-only infrastructure, not shipped features.

## Evidence on the development machine

Artifacts under `.tools/validation/0.3.7/` are excluded from Git and the VSIX:

- `focus-verified/*-result.json`: the final eight passing editor phases.
- `focus-verified/full-graph.svg`, `filtered.svg`, `filtered-4x.png`, and
  `viewport.svg`: actual saved visual exports.
- `focus-verified/pointer-events.json`, editor screenshots, and phase logs.
- `focus-verified/persistent-profile-*/logs/.../MATLAB Viz.log`: actual
  editor-managed output, including rendered counts and the expected PNG error.
- `runner-summary.json`, `runner-*.log`, and `runner-one-edge.{json,csv,dot}`:
  real MATLAB runner artifacts.

Earlier diagnostic profiles/results are retained. Their superseded failures
document the repairs; use `focus-verified` for the final editor outcome.
The pre-existing MATLAB function/standalone artifact suite was not fully rerun:
the production MATLAB analyzer code is unchanged in this batch.

## Remaining limitations

Automatic layouts avoid node overlap, not every possible edge crossing.
Readability of hundreds of labels at once is limited by screen/raster size;
SVG remains the zoomable option for large graphs. PNG is limited to 32
megapixels and 16,384 pixels per side. Search highlights rather than removes
nodes; dependency/impact and visibility controls determine visual export scope.
Data exports remain independent of visual filters: JSON is the complete model,
DOT includes all nodes/edges, and CSV is the complete dependency-edge table.

Standalone MATLAB-rendered labels/edges, reference completeness, external-folder
resolution, a resizable details panel, and other acceptance items remain
separate work. Cross-platform and older editor versions still need coverage.
The existing missing-distribution-license warning remains; public publishing
is still deferred.
