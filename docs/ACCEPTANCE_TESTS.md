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

## Second repair batch: 0.3.6

- Commands wait for initial cache loading; malformed caches are logged without blocking a fresh analysis.
- Editor-owned webviews are restored using a serializer, retaining their detached placement and saved view state.
- Function/reference caches retain the original Refresh context across restarts, including outgoing/incoming direction and hierarchy depth.
- Legacy call graphs without saved direction cannot accidentally Refresh as repository graphs; they require one fresh function command.
- Show and visual export no longer reset the unchanged graph's selection/filter scope. Other visual-export defects below remain open.
- Local cache replacement is atomic, and failed saves preserve the previous disk cache.

See [0.3.6 validation](VALIDATION_0.3.6.md) for the isolated-editor and regression results.

## Third repair batch: 0.3.7

- Layouts use measured, wrapped labels; automatic positions avoid rectangle overlap. Hierarchical ranks handle cycles, and Fit includes actual node/self-loop bounds without the old lower zoom clamp.
- Arrow endpoints intersect the actual rectangles, and SVG/PNG preserve full labels and explicit arrowheads.
- Stable SVG pointer capture, capture recovery, in-place drag updates, and gesture-aware clicking preserve the selected trace while panning.
- Visual export defaults to all filtered nodes, including offscreen nodes; viewport framing is explicit. PNG resolution is selectable with reported safety limits.
- Export destinations persist across formats/sessions, with cancellation/failure regressions and actual output-log checks.
- Old geometry is recalculated once on upgrade, retaining selection and controls. Hidden-tab restoration identifies editor groups by column rather than wrapper-object identity.

See [0.3.7 validation](VALIDATION_0.3.7.md) for the real-renderer, mouse, export, and regression evidence.

## Fourth repair batch: 0.3.8

- Function reference tracing merges conservative syntax matches with partial,
  empty, or declaration-only providers. Edge details retain occurrence lines and
  evidence. Ambiguity, incomplete indexing, provider errors, and zero-usage
  uncertainty are explicit; variables remain provider-scoped.
- Folder analysis uses optional workspace/explicit lookup roots without
  expanding the analyzed source tree. WEST `offline-sim` changes from 14 nodes /
  11 edges to 27 nodes / 26 edges with workspace lookup and external inclusion;
  external exclusion retains the original 14 / 11 scope.
- Read-only actual-source checks recover `replay_heating_control.m` line 134
  under a declaration-only provider and retain the variable occurrence lines.
  Source bytes are unchanged. All eight existing native regression phases were
  repeated, plus two accuracy phases.

See [0.3.8 validation](VALIDATION_0.3.8.md) for evidence and exact test scope.

## Fifth repair batch: 0.3.9

- The details panel has a focusable resize divider, pointer capture, keyboard
  steps/limits/reset, and wrapped long text. The preferred width is per-view
  state, independent of the currently analyzed graph.
- Displayed width is temporarily clamped to preserve graph space; the compact
  view still hides the panel below its existing breakpoint. Automatic Fit follows
  canvas size changes without clearing selection/trace or changing node positions.
- Sizing, persistence, and pointer logic are commented in the implementation.
  See [0.3.9 validation](VALIDATION_0.3.9.md) for test evidence and limitations.

## Sixth repair batch: 0.3.10

- Failed/cancelled attempts identify the previous graph without changing its
  model, cache, selection, or saved analysis target. The notice restores with the
  same open graph tab and clears after successful analysis.
- Graph-specific details distinguish file dependencies, function calls, and
  grouped reference links; distinct-neighbor counts do not imply raw occurrence
  counts. Sidebar counts and notices use consistent terminology.
- External analysis policy is recorded for each new extension result and shown
  separately from the visibility checkbox. Settings navigation does not itself
  change settings or run analysis; legacy policy is explicitly unknown.

See [0.3.10 validation](VALIDATION_0.3.10.md) for the test evidence.

## Seventh repair batch: 0.3.11

- Nine generated-model tests compare Project results against native MATLAB
  digraph endpoints and exercise model references, library/callback/dictionary
  links, parameter-code off/on, MDL, subsystem references, scope, missing-file
  recovery, immutable source bytes, and standalone report artifacts.
- Folder mode's silent Simulink gap is repaired with saved direct-reference
  metadata and explicit partial-scope warnings. It does not claim the broader
  Project results or substitute a transitive requirement list for direct edges.
- A native VSCodium phase verifies the model workflow through actual commands;
  binary model/dictionary navigation now delegates to the editor's handler.

See the [Simulink scope guide](SIMULINK_VALIDATION.md) and
[0.3.11 validation](VALIDATION_0.3.11.md) for coverage boundaries and evidence.

## Pending repairs and coverage gaps

- Static reference inference does not fully model nested scopes, imports,
  dynamic loading/dispatch, or runtime MATLAB path order. Ambiguous matches may
  be omitted; inferred matches need review rather than implying completeness.
- Reference Refresh anchors store source positions, not tracked edit locations.
  Start a fresh trace if edits have moved the original symbol.
- Dense graphs still have crossing edges. Manually dragged nodes may overlap;
  choosing a layout again restores automatic spacing. Very large graphs should
  use vector SVG rather than an impractically large raster image.
- Standalone MATLAB-rendered labels can intersect edges or approach boundaries.
- Simulink dependency counts differ from the historical snapshot; a fresh
  old/new comparison on the current checkout is identical (515 files, 648
  edges, five notices). The historical 694-edge discrepancy remains unexplained.
- Real installed add-on discovery still needs a controlled fixture. The option
  passthrough is tested, not third-party add-on internals. Protected models,
  variants/masks, Stateflow, specialized blocks, and dictionary hierarchies also
  need additional model fixtures; see the Simulink guide.
- Cross-platform behavior still needs suitable hosts. Isolated VSCodium tests
  now cover actual notification retries and detached-window restoration on Windows.

## Host checks after the first repair batch

Automated tests cover the data and controller logic. The isolated real-editor
harness also exercises retries with untouched notifications, cache retention,
and missing Project file data through actual commands. The 0.3.6 suite also
checks detached-window placement and restoration using the actual webview DOM.
Purely visual details not covered by assertions, such as red missing-node
styling, still need suitable visual checks when those paths change. No
repository-wide four-minute manual scan was needed for either repair batch.

See [0.3.5 validation](VALIDATION_0.3.5.md) for automated results and local
artifact locations.
