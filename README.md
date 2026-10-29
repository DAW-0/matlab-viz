# MatlabViz

MatlabViz is a MATLAB-first dependency explorer for VS Code and VSCodium. It runs MATLAB's documented dependency-analysis APIs locally, converts the results into a portable graph model, and presents that model as an interactive dependency and impact graph.

> **Development status:** `0.1.0` is an initial, working development build. The MATLAB folder-analysis backend has been validated against a real 22-file subsystem. Project analysis and the packaged VSCodium experience are being validated next.

## Why MatlabViz?

General-purpose code-graph extensions usually depend on the Language Server Protocol call-hierarchy API. The MATLAB language server does not currently provide the call hierarchy needed by those extensions. MatlabViz uses MATLAB itself instead:

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
- Persistent last-graph cache and a dedicated MatlabViz output log.
- Cancellable MATLAB analysis process.

## Requirements

- VS Code or VSCodium 1.95 or newer
- MATLAB available locally
- MATLAB R2019a or newer for Project dependency APIs; newer releases expose more Dependency Analyzer options
- Node.js LTS only for developing or packaging MatlabViz

MatlabViz does not require the MATLAB language server. Your source code and dependency graph stay on your machine.

## Run from source

```powershell
git clone https://github.com/DAW-0/MatlabViz.git
cd MatlabViz
npm install
npm run check
npm run build
```

Open the folder in VSCodium and press `F5` to start an Extension Development Host. In that window, open a MATLAB repository and run **MatlabViz: Analyze Workspace**.

To create an installable package:

```powershell
npm run package
codium --install-extension matlab-viz-0.1.0.vsix
```

## Commands

| Command | Purpose |
|---|---|
| `MatlabViz: Analyze Workspace` | Analyze a selected workspace root. |
| `MatlabViz: Analyze Selected File or Folder` | Analyze a folder, or the containing folder of a selected file. |
| `MatlabViz: Refresh Dependency Graph` | Rerun the previous analysis. |
| `MatlabViz: Show Dependency Graph` | Reopen the current interactive graph. |
| `MatlabViz: Export Graph` | Export JSON, DOT, CSV, SVG, or PNG. |
| `MatlabViz: Configure MATLAB Executable` | Select the MATLAB executable explicitly. |
| `MatlabViz: Show Logs` | Open the MATLAB process and analysis log. |

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

## Graph semantics

An arrow `A → B` means that **A depends on B**. Consequently:

- **Dependencies** traversal follows arrows forward.
- **Impact** traversal follows arrows backward to files that may be affected by a change.

The graph represents static dependencies, not execution order. Dynamic file names, `eval`, runtime dispatch, and dependency injection can be invisible to static analysis.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Dependency analysis](docs/DEPENDENCY_ANALYSIS.md)
- [Development and testing](docs/DEVELOPMENT.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## Privacy

MatlabViz starts the local MATLAB executable, reads the resulting JSON file, and renders it locally. It does not upload source files, paths, graphs, or telemetry.

## License

A distribution license has intentionally not yet been selected. Choose one before making the GitHub repository public or publishing a VSIX.
