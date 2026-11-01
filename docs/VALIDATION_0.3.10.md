# MATLAB Viz 0.3.10 validation

Date: 2026-11-01. Windows, installed VSCodium, MATLAB R2026b, and Node.js.
Scope: retained-graph failure/cancellation status, relationship terminology,
external-analysis policy versus visibility, and existing UI/export regressions.

## Results

| Check | Result |
|---|---|
| TypeScript, ESLint, production build | Passed |
| Deterministic Node suite | All 89 passed, including eight new tests |
| Full suite with real MATLAB enabled | All 90 passed; no failures/cancellations/skips; approximately 100 seconds |
| Native clarity phase | All three observation groups passed |
| Native restart/Reload Window/provider suite | All seven phases passed |
| Native visual/export phase | Passed: all four layouts, pointer/divider/keyboard behavior, compact CSS, SVG/PNG, logs, and expected oversized-PNG error |
| VSIX inspection | 15 entries; six production asset/helper SHA-256 hashes match; no tests, profiles, logs, or artifacts |
| Local installation | `daw-0.matlab-viz@0.3.10` verified; user windows not reloaded |

The native phases are split across fresh isolated profiles: the visual phase
seeds its own graph cache, while clarity plus the seven restoration phases run
sequentially in another profile. No user repository source/settings are modified.

## Retained-graph evidence

An actual MATLAB folder analysis on the existing four-file fixture succeeds.
Lowering Maximum Files to one causes a real MATLAB error. The prior graph/cache,
selection, custom viewport, details, and width remain unchanged; a persistent
banner identifies the previous result and its generation time. Show does not
erase the notice. Restoring the limit and clicking Refresh Displayed Graph
succeeds with the error notification left untouched, then clears the banner.

The detached call graph is deliberately given a missing-root failure before
application restart. Its saved snapshot includes the visible failure banner;
after restart, the exact view and notice restore, and successful Refresh clears
the notice. Actual Reload Window repeats this for call/reference graph views.
Unit tests additionally cover cancellation, malformed/stale status, no graph
replacement/reveal, unchanged cache bytes, and late notification dismissal.
Errors are rendered as plain text, not HTML. View status is excluded from the
graph model/cache and dependency exports; no analysis-history database is added.

## Wording and external-policy evidence

Actual call/reference commands show Function Call and Symbol Reference headings,
appropriate traversal labels, and reference-link summaries. Deterministic checks
cover all three graph kinds, singular/plural wording, and distinct-neighbor counts.
One reference link can represent multiple source occurrences; details retain the
grouped source lines/evidence and relationship type.

The new result records the external-inclusion option captured before analysis.
Changing the setting alone does not change the displayed result's policy text.
After successful Refresh, metadata and the toolbar reflect the new policy.
Toggling Show External Nodes changes visibility without running analysis or
changing that policy. The settings button opens the actual Include External
setting without starting analysis. Legacy results are explicitly unrecorded.
Enabling inclusion is not a guarantee of complete static resolution.

## Regression evidence

The visual phase checks 515 nodes in Grid, Circle, Hierarchical, and Force with
no automatic node overlap/Fit clipping. Full SVG contains 515 vector nodes and
648 arrowed edges with no embedded bitmap. Filtered SVG/PNG contains two nodes
and one edge; 4x PNG decodes at 3042 x 472 with rendered pixels. Native pointer,
keyboard, resizable-panel, responsive CSS, canvas-only ResizeObserver, viewport
export, save-dialog, and oversized-PNG checks pass. Existing output-log checks
retain request/render/save information and expected errors.

The opt-in MATLAB integration starts real processes for singleton/one-edge JSON,
Unicode paths, JSON/DOT/CSV exports, logs, actionable errors, cancellation, and
retry. Production MATLAB helpers are unchanged; their separate 13-test function
suite was last fully run in 0.3.8 and was not rerun for this UI/controller batch.

## Local evidence and diagnostic runs

Ignored artifacts under `.tools/validation/0.3.10/` include:

- `node-final.log`, `runner-summary.json`, process logs, and data exports.
- `native-final/visual-result.json`, vector/raster exports, pointer data,
  screenshots, and editor-managed MATLAB Viz logs: final visual outcome.
- `native-verified/clarity-result.json`, `clarity.log`, and `reference-result.json`.
- `native-verified/*-result.json` for the seven restoration/provider phases,
  expected view snapshots with banners/widths, and editor-managed output logs.

Earlier diagnostic results are retained but superseded by these named passing
results. Two test-only sequencing issues were corrected: visual cache seeding
must occur in a fresh profile before another phase activates the controller,
and banner assertions must wait for actual asynchronous webview delivery rather
than assume it has painted when a command returns. Native failure screenshots
helped distinguish delivery timing from a missing production banner.

## Boundaries

The banner restores with the same saved open graph tab. It is not durable global
history after closing/discarding that view; real logs remain the attempt record.
Refresh Displayed Graph uses the last successful graph's target, not a different
root whose attempted analysis failed. A result can remain viewable/exportable
after a failure; it is explicitly identified rather than silently refreshed.

Opening settings does not modify them, and changing settings requires a new
analysis. Old cached graphs need Refresh only to record their external policy;
the new labels/status UI do not themselves require MATLAB reanalysis. Native
checks are Windows/VSCodium only; other platforms and manual screen-reader
behavior are not claimed. Remaining analysis/Simulink limitations are listed in
the [acceptance record](ACCEPTANCE_TESTS.md).
