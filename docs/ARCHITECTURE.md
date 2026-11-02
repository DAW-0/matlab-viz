# Architecture

MATLAB Viz is deliberately split into three boundaries so that MATLAB analysis, editor integration, and graph rendering can evolve independently.

```text
VS Code/VSCodium extension host
  ├─ command and configuration controller
  ├─ MATLAB process runner
  ├─ graph persistence and exporters
  ├─ function and symbol analyzer
  └─ webview bridge
            │ JSON messages
            ▼
Interactive SVG webview
            ▲
            │ graph JSON
            │
Local MATLAB batch process
  ├─ Project Dependency Analyzer backend
  └─ folder requiredFilesAndProducts backend
```

## Extension host

`src/extension.ts` owns command registration, analysis lifecycle, progress, cancellation, file watching, caching, and the activity-bar summary.

`src/matlabRunner.ts` locates MATLAB, writes analysis options to a temporary JSON file, launches MATLAB with `-batch`, validates the returned graph document, and removes temporary files.

`src/graphPanel.ts` owns the editor webview, source-file navigation, and exports. Pure portable exporters live under `src/core` so they can be unit tested without the VS Code runtime.

`src/symbolAnalyzer.ts` builds function and reference graphs from the active editor. It queries the editor's Document Symbols, Definition, and References providers. `src/core/matlabSyntax.ts` supplies conservative MATLAB declaration and call-site discovery when symbol ranges are unavailable or incomplete.

## MATLAB bridge

`matlab/analyzeMatlabFileDependencies.m` is the public, editor-independent
folder-analysis API. It returns a MATLAB `digraph` and report tables and can
write CSV, DOT, MAT, SVG, and PNG artifacts.

`matlab/MatlabVizAnalyze.m` is the extension bridge. Project mode exports the
MATLAB Project dependency graph directly. Folder mode calls
`analyzeMatlabFileDependencies` and converts that shared report into the
versioned JSON model described below. Both entry points restore temporary
MATLAB path and current-folder changes.

Project analysis uses the Project object's dependency graph. The shared folder
analyzer calls `requiredFilesAndProducts(...,"toponly")` once per supported
MATLAB program file to preserve direct edges. Saved Simulink model/subsystem
references use `Simulink.MDLInfo` instead, with explicit partial-scope warnings;
see the [model-analysis guide](SIMULINK_VALIDATION.md).

## Graph model

The JSON document contains:

- `metadata`: schema version, root, graph type, analysis mode, MATLAB version, timestamp, duration, and counts.
- `nodes`: stable native IDs and display metadata, with optional source positions for symbol nodes. Project results can also contain `unresolved: true` names: their `path` is native evidence text, not a filesystem location. Their compatibility booleans `external`/`missing` are false because neither location nor absence is established; consumers must inspect `unresolved` first.
- `edges`: directed source-to-required-file relationships.
- `products`: MathWorks product references and their introducing files.
- `problems`: missing files, unresolved native names, and nonfatal per-file analysis failures.

Unresolved Project names and their edges are retained even when resolved external
files are excluded; unknown location is not proof of external scope. They remain
ungrouped because no physical folder/package owner is established. Source
navigation requires an absolute path and rejects nodes marked unresolved,
including a defensive host-side check independent of the webview's disabled
Open button. Mixed Project summaries say files/names and count unresolved names
separately. Existing absolute missing paths retain `missing: true` and their
original warning/navigation behavior. Refresh legacy Project caches to regenerate
these distinctions; no path is inferred from the extension host working folder.

The model is intentionally independent of SVG and VS Code. Future clients can consume the same JSON without starting the extension.

## Webview grouping

`media/graphGrouping.js` is a DOM-free, deterministic view projection shared by
renderer and tests. It partitions original nodes by physical folder/package,
maps collapsed members to collision-safe synthetic IDs, and aggregates original
directed edges without mutating them. Internal collapsed links are counted, not
discarded from analysis. Filtering/tracing use the original graph before
projection; tracing a group is a multi-source original-graph search. Layout,
dragging and SVG/PNG geometry use the displayed projection. Host JSON/DOT/CSV
exporters never receive it and keep the complete analyzer graph.

Grouping/expansion and per-mode positions are version-1 webview preferences,
not new graph-schema fields. Older saved views default to no grouping. Same-root
Refresh preserves grouping/expansion; another root/type resets them. See the
[grouping guide](GROUPING.md) for exact membership/count/persistence boundaries.

## Webview cycle analysis

`media/graphCycles.js` performs original-graph cyclic SCC discovery independently
of geometry/grouping. Iterative forward/reverse traversals avoid call-stack
limits; each component retains original members/internal edges and a directed
witness, not an enumeration of simple cycles. Component identity uses its
smallest original node ID, unique across disjoint components. Detection is cached
per analyzed result, before all view filters. The renderer maps original cycle
membership onto displayed group nodes/edges; it never analyzes aggregate arrows.

Cycle mode/selection/member page are additive version-1 webview preferences.
Isolation filters original members/internal edges, clears tracing, and expands
their displayed owners. Visibility settings remain respected. Same-result
restoration retains the view; a new result recomputes/reset selection rather than
silently reusing a changed SCC. SVG/PNG receive projected cycle markings;
portable host exporters still receive only the original graph. See
[cycle semantics](CYCLES.md) for partial visibility and reference/recursion limits.

Isolation uses a separate per-grouping coordinate bank (`cyclePositions`, with
`cyclePositionVersion: 1`) from overview `groupPositions`. Geometry finds the
visible projection's undirected islands only for placement, runs the selected
layout with fresh local seeds, and shelf-packs each full bounds rectangle,
including self-loop curves. It does not change the original SCC classification.
This avoids repository-scale inherited gaps and disconnected Force drift. Old
isolated saved views migrate once; current views retain dragged positions/custom
zoom across reload. Leaving isolation keeps known overview coordinates and
places any newly expanded members locally instead of globally re-laying out.

## Entry-point reports

Entry-point reports are built by `src/core/entryPointReport.ts` in the host from
the original file graph. Iterative BFS records minimum hops and original edges;
exact path/name indexes classify every notice/product without runtime claims.
The webview sends only the original seed ID and analysis identity. Host-derived
data is displayed using textContent and exported as Markdown/JSON; no
webview-supplied subgraph is trusted. Stale requests/responses are rejected.
Saved state retains only report selection; a new analysis clears it. See
[entry-point reports](ENTRY_POINT_REPORTS.md) for scope/coverage semantics.

Report-scope projection is a separate reversible renderer transaction. A scope
holds an original seed and an allowed-ID set derived through unbounded outgoing
traversal, plus one detached ordinary-view snapshot. It uses fresh coordinate
banks and original members; conflicting filters are paused rather than combined.
Saved state stores only the seed and ordinary-view backup, never authoritative
membership IDs or nested history. Restoration validates the seed and analysis
identity before recomputing membership; Return validates/restores the ordinary
snapshot while keeping the latest analysis-attempt status. New analysis clears
the transaction. Only visual exporters see the projected scope.

A dependency path is a secondary highlight inside that scope, not another
projection. The webview sends the seed/target IDs and a request ID; the host
rebuilds the report and walks its BFS predecessor chain, returning only original
node/link records. The renderer highlights those exact IDs while retaining all
scoped members and coordinates. Saved state stores only the target ID, and a
restored panel asks the host to rebuild its route. Clearing, changing scope or
loading a new analysis invalidates pending responses. SVG/PNG include the
highlight; graph-data and report exports remain unchanged.

Impact reports share the evidence classifier, Markdown serializer and iterative
traversal engine with entry-point reports, but index adjacency by original edge
target instead of source. The public impact document has its own `file-impact`
kind and `selectedFile`, not a mislabeled execution entry point. Counts exclude
the selected file from direct/total dependents, including in cycles. Incoming
predecessor links lead from each dependent toward the selected file; impact path
reconstruction therefore keeps that chain order while preserving original arrows.
Scope direction is explicit in saved state and reply dispatch, so same-seed
opposite-direction reports cannot collide. See [impact reports](IMPACT_REPORTS.md).

Analysis comparison lives in `src/core/analysisComparison.ts`. It validates and
detaches complete file graphs, indexes established paths/native names rather than
volatile analyzer IDs, groups relationships by original endpoints/kind, and uses
multisets for notice/product evidence. Recorded coverage differences are separate
from graph deltas; source contents and runtime behavior are never inferred.
Dependency/impact scopes are computed independently on each original graph, and
an absent baseline seed is explicitly unavailable rather than an empty scope.

The panel owns baseline URI preferences and displayed comparison snapshots.
Baseline files are versioned, local and size-limited; they never replace the active
graph. Exports reference a host-held snapshot ID, not renderer-supplied records.
Async dialog/read identity guards prevent adoption or replies after a newer graph
arrives. Saved view state carries only selection/scope instructions; restart reads
the chosen file and rebuilds the report. See [analysis comparison](ANALYSIS_COMPARISON.md).

## Webview security

The webview has a restrictive content security policy. It loads only extension-owned resources and uses a per-view nonce. User-controlled labels and paths are assigned through `textContent`; they are never inserted as HTML.

## Data lifecycle

MATLAB input/output files are created below the operating-system temporary directory and deleted after each process exits. The most recent successful graph is cached in VS Code's extension storage to make reopening instantaneous. No data is sent over the network.
