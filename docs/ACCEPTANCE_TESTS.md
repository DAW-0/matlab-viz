# Acceptance findings

## Scope

Manual acceptance testing was performed with MATLAB Viz 0.3.4, VSCodium,
Windows, and MATLAB R2026b on 2026-10-30 and 2026-10-31. The main repository
baseline contained 515 files, 694 dependencies, and five expected notices
from intentionally incomplete samples/templates and third-party Java imports.
These counts are observations of that checkout, not universal expectations.

The isolated folder baseline was `offline-sim`: 14 files, 11 dependencies,
zero notices. A temporary MATLAB Project contained four functions and two
edges; a referenced Project added two external functions and one edge.

## Main workflows exercised

- Repository and selected-folder analysis; automatic and explicit backends.
- Search highlighting, details, file/symbol navigation, layouts, pan/zoom/Fit.
- Dependency/impact traversal and display depth; isolated/external filters.
- Refresh in detached windows; watchers, sidebar, and status-bar actions.
- JSON, DOT, CSV, SVG, and PNG exports. Data exports were independently
  compared by node identity, path, and directed edge.
- Function hierarchy, incoming/outgoing calls, depth changes, retained seeds.
- Function and variable references, grouped occurrence lines, retained anchors.
- File/node safety limits, total timeout, cancellation, and recovery.
- Explicit executable selection and cancelling its file picker.
- Standalone MATLAB digraph/tables and all nine artifact files, including MAT
  reloading and isolated-file exclusion.
- MATLAB Project detection, dependency edits, forced reanalysis, referenced
  Projects, external-node display, and agreement with the folder backend.
- Missing-file behavior and recovery after restoring the source file.

## First repair batch: 0.3.5

| Finding | Repair and regression coverage |
|---|---|
| A single edge/node serializes as an object and rejects a valid graph | MATLAB emits cell-backed JSON arrays; boundary validation also normalizes valid legacy scalar collections. Raw-wire and Node regressions cover empty/singleton collections. |
| A single missing-file notice does not have the expected collection shape | Project missing-file integration checks four nodes, one edge, one missing node, and one warning. |
| A folder with no edges fails while adding isolated nodes | Handle the empty unnamed MATLAB digraph before accessing its node-name column; singleton/zero-edge folder regressions. |
| Open error notifications block retry | Notification actions are asynchronous; controller regressions leave the notification open while retrying all three analysis types. |
| A failed folder attempt changes the previous graph's Refresh target | Only successful folder analyses replace the analysis context; controller regression checks the old target. |
| File-count and missing-project failures only show an exit code | Structured exception records retain MATLAB's identifier and message; real process tests inspect messages and full logs. |
| UTF-8 output is vulnerable to byte truncation/chunk boundaries | UTF-8 text JSON output and streaming decoders; real Unicode-path integration. |

## Pending repairs and coverage gaps

- Cache loading races the first Show command after activation.
- Detached webviews and function/reference Refresh context are not restored
  across reloads; viewport state is not persisted.
- Function references may return only the declaration, silently yielding a
  one-node graph. Reference tracing lacks the call hierarchy's syntax fallback.
- Selected-folder analysis adds only that folder to MATLAB's path. Known
  external repository dependencies are unresolved even when inclusion is on.
- Layouts can overlap nodes; some arrow endpoints reverse inside overlapping
  rectangles. Fit/zoom lower bounds prevent large graphs from fitting.
- Fast node dragging replaces the element holding pointer capture. Panning
  can clear selection and reset direction without updating depth-control state.
- Visual export reloads graph data and loses selection/filter scope. SVG/PNG
  capture the viewport, clip offscreen nodes, omit arrowhead styling, and have
  truncated labels; fixed PNG resolution makes dense labels unreadable.
- Export should remember its last successful destination and offer explicit
  viewport/filtered-graph framing and PNG resolution.
- Details need a resizable width; reference headings/counts and analysis-level
  external controls need clearer wording and placement.
- Standalone MATLAB-rendered labels can intersect edges or approach boundaries.
- A retained old graph should be clearly identified after a failed Refresh.
- A one-second provider-limit run completed normally; the actual per-request
  timeout path was not forced by the manual test.
- Simulink dependency counts differ from the historical snapshot; a fresh
  old/new comparison on the current checkout is identical (515 files, 648
  edges, five notices). The historical 694-edge discrepancy remains unexplained.
- Simulink model-parameter and add-on dependency options need dedicated fixtures.
- Cross-platform behavior and actual VSCodium notification/detached-window
  placement need suitable hosts. The 0.3.5 isolated VSCodium harness now covers
  actual notification retry behavior on Windows.

## Host checks after the first repair batch

Automated tests cover the data and controller logic. The isolated real-editor
harness also exercises retries with untouched notifications, cache retention,
and missing Project file data through actual commands. Only purely visual
checks, such as detached-window placement and red missing-node styling, need
human inspection when those presentation paths change. No repository-wide
four-minute manual scan is needed for the first repair batch.

See [0.3.5 validation](VALIDATION_0.3.5.md) for automated results and local
artifact locations.
