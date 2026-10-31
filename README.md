# MATLAB Viz

MATLAB Viz is a MATLAB-first dependency explorer for VS Code and VSCodium. It runs MATLAB's documented dependency-analysis APIs locally, converts the results into a portable graph model, and presents that model as an interactive dependency and impact graph.

> **Development status:** `0.3.5` is a working development build. MATLAB Project and folder backends are exercised by automated MATLAB tests and repository acceptance tests. Function call-hierarchy and symbol-reference graphs use the installed MATLAB language service and a conservative MATLAB syntax fallback. See the [acceptance findings](docs/ACCEPTANCE_TESTS.md) for known limitations and pending repairs.

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
- Persistent last-graph cache and a dedicated MATLAB Viz output log.
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
codium --install-extension matlab-viz-0.3.5.vsix
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

For a function hierarchy, the graph toolbar's **Depth** value controls the
visible trace and is also used as the analysis depth when **Refresh** is
pressed. Refresh reuses the original function even while the graph webview has
focus. The MATLAB Viz output log reports each traversal step and any provider
timeouts.

For a file-dependency graph, **Trace depth** is a client-side display filter
used after selecting a file and choosing **Dependencies** or **Impact**. It
does not change the repository analysis scope and is disabled while
**Entire graph** is selected. MATLAB diagnostics do not invalidate a completed
graph; use the graph toolbar's **Notices** button to inspect them and open the
affected source files.

## Graph semantics

An arrow `A → B` means that **A depends on B**. Consequently:

- **Dependencies** traversal follows arrows forward.
- **Impact** traversal follows arrows backward to files that may be affected by a change.

The graph represents static dependencies, not execution order. Dynamic file names, `eval`, runtime dispatch, and dependency injection can be invisible to static analysis.

For function graphs, `caller → callee` means the source function calls the target function. For reference graphs, `container → symbol` means a function or file contains one or more references to the selected symbol. Reference graphs identify locations; they do not claim to reconstruct runtime values or complete data flow.

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
