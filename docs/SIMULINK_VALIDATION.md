# Simulink dependency analysis: scope and validation

MATLAB Viz displays **file relationships**, not a Simulink block diagram,
simulation trace, signal-flow graph, or compiled model hierarchy. MATLAB Viz does
not issue model-update, compilation, simulation, code-generation, or model-save
commands during analysis. Analyze trusted content: opening a Project can run its
startup/shutdown tasks, which can execute arbitrary project code, and MATLAB's
broader analysis operations can load/initialize model content. This is not a
guarantee about the internals of every native analyzer or project task.

## Choose the backend deliberately

Project mode uses MATLAB's documented
[`updateDependencies`](https://www.mathworks.com/help/matlab/ref/matlab.project.project.updatedependencies.html)
and `project.Dependencies`. It is preferred when a MATLAB Project is available.
The bridge preserves the native file-level endpoints and direction; repeated
block instances that reference the same file are collapsed to one file link.
The documented digraph in the tested release exposes `EndNodes`, not block-instance
locations or an inventory of products, so those are not invented by the bridge.

Folder mode uses
[`requiredFilesAndProducts(...,"toponly")`](https://www.mathworks.com/help/matlab/ref/matlab.codetools.requiredfilesandproducts.html)
for MATLAB program files. That API is not a complete analyzer of model contents.
For `.slx` and `.mdl` files, folder mode instead reads
[`Simulink.MDLInfo`](https://www.mathworks.com/help/simulink/slref/simulink.mdlinfo.html)
saved direct model/subsystem references without loading the diagram. A resolved
metadata reference is a direct file edge, not a flattened transitive requirement
set. Runtime expressions are not evaluated to guess names or paths.

| Relationship | Project fixture | Folder fixture |
|---|---|---|
| Two model-reference instances using one child | One file link, matching the unique native pair | One saved-metadata link |
| Legacy `.mdl` model referencing `.slx` | Verified | Verified |
| Linked library subsystem | Verified native file link | Not covered; scope warning |
| Model InitFcn calling an `.m` helper | Verified native file link | Not covered; scope warning |
| Attached `.sldd` dictionary | Verified link and dictionary node kind | Not covered; scope warning |
| MATLAB function in a block parameter | Absent with option off; present with option on | Not covered; scope warning |
| Saved referenced-subsystem file | Not separately exercised in the Project fixture | Verified without loading either diagram |
| Missing tracked child model | Missing node/notice, then recovery verified | Unresolved-name warning; no invented missing path |

The fixture Project has eight files and five unique links with parameter analysis
off, six with it on. Folder analysis of the same root has seven source/target
nodes and two links, plus four model-scope warnings. The dictionary is an asset
target in Project mode, not an independently discovered folder source file.
These are controlled-fixture observations, not expected counts for WEST.

## Settings and notices

`matlabViz.project.analyzeModelParameters` is Project-only. Enabling it asks
MATLAB to analyze code used in block parameters. `AnalyzeModelParameters` and
`AnalyzeAddOns` were added in R2024b; `AnalyzeReferences` was added in R2025a.
The bridge's configured Project option set therefore requires R2025a or later;
automated validation here uses R2026b. Older hosts are not claimed as validated.
See the [version history](https://www.mathworks.com/help/matlab/ref/matlab.project.project.updatedependencies.html).

Folder mode reports **Partial Simulink folder analysis** for every inspected
model, including a model with no saved model references. Library links, callbacks,
dictionaries, parameter expressions, required products, variants, and many
specialized block dependencies are outside this scan's coverage. Zero model
edges is therefore not proof that the model is independent. There is no silent
fallback from a failed Project analysis to a partial folder result.

An unresolved saved model name adds a warning on its source. A corrupt archive
can cause MDLInfo to return an empty descriptor rather than throw; that is
explicitly reported as unreadable metadata. Isolated-node filtering never removes
these scope/read warnings. Expect more explanatory notices for mixed repositories
than before 0.3.11, which silently treated these model inputs as dependency-free.

Retain the JSON graph, MAT report, or problem CSV when sharing a partial result.
DOT, SVG, PNG, and edge-only CSV depict topology but do not carry the complete
diagnostic table; a model that looks isolated in an image can still have important
coverage warnings in its report.

`SearchRoots` / additional lookup roots and Include External also apply to saved
model references. Only files under the selected source root are scanned as
sources; an external child target is not recursively analyzed. When filtering
external targets out, their edges disappear but scope warnings remain. See the
[standalone guide](../matlab/README.md) and [external controls](../README.md).

## Reproduce the licensed checks

Use a **separate MATLAB process**, with no Project open. The fixture factory
refuses an existing destination and an already-open Project, and checks for
collisions with its owned model names. It uses explicit empty Model/Library
creation rather than a user's default custom model template. Binary `.slx`,
`.mdl`, and `.sldd` files are generated locally and never committed/shipped.

```matlab
addpath("matlab", "test/matlab")
results = runtests("test/matlab");
assertSuccess(results)
```

There are 23 MATLAB tests in this release, including nine licensed Simulink tests
and an unreadable-model regression. If Simulink/license is unavailable, licensed
tests explicitly report incomplete/skipped coverage rather than pretending it
passed. The normal Node CI does not run these licensed checks.

For retained native/bridge tables and artifacts, choose a fresh artifact root:

```matlab
probeMatlabVizSimulink(artifactsRoot)
```

The probe builds owned fixtures and retains native Project graphs, bridge JSON,
and standalone CSV/DOT/MAT reports. Creating/saving trusted fixture blocks can
evaluate their parameter expression: marker files establish that baseline. In
the retained probe, subsequent analyses do not add executions to those markers.
Folder tests independently verify that diagrams remain unloaded and marker bytes
do not change. This observation is not a security guarantee for arbitrary models.
Every original fixture model, dictionary, and MATLAB source is checked for
byte-for-byte preservation after tests; only generated Project metadata/caches
and explicitly requested test reports can change.

The editor harness's `simulink` phase uses the actual extension commands and
MATLAB processes. Set `MATLAB_VIZ_SIMULINK_FIXTURE` to the generated `fixture.json`,
`MATLAB_VIZ_TEST_EXECUTABLE` to MATLAB, then use the launcher described in
[Development](DEVELOPMENT.md). It verifies automatic Project selection,
parameter-toggle Refresh, partial folder notices, external filtering, connected
node filtering, classification, and unchanged source bytes in an isolated profile.

## Navigation and remaining gaps

Binary models/dictionaries are opened through the editor's registered file
handler or its standard binary fallback, not forced into a text document.
MATLAB Viz does not itself start MATLAB or simulate on navigation. An installed
custom editor can have its own behavior; availability of a model viewer is not
guaranteed. Legacy text `.mdl` files can still open as text. Block-level navigation
inside a model is not implemented.

Protected-model generation/code generation, inactive/variant choices, masked
blocks, Stateflow, specialized S-functions, real installed third-party add-on
discovery, referenced-dictionary hierarchies, and cross-platform behavior need
separate fixtures. The Analyze Add-Ons switch is tested for option passthrough
and unchanged local-fixture links only; no add-on is installed into a user profile.
The historical WEST edge-count discrepancy remains unresolved; these tests do
not retroactively explain or reproduce the old 694-edge snapshot.

See the [0.3.11 validation record](VALIDATION_0.3.11.md) for the final results and
local evidence paths.
