# MATLAB Viz

MATLAB Viz is a MATLAB-first dependency explorer for VS Code and VSCodium. It runs MATLAB's documented dependency-analysis APIs locally, converts the results into a portable graph model, and presents that model as an interactive dependency and impact graph.

> **Development status:** `0.3.8` is a working development build. MATLAB Project and folder backends are exercised by automated MATLAB tests and repository acceptance tests. Function call-hierarchy and symbol-reference graphs use the installed MATLAB language service and a conservative MATLAB syntax fallback. See the [acceptance findings](docs/ACCEPTANCE_TESTS.md) for known limitations and pending repairs.

## Why MATLAB Viz?

General-purpose code-graph extensions usually depend on the Language Server Protocol call-hierarchy API. The MATLAB language server does not currently provide the call hierarchy needed by those extensions. MATLAB Viz uses MATLAB itself instead:

- MATLAB Projects: `updateDependencies(project)` followed by `project.Dependencies`
- Ordinary folders: `matlab.codetools.requiredFilesAndProducts(file,"toponly")`

The Project backend is the programmatic form of MATLAB's built-in Dependency Analyzer graph. The folder backend provides direct MATLAB-code dependencies when the selected folder is not a MATLAB Project.

## Current functionality

- Analyze an entire workspace or a selected file's/folder's containing folder.
- Automatically select MATLAB Project or folder analysis.
- Display MATLAB, Live Script, App Designer, protected-code, and Simulink files.
- Interactive SVG graph with pan, zoom, fit, node dragging, and four layouts.
- Double-click a node to open it in the editor.
- Search by file name, relative path, or full path.
- Trace dependencies or impact from a selected file to a configurable depth.
- Include or hide external and isolated files.
- Identify missing files and per-file analysis warnings.
- List required MathWorks products discovered by folder analysis.
- Export the graph as JSON, Graphviz DOT, CSV, SVG, or PNG.
- Optional automatic refresh when supported files change.
- Persistent last-graph cache, restored graph views/Refresh targets, and a dedicated MATLAB Viz output log.
- Cancellable MATLAB analysis process.
- Build a caller-and-callee graph for the MATLAB function under the cursor.
- Trace only callers or only callees to a configurable depth.
- Trace function or variable references and group each reference by its containing function or file.
- Navigate directly from a function or symbol node to its source location.
- Run the folder analyzer directly from MATLAB and receive a `digraph` report.
- Write standalone node, edge, product, problem, DOT, MAT, SVG, and PNG artifacts.

## Requirements

- VS Code or VSCodium 1.95 or newer
- MATLAB available locally
- MATLAB R2019a or newer for Project dependency APIs; newer releases expose more Dependency Analyzer options
- Node.js LTS only for developing or packaging MATLAB Viz

File dependency graphs do not require the MATLAB language server. Function and symbol graphs require a MATLAB language extension that supplies Definition and References results in VSCodium. Your source code and dependency graph stay on your machine.

## Run from source

```powershell
git clone https://github.com/DAW-0/matlab-viz.git
cd matlab-viz
npm install
npm run check
npm run build
```

Open the folder in VSCodium and press `F5` to start an Extension Development Host. In that window, open a MATLAB repository and run **MATLAB Viz: Analyze Workspace**.

To create an installable package:

```powershell
npm run package
codium --install-extension matlab-viz-0.3.8.vsix
```

## Standalone MATLAB API

The same folder analyzer used by the extension is available without VS Code or VSCodium:

```matlab
addpath("matlab")

report = analyzeMatlabFileDependencies(sourceRoot, ...
    OutputDirectory=outputDirectory);
```

`report.graph` is a MATLAB `digraph`; `report.nodes`, `report.edges`,
`report.products`, and `report.problems` are tables. The output directory
contains CSV tables, Graphviz DOT, a complete MAT report, and MATLAB-rendered
SVG and PNG graphs. See the [standalone analyzer guide](matlab/README.md) for
all options and examples.

## Commands

| Command | Purpose |
|---|---|
| `MATLAB Viz: Analyze Workspace` | Analyze a selected workspace root. |
| `MATLAB Viz: Analyze Selected File or Folder` | Analyze a folder, or the containing folder of a selected file. |
| `MATLAB Viz: Refresh Dependency Graph` | Rerun the previous analysis. |
| `MATLAB Viz: Show Dependency Graph` | Reopen the current interactive graph. |
| `MATLAB Viz: Export Graph` | Export JSON, DOT, CSV, SVG, or PNG. |
| `MATLAB Viz: Configure MATLAB Executable` | Select the MATLAB executable explicitly. |
| `MATLAB Viz: Show Logs` | Open the MATLAB process and analysis log. |
| `MATLAB Viz: Show Function Call Hierarchy` | Show callers and callees for the function at the cursor. |
| `MATLAB Viz: Show Callers` | Trace functions that call the function at the cursor. |
| `MATLAB Viz: Show Callees` | Trace functions called by the function at the cursor. |
| `MATLAB Viz: Trace Symbol References` | Trace references to the selected function or variable. |

## Important settings

| Setting | Default | Meaning |
|---|---:|---|
| `matlabViz.matlabExecutable` | auto | Absolute path to MATLAB. |
| `matlabViz.analysisMode` | `auto` | `auto`, `project`, or `folder`. |
| `matlabViz.includeExternal` | `false` | Include dependencies outside the selected root. |
| `matlabViz.includeIsolated` | `true` | Include files without detected in-scope edges. |
| `matlabViz.folder.useWorkspacePath` | `true` | Use the containing workspace tree to resolve dependencies of a selected folder. |
| `matlabViz.folder.additionalSearchRoots` | `[]` | Additional folder-backend lookup trees; relative paths use the containing workspace, or selected root outside a workspace. |
| `matlabViz.watchFiles` | `false` | Refresh after supported files change. |
| `matlabViz.project.reanalyzeAll` | `false` | Force a complete Project Dependency Analyzer refresh. |
| `matlabViz.project.analyzeReferences` | `true` | Include referenced projects. |
| `matlabViz.project.analyzeAddOns` | `false` | Analyze inside add-ons. |
| `matlabViz.project.analyzeModelParameters` | `false` | Analyze MATLAB code in Simulink model parameters. |
| `matlabViz.maximumFiles` | `5000` | Safety limit for a single folder analysis. |
| `matlabViz.symbols.maximumDepth` | `3` | Caller/callee traversal depth. |
| `matlabViz.symbols.maximumNodes` | `250` | Safety limit for function and reference graphs. |
| `matlabViz.symbols.requestTimeoutSeconds` | `20` | Maximum wait for one language-service request. |
| `matlabViz.symbols.analysisTimeoutSeconds` | `180` | Maximum duration of a complete symbol analysis. |

For selected-folder analysis, lookup roots help MATLAB resolve sibling functions;
they do not turn those siblings into analyzed source files or increase the
selected-source `maximumFiles` count. The selected tree takes path precedence.
Set `matlabViz.includeExternal` to `true` to include resolved dependencies outside
the selected root, then rerun analysis/Refresh. The toolbar's **External** checkbox
only hides or shows external nodes already in the result. Lookup roots are logged
and recorded in folder graph metadata; Project analysis uses its own project path.
Outside an open workspace no unrelated parent directory is searched implicitly.
For large workspaces, disable workspace lookup and specify smaller additional
roots. MATLAB's original path is restored after standalone analysis, including
errors. See [SearchRoots](matlab/README.md#lookup-roots-and-analysis-scope).

For a function hierarchy, the graph toolbar's **Depth** value controls the
visible trace and is also used as the analysis depth when **Refresh** is
pressed. Refresh reuses the original function even while the graph webview has
focus. The MATLAB Viz output log reports each traversal step and any provider
timeouts.

When a graph tab is left open, Reload Window and application restarts restore
its layout, selection/details, filters, node positions, and custom viewport.
Refresh also retains the original function/direction/depth or reference anchor,
regardless of the current source cursor. Detached placement is retained when
the editor restores its auxiliary windows. Older call graphs that lack a saved
direction remain viewable; run the desired function command once before using
Refresh on those graphs.

For a file-dependency graph, **Trace depth** is a client-side display filter
used after selecting a file and choosing **Dependencies** or **Impact**. It
does not change the repository analysis scope and is disabled while
**Entire graph** is selected. MATLAB diagnostics do not invalidate a completed
graph; use the graph toolbar's **Notices** button to inspect them and open the
affected source files.

## Layout, navigation, and visual exports

All layouts account for the full wrapped label dimensions. Hierarchical layout
groups cycles into the same rank; Force uses a hierarchical fallback above 350
nodes to bound computation. Fit includes every visible node and self-loop,
even on a large graph. Seeing all 515 files at once naturally makes labels
small on screen; zoom in or use a vector export to read them.

Dragging updates nodes in place. Panning background space retains the selected
node and trace; a stationary background click clears the selection. Changing
direction, trace depth, or visibility filters relayouts the visible nodes;
choose a layout again to undo manually overlapping positions. Saved views from
older builds get new positions/Fit once while retaining their controls and
selection. No MATLAB reanalysis is required for that geometry migration.

The Export menu distinguishes complete data from visual output:

- Data exports do not apply display filters: JSON contains the complete model,
  DOT includes all nodes/edges, and CSV contains the dependency-edge table.
- SVG and PNG offer **Filtered graph** (the default framing choice) or
  **Current viewport**. Filtered graph includes offscreen nodes allowed by the
  current dependency/impact, external, and isolated filters. Search only dims
  nonmatching nodes; it does not exclude them from export.
- SVG contains real, zoomable text/shapes and explicit arrowheads with full
  labels. It does not embed a screenshot and does not depend on editor CSS.
- PNG offers 1×, 2×, or 4× pixel resolution. These scales correspond to the
  exported graph's native dimensions, not its current on-screen zoom. Maximum
  output is 32 megapixels and 16,384 pixels per side. If a graph exceeds those
  bounds, choose SVG, a lower scale, or a smaller/compact filtered layout.
  The extension reports the requested dimensions instead of silently blurring
  or returning a blank image.
- Successful saves remember their directory across formats and sessions.
  Cancelling or failing a save does not replace that preference. The MATLAB
  Viz log records framing/resolution requests, rendered counts/dimensions,
  successful filenames/byte counts, and export errors.

Large or dense graphs can still have crossing edges. Automatic layouts avoid
node overlap, not every possible edge crossing; manually dragged nodes may
intentionally overlap. The standalone MATLAB renderer is separate from these
webview export improvements.

## Graph semantics

An arrow `A → B` means that **A depends on B**. Consequently:

- **Dependencies** traversal follows arrows forward.
- **Impact** traversal follows arrows backward to files that may be affected by a change.

The graph represents static dependencies, not execution order. Dynamic file names, `eval`, runtime dispatch, and dependency injection can be invisible to static analysis.

For function graphs, `caller → callee` means the source function calls the target function. For reference graphs, `container → symbol` means a function or file contains one or more references to the selected symbol. Reference graphs identify locations; they do not claim to reconstruct runtime values or complete data flow.

Function references supplement empty or partial language-provider results with
conservative syntax matches, including calls, handles, and simple command form.
Edge details show grouped lines and evidence. Declarations are not usages;
recursive calls can produce self-edges. Ambiguous names are reported rather than
connected indiscriminately. Variables still require language-provider references.
Syntax matches are inferences to review, not proof of runtime resolution, and an
empty graph is not proof that a symbol is unused. See the
[symbol-analysis limitations](docs/SYMBOL_ANALYSIS.md#limitations).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Dependency analysis](docs/DEPENDENCY_ANALYSIS.md)
- [Function and symbol analysis](docs/SYMBOL_ANALYSIS.md)
- [Standalone MATLAB analyzer](matlab/README.md)
- [Development and testing](docs/DEVELOPMENT.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## Privacy

MATLAB Viz starts the local MATLAB executable, reads the resulting JSON file, and renders it locally. It does not upload source files, paths, graphs, or telemetry.

## License

A distribution license has intentionally not yet been selected. Choose one before making the GitHub repository public or publishing a VSIX.
