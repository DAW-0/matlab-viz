# Dependency analysis backends

## MATLAB Project mode

When the selected root contains a MATLAB Project, MatlabViz constructs a `matlab.project.Project`, calls `updateDependencies`, and exports `project.Dependencies`.

This is the preferred backend because the graph is maintained by MATLAB's Dependency Analyzer and can include relationships beyond MATLAB function calls, including Simulink models and project files. Configurable options cover:

- Complete versus incremental reanalysis
- Referenced projects
- Add-ons
- MATLAB code in model parameters

`updateDependencies` requires a loaded project, so MatlabViz loads the project inside its isolated MATLAB batch process and closes it after exporting the graph. Loading a project can execute its configured startup tasks. Analyze only projects you trust.

## Folder mode

For an ordinary folder, MatlabViz discovers supported files and runs:

```matlab
[requiredFiles, requiredProducts] = ...
    matlab.codetools.requiredFilesAndProducts(file,"toponly");
```

It performs one call per source file. A single call over all files would return a flattened dependency set and would not identify which source introduced each direct edge.

Supported analysis roots currently discover `.m`, `.mlx`, `.p`, `.slx`, `.mdl`, and `.mlapp` files. Files returned as dependencies can have other extensions.

## Static-analysis limitations

MATLAB documents important limitations in Dependency Analyzer and `requiredFilesAndProducts`:

- Dynamic file names cannot generally be resolved.
- Calls through `eval`, callbacks, reflection, or runtime dispatch may be absent.
- A method can be confused with a function when its receiver type is unknown.
- Installed products affect which product dependencies can be reported.
- Some masked-block and support-package dependencies are not detected.
- Static analysis can report unreachable code because it does not execute conditions.

MatlabViz shows the graph MATLAB reports. It does not manufacture inferred edges. A future manual-edge layer is planned for architectural relationships that static analysis cannot prove.

## Direction

Edges point from a dependent file to its requirement:

```text
caller.m ──depends on──▶ helper.m
```

Forward traversal answers “what does this file require?” Reverse traversal answers “what can this file affect?”
