# Architecture

MATLAB Viz is deliberately split into three boundaries so that MATLAB analysis, editor integration, and graph rendering can evolve independently.

```text
VS Code/VSCodium extension host
  ├─ command and configuration controller
  ├─ MATLAB process runner
  ├─ graph persistence and exporters
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

## MATLAB bridge

`matlab/MatlabVizAnalyze.m` is the only MATLAB entry point. It emits the versioned model described below. It restores the MATLAB path and current folder after analysis.

Project analysis uses the Project object's dependency graph. Folder analysis calls `requiredFilesAndProducts(...,"toponly")` once per supported source file, which is necessary to preserve direct edges.

## Graph model

The JSON document contains:

- `metadata`: schema version, root, analysis mode, MATLAB version, timestamp, duration, and counts.
- `nodes`: stable path-based IDs and display metadata.
- `edges`: directed source-to-required-file relationships.
- `products`: MathWorks product references and their introducing files.
- `problems`: missing files and nonfatal per-file analysis failures.

The model is intentionally independent of SVG and VS Code. Future clients can consume the same JSON without starting the extension.

## Webview security

The webview has a restrictive content security policy. It loads only extension-owned resources and uses a per-view nonce. User-controlled labels and paths are assigned through `textContent`; they are never inserted as HTML.

## Data lifecycle

MATLAB input/output files are created below the operating-system temporary directory and deleted after each process exits. The most recent successful graph is cached in VS Code's extension storage to make reopening instantaneous. No data is sent over the network.
