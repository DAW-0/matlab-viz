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

For every supported source file, the analyzer calls:

```matlab
matlab.codetools.requiredFilesAndProducts(file,"toponly")
```

Calling the API once per file preserves direct edges. An edge `A -> B` means
that file A directly depends on file B.

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

## Limitations

The results are static dependencies, not execution traces. Dynamic names,
`eval`, runtime path changes, reflection, and data-dependent loading may not be
resolved. Results also depend on required files and products being available on
the MATLAB path. The analyzer temporarily adds the source tree to the path and
restores the original path before returning.
