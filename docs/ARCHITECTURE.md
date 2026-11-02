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
- `nodes`: stable path-based IDs and display metadata, with optional source positions for symbol nodes.
- `edges`: directed source-to-required-file relationships.
- `products`: MathWorks product references and their introducing files.
- `problems`: missing files and nonfatal per-file analysis failures.

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

## Webview security

The webview has a restrictive content security policy. It loads only extension-owned resources and uses a per-view nonce. User-controlled labels and paths are assigned through `textContent`; they are never inserted as HTML.

## Data lifecycle

MATLAB input/output files are created below the operating-system temporary directory and deleted after each process exits. The most recent successful graph is cached in VS Code's extension storage to make reopening instantaneous. No data is sent over the network.
