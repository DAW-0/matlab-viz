# MATLAB Viz 0.3.9 validation

Date: 2026-11-01. Windows, installed VSCodium, MATLAB R2026b, and Node.js.
Scope: resizable right-hand details panel and regressions for view persistence,
graph interaction, logging, and visual exports. No production MATLAB analyzer
code changes in this batch.

## Results

| Check | Result |
|---|---|
| TypeScript, ESLint, production build | Passed |
| Deterministic Node tests | All 81 passed, including seven new resizing tests |
| Complete suite with real MATLAB enabled | All 82 passed; no failures/skips/cancellations; approximately 111 seconds |
| Native visual/restoration suite | All eight phases passed |
| Additional responsive visual run | Passed, including actual compact CSS and canvas-only ResizeObserver checks |
| SVG/PNG regression | 515 vector nodes / 648 arrowed edges; filtered two-node/one-edge output; 4x PNG 3042 x 472 with rendered pixels |
| Package inspection | 15 VSIX entries; six production asset/helper SHA-256 hashes match; no test code, profiles, logs, or artifacts |
| Local installation | `daw-0.matlab-viz@0.3.9` verified; normal user windows not reloaded |

The opt-in MATLAB integration test exercises real process output/logs, Unicode
paths, singleton and one-edge JSON, data exports, file-limit/missing-project
errors, cancellation, and retry. The separate 13-test MATLAB function suite was
not rerun: the production helpers are unchanged and passed in 0.3.8.

## Panel behavior verified

- Dragging the divider changes the grid width without rebuilding graph nodes.
  A trusted single 160-pixel mouse move, well outside the six-pixel handle, changes
  the panel from 280 to 440 pixels; a trusted Left key then increases it to 450.
- Selection, dependency trace, node positions, existing node identity, and custom
  pan/zoom remain unchanged. Fitted views refit to available canvas dimensions.
- Keyboard fine/coarse steps, Home/End limits, Enter/double-click reset, and
  accessible numeric values have deterministic checks.
- Secondary-pointer rejection, cancellation, release, missing capture delivery,
  capture recovery, and blur termination have regression coverage.
- Temporary width constraints leave at least 240 pixels for the graph. A native
  900-pixel container produces a 240-pixel graph at the maximum panel width.
- A canvas-only height change triggers real ResizeObserver delivery and Fit
  without dispatching a window resize event. Native viewport emulation below
  800 pixels hides the panel/divider through the actual CSS media query; widening
  restores the preferred width.
- Custom widths of 430 pixels for a detached call graph and 330 pixels for a
  reference graph survive application restart, Reload Window, and Refresh along
  with the existing selection/filter/viewport/Refresh-target checks.
- Width persists across new analysis results in the same view. Legacy state
  defaults to 280; malformed widths are ignored and finite widths are bounded.

## Native failure found and repaired

The initial native test first exposed the existing compact breakpoint: opening
both editor sidebars left too little room to show the details panel. The visual
harness now closes those sidebars only in its isolated profile before dragging.
Compact behavior is tested separately with a genuine narrow viewport.

The next run exposed an actual pointer issue missed by fake DOM tests: the
renderer did not retain requested handle capture, and subsequent move/release
events reached the graph rather than the handle, without a lost-capture event.
Document capture-phase fallback listeners now handle those events and prevent
the resize gesture from reaching graph selection/pan handlers. A regression
reproduces this exact path. Native pointer evidence confirms the panel changes
width and the graph state stays unchanged. Release/cancel/blur cleanup and
post-resize click handling are documented in the implementation.

## Evidence on the development machine

Ignored artifacts under `.tools/validation/0.3.9/` include:

- `node-final.log`, `runner-summary.json`, `runner-*.log`, and data exports.
- `native-document-capture/*-result.json`: all eight passing native phases;
  expected call/reference snapshots record the custom widths.
- `native-responsive/visual-result.json`: final expanded visual/responsive run.
- `native-responsive/splitter-events.json`, `resized-details.png`, graph images,
  exported SVG/PNG, and editor-managed MATLAB Viz output logs.

Earlier diagnostic runs remain for comparison and are superseded by the named
passing results. Test profiles use their own settings, storage, and extensions;
no user repository source is modified. Test harnesses/artifacts are not bundled.

## Boundaries

The saved width belongs to an existing graph view, not a global preference for
brand-new tabs. The existing compact mode still hides details at 800 pixels or
below; widen the graph editor to access them. Fitted zoom can change on resize,
but manually customized pan/zoom is preserved. Full-graph visual export remains
independent of viewport dimensions; explicit viewport export reflects the newly
available canvas size.

Tests check accessible numeric values and actual keyboard interaction, not a
manual assistive-technology session. Native tests ran on Windows/VSCodium;
other desktop platforms and browsers are not claimed as validated. Remaining
unrelated limitations are listed in the [acceptance record](ACCEPTANCE_TESTS.md).
