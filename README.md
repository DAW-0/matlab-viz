# MATLAB Viz

MATLAB Viz is a MATLAB-first dependency explorer for VS Code and VSCodium. It runs MATLAB's documented dependency-analysis APIs locally, converts the results into a portable graph model, and presents that model as an interactive dependency and impact graph.

> **Development preview:** `0.3.21` is validated with local Windows x64, VSCodium 1.143.17232 and MATLAB R2026b. Other editor/platform/MATLAB combinations are not supported release targets yet. See [tested environments and support](SUPPORT.md), [acceptance findings](docs/ACCEPTANCE_TESTS.md) and [release gates](docs/RELEASE.md). Public registry publication remains on hold.

## Why MATLAB Viz?

General-purpose code-graph extensions often depend on Language Server Protocol call-hierarchy support. MATLAB Viz's file graphs do not require that capability: they use MATLAB's own dependency-analysis APIs instead:

- MATLAB Projects: `updateDependencies(project)` followed by `project.Dependencies`
- Ordinary folders: `matlab.codetools.requiredFilesAndProducts(file,"toponly")`

The Project backend is the programmatic form of MATLAB's built-in Dependency Analyzer graph. The folder backend provides direct MATLAB-code dependencies when the selected folder is not a MATLAB Project, plus limited saved Simulink model/subsystem reference metadata.

## Current functionality

- Analyze an entire workspace or a selected file's/folder's containing folder.
- Automatically select MATLAB Project or folder analysis.
- Display MATLAB, Live Script, App Designer, protected-code, and Simulink files.
- Interactive SVG graph with pan, zoom, fit, node dragging, and four layouts.
- Folder/MATLAB-package grouping with collapsible summary nodes, aggregated directed links, member inspection, and persisted view state.
- Cycle explorer with original-graph cyclic components, directed-loop examples, self-link detection, highlighting/isolation, source navigation and saved view state.
- Double-click a node to open it in the editor.
- Search by file name, relative path, or full path.
- Trace dependencies or impact from a selected file to a configurable depth.
- Generate [entry-point dependency reports](docs/ENTRY_POINT_REPORTS.md) with scoped notices, coverage limits and complete Markdown/JSON exports independent of view filters.
- Show/Fit the report's complete analyzed scope in the graph, then restore the exact previous view with one click; scope and undo survive restart/Reload Window.
- Within that scope, show and fit one shortest analyzed dependency path to any node, with ordered original-link evidence and clear runtime caveats; clear it without moving the graph.
- Generate [file impact reports](docs/IMPACT_REPORTS.md) for direct/transitive dependents, with reverse-reachable scopes, original-direction impact paths, complete Markdown/JSON exports and explicit change-exposure limits.
- Save complete [analysis baselines and compare fresh evidence](docs/ANALYSIS_COMPARISON.md): file/link/notice/product changes, recorded coverage differences, selected dependency/impact scope changes, and complete Markdown/JSON comparison exports.
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

- Local Windows x64 and VSCodium 1.143.17232, the validated integration environment. The manifest requires editor version 1.143 or newer; that is not a claim that all newer/other editors were tested.
- MATLAB R2026b available locally; other MATLAB releases are not supported by this preview.
- Simulink installed/licensed for model analysis; ordinary MATLAB-code folder analysis does not require Simulink.
- Node.js 22.13+ on the 22 line, or 24+, only for development/packaging; this local release is built and reproduced with Node.js 26.13.0 and `package-lock.json`.

Microsoft VS Code, macOS/Linux integration, ARM, remote/WSL/container extension hosts and web/virtual workspaces are not validated release targets. Linux TypeScript/unit CI is not MATLAB/editor integration evidence. See [SUPPORT.md](SUPPORT.md) for precise scope and known limitations.

File dependency graphs do not require the MATLAB language server. Function and symbol graphs require a MATLAB language extension that supplies Definition and References results in VSCodium. Your source code and dependency graph stay on your machine.

## Run from source

```powershell
git clone https://github.com/DAW-0/matlab-viz.git
cd matlab-viz
npm ci --ignore-scripts
npm run check
npm run build
```

Open the folder in VSCodium and press `F5` to start an Extension Development Host. In that window, open a MATLAB repository and run **MATLAB Viz: Analyze Workspace**.

To create an installable package:

```powershell
npm run package
$extensionVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
codium --install-extension ".\matlab-viz-$extensionVersion.vsix"
```

For a reproducible committed/tagged local release, use the separate
[release procedure](docs/RELEASE.md). It packages only, never publishes.

## Grouping large graphs

Choose **By folder** or **By MATLAB package** in the graph toolbar. Groups start
collapsed and show how many original files/symbols they contain. Click a group
for its members and internal-link count; double-click it (or focus it and press
Enter/Space) to expand. **Groups** lists individual expand/collapse controls;
**Collapse all**/**Expand all** give an overview or return to individual nodes.
Individual expansion keeps members together near the summary and brings them
into view without moving unrelated nodes. Repeated bulk clicks are no-ops.

Numbers beside grouped arrows count original directed graph links, not source
occurrences. Tracing follows the original file/symbol edges, never shortcuts
through groups. SVG/PNG use the current grouped/filtered view; JSON/DOT/CSV
always export the complete ungrouped analysis. No MATLAB rerun is needed to
group an existing graph. See the [grouping guide](docs/GROUPING.md) for package
ownership, persistence, counts, exports, and first-version limits.

## Cycle explorer

Click **Cycles (N)** to inspect cyclic components in the loaded result. Choose
**Highlight cycles** or **Isolate cycles** and use the component selector for
one component or all of them. Each component includes member navigation,
internal-link counts and one actual directed-loop example. A component can
contain several loops: N is not the number of simple cycles.

Detection always uses original analyzed nodes/links, never collapsed group
arrows. Isolation reveals original members, excludes links between components,
and respects visibility filters; the panel reports partial visibility. SVG/PNG
export the current cycle view; JSON/DOT/CSV remain the complete original model.
No MATLAB rerun is needed. See the [cycle guide](docs/CYCLES.md) for scope,
recursion/reference semantics, restoration and export limits.

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

Project results can include **unresolved dependency names**, such as variables,
unavailable functions/classes, or assets without an established path. These are
not confirmed missing files. They remain visible when external files are excluded,
are not assigned guessed folders/packages, and have no file-navigation action.
Mixed summaries distinguish files/names and report the unresolved count. An
absolute tracked missing file remains a separate kind of warning. Refresh an
older Project graph to regenerate this distinction.

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
the selected root, then rerun analysis/Refresh. The toolbar's **Show external nodes** checkbox
only hides or shows external nodes already in the result. Lookup roots are logged
and recorded in folder graph metadata; Project analysis uses its own project path.
Outside an open workspace no unrelated parent directory is searched implicitly.
For large workspaces, disable workspace lookup and specify smaller additional
roots. MATLAB's original path is restored after standalone analysis, including
errors. See [SearchRoots](matlab/README.md#lookup-roots-and-analysis-scope).

The toolbar's **Analysis externals: enabled/disabled** describes the policy used
to generate the displayed result, recorded as `metadata.analysisIncludeExternal`
in extension-generated graph exports. It does not immediately follow settings
changes. **External analysis settings** opens `matlabViz.includeExternal`; change
that setting and Refresh to generate a new result. Showing/hiding existing nodes
does not rerun analysis. Older cached graphs say **not recorded** until refreshed.
For symbol graphs, external means outside the open workspace folders, rather
than outside a selected folder. Enabling inclusion does not guarantee that static
analysis can resolve every external dependency.

For a function hierarchy, the toolbar's **Analysis depth** controls the analysis
depth used when **Refresh** is pressed. The separate **Trace depth** shown for
file graphs filters an already analyzed view. Refresh reuses the original function even while the graph webview has
focus. The MATLAB Viz output log reports each traversal step and any provider
timeouts.

When a graph tab is left open, Reload Window and application restarts restore
its layout, selection/details, filters, node positions, and custom viewport.
Refresh also retains the original function/direction/depth or reference anchor,
regardless of the current source cursor. Detached placement is retained when
the editor restores its auxiliary windows. Older call graphs that lack a saved
direction remain viewable; run the desired function command once before using
Refresh on those graphs.

If an analysis fails or is cancelled while a graph is loaded, a persistent banner
identifies the displayed graph as the previous result and shows its generation
time. **Refresh displayed graph** reruns that graph's saved target; **Show logs**
opens the output channel. A failure while attempting a different root does not
replace the previous target. Successful analysis clears the banner. The notice
does not alter the graph/cache or exported dependency data and survives restoration
of the same open graph tab. It is view state, not a durable analysis-history log;
the actual logs retain attempt details. With no graph loaded, errors use the normal
notification instead.

For a file-dependency graph, **Trace depth** is a client-side display filter
used after selecting a file and choosing **Dependencies** or **Impact**. It
does not change the repository analysis scope and is disabled while
**Entire graph** is selected. MATLAB diagnostics do not invalidate a completed
graph; use the graph toolbar's **Notices** button to inspect them and open the
affected source files.

## Layout, navigation, and visual exports

Drag the divider immediately left of the details panel to resize it. Tab to the
divider and use Left/Right for 10-pixel steps, or Shift+Left/Right for 50-pixel
steps. Home/End choose the minimum/maximum; Enter or double-click restores the
280-pixel default. The range is 220–960 pixels, additionally bounded to leave
240 pixels for the graph. Width is saved with the open graph view across
Refresh, new analysis results, Reload Window, and editor restarts. It is not a
global setting for newly created tabs. Narrower windows temporarily clamp the
displayed width without erasing the preference; the existing compact view hides
the panel and divider at 800 pixels or below. Widen the graph editor to show them.
Resizing keeps the selected trace, node positions, and custom pan/zoom; fitted
views automatically refit to the available canvas. Long details wrap to fit.

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

For Simulink work, prefer **Project** mode when a MATLAB Project is available.
It includes the native model/library/callback/data-dictionary file relationships;
`matlabViz.project.analyzeModelParameters` additionally asks MATLAB to analyze code
in block parameters. This setting affects only Project mode.

Folder mode reads saved direct model/subsystem references from `.slx`/`.mdl`
metadata without loading those diagrams. Every inspected model gets an explicit
**Partial Simulink folder analysis** notice: library links, callbacks, dictionaries,
parameter code, and required products are not covered by this scan. Unresolved
names or unreadable archives get additional warnings; no target path is guessed.
External lookup/filtering still applies. More notices after upgrading can therefore
mean newly disclosed coverage limits, not newly broken models. Hiding isolated
nodes does not remove these notices. See the [Simulink validation guide](docs/SIMULINK_VALIDATION.md).

Simulink nodes are files, not block-instance diagrams. Two instances of the same
referenced model are one file relationship. Binary `.slx`, `.slxp`, and `.sldd`
navigation delegates to the editor's installed handler or normal binary fallback;
MATLAB Viz does not itself open a MATLAB session or simulate on navigation.

An arrow `A → B` means that **A depends on B**. Consequently:

- **Dependencies** traversal follows arrows forward.
- **Impact** traversal follows arrows backward to files that may be affected by a change.

The graph represents static dependencies, not execution order. Dynamic file names, `eval`, runtime dispatch, and dependency injection can be invisible to static analysis.

For function graphs, `caller → callee` means the source function calls the target function. For reference graphs, `container → symbol` means a function or file contains one or more references to the selected symbol. Reference graphs identify locations; they do not claim to reconstruct runtime values or complete data flow.

Details and traversal controls use graph-specific terms: dependencies/impacted
files, callees/callers, or referenced symbols/referencing containers. Node counts
are distinct neighbors in the complete graph, not just the current visible trace.
The reference summary counts **reference links**, not raw source occurrences:
one container-to-symbol edge can group multiple source lines. Edge details keep
the relationship type, grouped lines/evidence, and an explanation of direction.

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
- [Support and tested environments](SUPPORT.md)
- [Release procedure](docs/RELEASE.md)

## Privacy

MATLAB Viz starts the local MATLAB executable, reads the resulting JSON file, and renders it locally. It does not upload source files, paths, graphs, or telemetry.

## License

MIT. See [LICENSE](LICENSE). MATLAB/Simulink and installed language extensions
remain separately licensed; this license does not grant rights to those products
or to repositories/models analyzed by MATLAB Viz.
