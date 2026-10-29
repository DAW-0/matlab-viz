# Dependency analysis backends

## MATLAB Project mode

When the selected root contains a MATLAB Project, MATLAB Viz loads the project, calls `updateDependencies`, and exports `project.Dependencies`.

This is the preferred backend because the graph is maintained by MATLAB's Dependency Analyzer and can include relationships beyond MATLAB function calls, including Simulink models and project files. Configurable options cover:

- Complete versus incremental reanalysis
- Referenced projects
- Add-ons
- MATLAB code in model parameters

`updateDependencies` requires a loaded project, so MATLAB Viz loads the project inside its isolated MATLAB batch process and closes it after exporting the graph. Loading a project can execute its configured startup tasks. Analyze only projects you trust.

## Folder mode

For an ordinary folder, MATLAB Viz discovers supported files and runs:

```matlab
[requiredFiles, requiredProducts] = ...
    matlab.codetools.requiredFilesAndProducts(file,"toponly");
```

It performs one call per source file. A single call over all files would return a flattened dependency set and would not identify which source introduced each direct edge.

Supported analysis roots currently discover `.m`, `.mlx`, `.p`, `.slx`, `.mdl`, and `.mlapp` files. Files returned as dependencies can have other extensions.

Folder mode and the standalone MATLAB API use the same implementation:

```matlab
addpath("matlab")
report = analyzeMatlabFileDependencies(sourceRoot);
```

This shared boundary ensures that editor graphs and direct MATLAB analyses use
the same discovery rules, direct-edge semantics, scope filtering, product
collection, and problem reporting. The standalone API additionally exposes the
native `digraph` and optional file artifacts. See
[`matlab/README.md`](../matlab/README.md).

## Static-analysis limitations

MATLAB documents important limitations in Dependency Analyzer and `requiredFilesAndProducts`:

- Dynamic file names cannot generally be resolved.
- Calls through `eval`, callbacks, reflection, or runtime dispatch may be absent.
- A method can be confused with a function when its receiver type is unknown.
- Installed products affect which product dependencies can be reported.
- Some masked-block and support-package dependencies are not detected.
- Static analysis can report unreachable code because it does not execute conditions.

MATLAB Viz shows the graph MATLAB reports. It does not manufacture inferred edges. A future manual-edge layer is planned for architectural relationships that static analysis cannot prove.

## Direction

Edges point from a dependent file to its requirement:

```text
caller.m ──depends on──▶ helper.m
```

Forward traversal answers “what does this file require?” Reverse traversal answers “what can this file affect?”
