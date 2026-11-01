# MATLAB Viz 0.3.11 validation

Date: 2026-11-01. Windows, installed VSCodium, MATLAB R2026b Update 1,
licensed Simulink 26.2, and Node.js. Scope: deeper Simulink validation and fixes
for the silent folder-analysis gap, invalid metadata, classification, and binary
navigation. WEST models were not loaded, saved, compiled, or simulated.

## Results

| Check | Result |
|---|---|
| TypeScript, ESLint, production build | Passed |
| Deterministic Node tests | All 90 passed |
| Full Node suite with real MATLAB enabled | All 91 passed; no failures/skips/cancellations; approximately 104 seconds |
| Complete MATLAB function suite | All 23 passed; no failures/incomplete tests |
| Licensed Simulink tests | All nine passed within the MATLAB suite |
| MATLAB Code Analyzer | No findings in either production analyzer |
| Native Simulink editor phase | All four observation groups passed |
| Other native editor regressions | All nine phases passed: visual, clarity, seven restoration/provider phases |
| VSIX | 15 entries; six production asset/helper SHA-256 hashes match; no test models/code, profiles, logs, artifacts, or node_modules |
| Local installation | `daw-0.matlab-viz@0.3.11` verified; normal user windows not reloaded |

## Controlled model results

The factory generates a top `.slx` model with two child-model instances, a genuine
linked library subsystem, an InitFcn helper, a `.sldd` dictionary, and a MATLAB
function in a Constant block parameter. A legacy `.mdl` also references the child.
An unused helper checks isolated-file behavior. The library's actual ReferenceBlock
is asserted rather than assuming a primitive copied from a library retains a link.

| Backend/scope | Nodes | Unique file links | Scope notices |
|---|---:|---:|---:|
| Project, parameter analysis off | 8 | 5 | 0 |
| Project, parameter analysis on | 8 | 6 | 0 |
| Folder, entire fixture | 7 | 2 | 4 |
| Selected models folder, external child included | 3 | 2 | 2 |
| Same selection, external child excluded | 2 | 0 | 2 |
| Folder, connected nodes only | 3 | 2 | 4 |

Project endpoints and direction are compared to unique native `project.Dependencies`
pairs for both parameter settings. The sixth link is exactly the parameter helper.
Repeated block instances collapse to a file relationship; the tested native API's
digraph exposes EndNodes, not block-instance detail fields. No block-level locations
or product records are manufactured.

Folder analysis previously silently returned no model-reference links for this
fixture. It now reads saved direct model/subsystem metadata and recovers two links.
It explicitly warns about omitted library/callback/dictionary/parameter/product
coverage rather than presenting this as the full Project graph. A separate generated
referenced-subsystem test verifies its direct saved link without loading either
diagram. This is intentionally partial folder support, not a replacement for the
native Project analyzer.

## Failure, preservation, and export checks

- Renaming an owned child fixture produces unresolved-name warnings in folder
  mode without guessing a missing target path; restoring it restores both links.
- Project mode retains the missing tracked model node/notice and recovers after
  restoration. Every original model, dictionary, and `.m` fixture source is checked
  for byte-for-byte preservation after tests.
- An invalid SLX archive can return a default MDLInfo descriptor instead of throwing.
  The production scan now explicitly warns about unreadable metadata; it cannot
  silently count the file as dependency-free.
- Folder scans leave the fixture diagrams unloaded and do not change code-execution
  marker bytes. Creating/saving the trusted fixture initially evaluates its parameter
  once; the retained probe records this construction baseline separately from analysis.
  This is not a guarantee about arbitrary Project startup tasks or model callbacks.
- Edge CSV/DOT/MAT exports retain the model links; problem CSV, MAT, and bridge JSON
  retain scope warnings even when isolated nodes are filtered out. DOT and visual
  graph exports do not contain a diagnostic table. MAT reloading and node/edge counts
  are checked. Diagnostic
  CSV tests set explicit data lines so MATLAB's all-string header/unit inference cannot
  silently discard the first diagnostic row.
- Binary `.slx`/`.slxp`/`.sldd` navigation delegates to `vscode.open` in the tested
  editor adapter; it does not force text loading or issue an extension MATLAB command.
  A model viewer's availability/behavior depends on installed editor handlers.

The actual editor Simulink phase uses real commands and batch MATLAB, checks Project
auto-detection and parameter-setting Refresh, then folder notices and external/isolated
filtering. Its generated-source byte comparison also passes. No Project is created
inside WEST or another user source repository.

## Existing regressions rerun

The full Node integration starts real MATLAB processes for singleton/one-edge JSON,
Unicode paths, data exports, logs, actionable errors, cancellation, and retry.
The separate MATLAB suite reruns all prior 13 function tests as well as the new tests,
including raw JSON collection shapes and all nine standalone artifacts with SVG/PNG.

Native renderer checks still cover 515 nodes in four layouts with no automatic overlap
or Fit clipping. Full SVG has 515 vector nodes/648 arrowed edges; filtered SVG and a
3042 x 472 4x PNG contain two nodes/one edge. Trusted pointer/keyboard/divider behavior,
compact CSS, ResizeObserver, save dialogs, actual export logs, and the oversized PNG
error pass. Clarity/error retry, detached restart, Reload Window, original Refresh
targets, saved widths, and deliberately hung providers all pass.

## Evidence on the development machine

Ignored files under `.tools/validation/0.3.11/` include:

- `matlab-final-complete.log`, `matlab-results-final.csv`: final 23-test run and
  production Code Analyzer assertions.
- `node-final.log`, `runner-summary.json`, runner logs, JSON/DOT/CSV exports.
- `probe-metadata/`: owned fixture manifest/binaries, native off/on MAT digraphs,
  bridge JSON, standalone folder reports. Probe execution markers are recorded in
  `.tools/simulink-metadata-probe.log`.
- `native-models/simulink-result.json`, Project/folder JSON, screenshot, and real logs.
- `native-regression-verified/*-result.json`, SVG/PNG, pointer data, screenshots,
  saved-view snapshots, and editor-managed logs: final nine-phase regression outcome.

Earlier diagnostic runs are retained and superseded by these named passing results.
The visual save-dialog harness was hardened after initialization overwrote its typed
filename and saved a valid SVG under the default name. It now confirms the requested
text remains before pressing Enter; this was a test-driver timing issue, not a
production export-data failure. Test profiles/settings and generated assets are not
bundled or committed.

## Remaining limits

See the [Simulink scope guide](SIMULINK_VALIDATION.md). Project analysis is the broader
path; folder mode remains metadata-only and explicitly partial. Protected-model
generation, variants, masks, specialized blocks/Stateflow, dictionary hierarchies,
real installed third-party add-on discovery, other MATLAB releases/platforms, and
block-level navigation are not claimed as validated. The add-on option passthrough
test does not install or validate a third-party add-on.

The historical WEST 694-edge snapshot discrepancy is not resolved by these fixtures.
New folder model-reference edges and scope notices can change future WEST counts;
there was no new repository-wide analysis in this batch. Refresh is required to
apply the new analyzer to a cached model graph; reloading alone updates the UI/code.
