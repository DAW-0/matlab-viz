# MATLAB Viz 0.3.13 validation

Date: 2026-11-01. Windows, installed VSCodium, Node.js and MATLAB R2026b.
Scope: fix disconnected-group relocation and cumulative repeated Collapse All
drift, without changing MATLAB analysis, graph data, grouping identities or schema.

## Cause and repair

Group expansion/collapse previously called `render(true)` and Fit, even when a
bulk click changed nothing. That reapplied the global layout. Disconnected
members were assigned new global positions, while repeated Force passes resumed
repulsion from previous positions and progressively spread summaries apart.

The new transition path compares expansion sets before doing any work. Repeated
Collapse All/Expand All are exact no-ops, preserving positions, viewport and node
DOM. Changed transitions place only newly visible nodes; unrelated nodes stay
fixed. Expansion uses a compact block near the summary, with bounded deterministic
collision avoidance. A bounded horizontal candidate search plus merged vertical
obstacle intervals avoids an unbounded relaxation loop. The revealed block is
focused, including its internal links. Collapse restores the last summary anchor,
with a member-center fallback for old saved views and a free-slot fallback for
an occupied anchor. It only adjusts the viewport if needed to keep the summary
visible. Member inspection uses the same local transition path.

## Results

| Check | Result |
|---|---|
| TypeScript / ESLint / build | Passed |
| Complete Node suite, real MATLAB enabled | All 117 passed, no failures/skips/cancellations; approximately 104 seconds |
| New deterministic regressions | Six passed: crowded/free cluster placement, repeated bulk no-ops, all-layout isolated expansion, 20 expand/collapse cycles, inspection/individual collapse |
| Native grouping phase | Passed: both modes/four layouts, 515-file snapshot conservation, package fixture, five exports, new disconnected reproductions |
| Native grouped restart | Passed: mixed expansion, aggregate details, positions, custom viewport |
| Native grouped MATLAB Refresh/error | Passed: collapsed/expanded state retained and failed analysis preserves the previous custom view |
| Existing native regressions | All nine passed: visual, clarity, seven call/reference/restart/Reload Window/provider-timeout phases |
| VSIX | 16 entries; seven production/helper hashes match; no tests, profiles, generated models, logs or node_modules |
| Installation | `daw-0.matlab-viz@0.3.13` verified; normal editor windows left running |

Native disconnected fixtures have twelve nodes, four groups and zero edges.
For each of Force, Grid, Hierarchical and Circle, twenty repeated Collapse All
clicks preserve exact positions/viewport and the same connected DOM nodes.
Individual expansion leaves all unrelated summary transforms unchanged and puts
all three members inside the actual Chromium SVG viewport. Collapse restores
the original summary anchors. Twenty repeated Expand All clicks are also no-ops.

The deterministic suite additionally runs twenty expand/collapse cycles and
checks summary positions after every cycle, plus crowded placement against 200
stationary rectangles. All old Node tests still run. The real-MATLAB runner
checks actual JSON/export/log/error/cancellation/retry behavior, not mocks alone.

The retained WEST snapshot still has 515 files, 648 original dependencies, 93
collapsed folder groups, 461 original cross-group records and 187 internal links.
The real editor exercises SVG/PNG and complete JSON/DOT/CSV exports, original
data retention, source navigation/pointers, details resizing and saved views.
No fresh WEST analysis, source edits or model loading was needed. Existing WEST
worktree changes were left alone.

## Evidence

Ignored artifacts are retained under `.tools/validation/0.3.13/`:

- `node-final.log`, `runner/`: final 117-test result and actual MATLAB process
  logs, runner summary, JSON/DOT/CSV exports and recovery checks.
- `native-grouping/`: grouping/restart/Refresh result JSON, isolated-case
  observations, grouped SVG/PNG/JSON/DOT/CSV, screenshot, saved view and editor logs.
- `native-regression/`: all nine passing existing phases, vector/raster exports,
  pointer/divider checks, screenshots and detached/Reload Window evidence.

MATLAB/backend sources are byte-unchanged in this release. The separate 23-test
standalone/licensed Simulink suite was not rerun for this UI-only patch; its last
complete run is recorded in [0.3.12 validation](VALIDATION_0.3.12.md).

## Handoff and limits

The [grouping guide](GROUPING.md) now distinguishes explicit global layouts from
local expansion. Local block placement can shift beside a crowded summary rather
than occupying its exact former footprint. Manual member layouts are retained
while expanded but are repacked after collapse/re-expansion. No recursive
compound containers or optimal global packing are claimed.

Reload Window activates 0.3.13 without MATLAB reanalysis. Saved/manual positions
are not erased by updating: if an older build already spread the overview out,
choose a layout once to tidy it, then use the repaired transitions. Publishing
remains on hold; the existing missing-license packaging warning is unchanged.
