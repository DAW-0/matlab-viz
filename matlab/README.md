# Standalone MATLAB dependency analyzer

`analyzeMatlabFileDependencies` is the public MATLAB API behind MATLAB Viz's
folder-analysis mode. It can be used from MATLAB without installing or opening
the VS Code/VSCodium extension.

## Basic use

Add the repository's `matlab` directory to the MATLAB path and analyze a source
tree:

```matlab
addpath("matlab")
report = analyzeMatlabFileDependencies("path/to/source");
```

For MATLAB program sources, the analyzer calls:

```matlab
matlab.codetools.requiredFilesAndProducts(file,"toponly")
```

Calling the API once per file preserves direct edges. An edge `A -> B` means
that file A directly depends on file B.

For `.slx`/`.mdl` sources, it instead uses `Simulink.MDLInfo` to read saved direct
model/subsystem reference metadata without loading the diagram. This is partial
model analysis: a warning accompanies every inspected model. Library links,
callbacks, dictionaries, parameter code, and model product requirements are not
analyzed in folder mode. Use the extension's MATLAB Project backend for broader
Simulink file dependencies; a flat transitive list is not substituted for direct
edges. See [Simulink validation](../docs/SIMULINK_VALIDATION.md).

## Report contents

The returned structure contains:

| Field | Contents |
|---|---|
| `graph` | MATLAB `digraph` with path and file metadata on its nodes. |
| `nodes` | Node paths, labels, kinds, scope, existence, and graph degrees. |
| `edges` | Direct source/target relationships with absolute paths. |
| `products` | Required MathWorks products and the files introducing them. |
| `problems` | Nonfatal per-file failures and missing dependencies. |
| `errors` | Compatibility view of source, identifier, and message columns. |
| `artifacts` | Paths of any files written by this invocation. |
| `searchRoots` | Canonical additional lookup roots used by this invocation. |

Use standard graph operations directly:

```matlab
successors(report.graph,"functions/main.m")
predecessors(report.graph,"functions/helper.m")

components = conncomp(report.graph,"Type","strong");
cycleNodes = report.nodes(components > 0,:);
```

## File artifacts

Supply `OutputDirectory` to write a complete portable report:

```matlab
report = analyzeMatlabFileDependencies(sourceRoot, ...
    OutputDirectory="dependency-report");
```

The directory contains:

- `matlab-dependency-nodes.csv`
- `matlab-dependency-edges.csv`
- `matlab-dependency-products.csv`
- `matlab-dependency-problems.csv`
- `matlab-dependency-errors.csv` for compatibility
- `matlab-dependencies.dot`
- `matlab-dependencies.svg`
- `matlab-dependencies.png`
- `matlab-dependencies.mat`

Set `Render=false` to skip MATLAB graphics while retaining the tables, DOT,
and MAT report.

## Options

| Option | Default | Meaning |
|---|---:|---|
| `OutputDirectory` | `""` | Directory for artifacts; no files are written when empty. |
| `IncludeExternal` | `false` | Retain dependencies outside the source root. |
| `IncludeIsolated` | `true` | Retain source files with no retained edges. |
| `SearchRoots` | `strings(1,0)` | Additional lookup trees, not additional analyzed source trees. |
| `Extensions` | MATLAB/Simulink defaults | Source extensions to discover recursively. |
| `MaximumFiles` | `5000` | Abort before scanning an unexpectedly large tree. |
| `Render` | `true` | Write MATLAB-rendered SVG and PNG files with artifacts. |
| `Print` | `true` | Print a concise summary in the Command Window. |

Example with explicit scope and file types:

```matlab
report = analyzeMatlabFileDependencies(sourceRoot, ...
    IncludeExternal=true, ...
    IncludeIsolated=false, ...
    Extensions=[".m",".mlx"], ...
    MaximumFiles=10000, ...
    Print=false);
```

## Lookup roots and analysis scope

When analyzing a subtree, provide the containing repository or explicit sibling
libraries if its functions are not already on MATLAB's path:

```matlab
report = analyzeMatlabFileDependencies(offlineSimulationRoot, ...
    SearchRoots=repositoryRoot, ...
    IncludeExternal=true, ...
    Render=false);
```

The analyzer discovers and analyzes source files only under the selected root.
Lookup trees are temporarily added recursively to resolve those sources' direct
dependencies. External targets are retained only with `IncludeExternal=true`;
their own dependencies are not recursively analyzed. `MaximumFiles` limits the
selected sources, not the lookup tree. The selected tree has precedence over
additional roots, whose listed order is retained. Duplicate/selected-root entries
are removed, nonexistent roots fail clearly, and `report.searchRoots` records
the canonical roots actually used. The original MATLAB path is restored on both
success and failure. Use smaller lookup roots if adding a large tree is costly.

In the extension, containing-workspace lookup is enabled by default through
`matlabViz.folder.useWorkspacePath`; `matlabViz.folder.additionalSearchRoots`
adds explicit roots. These settings affect only the folder backend. The public
standalone API does not implicitly search a containing repository.

## Limitations

The results are static dependencies, not execution traces. Dynamic names,
`eval`, runtime path changes, reflection, and data-dependent loading may not be
resolved. Results also depend on required files and products being available on
the MATLAB path. The analyzer temporarily adds the source tree to the path and
restores the original path before returning.

Unresolved saved model names produce warnings on the source file rather than
invented missing-node paths. Invalid/default metadata descriptors are reported
as unreadable, not treated as models with no dependencies. The original model
files are not saved or updated. Required-products tables describe only the MATLAB
program-file analysis, not a complete Simulink product inventory. `.sldd` files
returned as targets are labeled as data dictionaries; protected model targets are
labeled separately, but protected-model generation is not validated.
