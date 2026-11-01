# MATLAB Viz 0.3.12 validation

Date: 2026-11-01. Windows, installed VSCodium, Node.js, MATLAB R2026b Update 1,
and licensed Simulink 26.2. Scope: view-only folder/package grouping, original
relationship conservation, grouped exports/state, and a lazy detached-tab focus
race discovered by regression tests. WEST source/model files were not changed
or analyzed afresh. Generated fixtures and isolated editor profiles remain ignored.

## Automated results

| Check | Result |
|---|---|
| TypeScript / ESLint / production build | Passed |
| Complete Node suite, real MATLAB enabled | All 111 passed; no failures/skips/cancellations; approximately 103 seconds |
| Deterministic Node coverage | 110 tests, including ten projection tests, nine new grouped-webview tests, and one detached-activation retry regression |
| MATLAB suite | All 23 passed; no failures/incomplete tests, including all nine licensed Simulink tests |
| MATLAB Code Analyzer | No findings in either production analyzer |
| Native grouping | Passed: original conservation, both modes/four layouts, individual/bulk expansion, package fixture, all five export formats |
| Native grouped restart | Passed: mixed expansion, aggregate details, positions, selection/filters, custom viewport |
| Native grouped Refresh/error | Passed with actual MATLAB: collapsed/expanded views retained; failure retains manually zoomed previous view |
| Existing native regressions | All nine passed: visual, clarity, seven call/reference/restart/Reload Window/provider-timeout phases |
| VSIX inspection | 16 entries, seven production asset/helper SHA-256 hashes match; no tests/profiles/generated models/logs/node_modules |
| Local installation | `daw-0.matlab-viz@0.3.12` verified; normal user windows left running |

The complete Node integration launches real MATLAB processes to check singleton
and one-edge JSON, Unicode paths, portable exports, logs, actionable errors,
cancellation and retry. No MATLAB backend source changed in this release, but
the full standalone/bridge/licensed-model suite was still rerun.

## Retained WEST snapshot

The existing snapshot contains 515 original nodes and 648 original directed
dependency records. It is used as read-only cached input, not claimed to be a
new analysis of the current repository.

| Projection | Displayed nodes | Displayed arrows | Represented cross-group records | Internal collapsed records |
|---|---:|---:|---:|---:|
| All folders collapsed | 93 | 153 | 461 | 187 |
| All groups expanded | 515 | 648 | Original individual links | 0 |

461 + 187 = 648. The difference between displayed arrows and cross-group records
is intentional aggregation of original edges with equal displayed endpoints.
Opposite aggregate directions curve apart; the grouped SVG has four quadratic
paths for two bidirectional pairs, with separate counts/hit targets. A dedicated
geometry test verifies different count positions, vector paths and export bounds.

Folder and package grouping initially take approximately 180/149 ms in the
retained final native run, including debugger round-trip overhead. This is one
local observation, not a performance guarantee. The snapshot has no distinct
package organization for this purpose, so package mode falls back to the same
93 folders; a separate controlled webview fixture verifies nested `+one/+two`,
private ownership and ordinary-folder fallback.

Both modes/all four layouts pass real Chromium rectangle overlap and Fit clipping
checks. Expand All restores every original node/edge. Actual menu/save dialogs
produce a parseable vector SVG with 93 nodes/153 arrowed edges, and a PNG decoding
at 8170 x 2054 pixels. JSON is exactly the original model; DOT/CSV retain all 648
original edges and no synthetic IDs. Source paths/relationship evidence are
auditable through grouped edge/member details.

## Pure and webview edge cases

- Directed, parallel-kind and internal/self relationships; partial/all expansion;
  mixed group-to-file endpoints; included/total membership and sum conservation.
- Innermost contiguous package qualification, package/private/class analysis
  roots, duplicate qualified names in different trees, external/root-prefix path
  separation, Windows case folding and POSIX case preservation.
- Collision-safe synthetic node/edge IDs, stable IDs through filtering/Refresh,
  original data immutability, Unicode/XML escaping and vector count labels.
- 5,000 original nodes projected to 50 groups/49 cross-group arrows with 4,950
  internal links; every one of the 4,999 original edges remains accounted for.
- Original-file hop depth in both trace directions (no aggregate shortcut),
  exact individual seeds while collapsed, group-wide seeds after explicit group
  selection, member-path search, missing/external/isolated visibility semantics.
- Keyboard/detail/bulk expansion, original-member inspection, stable captured
  rapid dragging/updated arrows/counts, per-mode positions, same-root Refresh
  layout/expansion, old/malformed saved states, aggregate detail restoration,
  grouped SVG and function/reference terminology.

## Findings during validation

An early grouped-error test expected a fitted view's exact transform to remain
unchanged when the failure banner reduced canvas height. Fitted views correctly
refit through ResizeObserver. The test now explicitly uses a manually zoomed
view and waits for actual setGraph delivery; that view's exact transform is
preserved. No production viewport behavior was weakened to satisfy the test.

The existing detached reference preparation failed intermittently because
`focusActiveEditorGroup` resolved before cross-window focus settled. The index
command then targeted a main-window source editor, while the graph tab remained
inactive in its auxiliary group. Local installed-editor command implementation
and retained tab/log evidence confirmed the index was correct, but focus timing
was not. Production code now retries the identified tab up to ten times with
100-ms settling intervals, stops on actual tab activation, never creates a
duplicate/moves its owning column, and logs an unsuccessful activation. A
deterministic delayed-focus regression and the complete native suite pass.

## Evidence on the development machine

Ignored artifacts under `.tools/validation/0.3.12/` include:

- `node-packaged.log`, `runner-packaged/`: final 111-test suite, runner summary,
  actual MATLAB logs and exported JSON/DOT/CSV.
- `matlab-final.log`, `matlab-results.csv`: final 23-test run and production
  Code Analyzer assertions.
- `native-grouping-release/`: grouping/restart/actual-Refresh result JSON, grouped
  SVG/PNG/JSON/DOT/CSV, screenshot, snapshot and isolated editor logs.
- `native-regression-verified/`: all nine passing old native phases, full/filtered
  SVG/PNG, pointer/divider/screenshot and restoration evidence.

Earlier runs remain retained, including the fitted-view test assertion and
detached-tab failure, and are superseded by the named final results above.

## Limits and handoff

See [GROUPING.md](GROUPING.md). This is a flat, physical folder/package view, not
nested compound containers, a MATLAB path resolver, block-level Simulink graph,
runtime dataflow analysis, or cycle explorer. Dense arrows may still cross.
SVG/PNG intentionally omit hidden member/internal-edge detail; data exports
remain complete and ungrouped. View state stays editor-local, not in graph JSON.

Existing [Simulink coverage limits](SIMULINK_VALIDATION.md), other-host/release
coverage gaps and the historical 694-edge snapshot discrepancy remain unchanged.
The existing missing-license package warning is not a new failure; public
Marketplace/Open VSX publishing remains on hold. Reload Window activates the
installed UI; grouping an already-cached graph does not require Refresh/MATLAB.
