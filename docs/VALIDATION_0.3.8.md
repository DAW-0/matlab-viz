# MATLAB Viz 0.3.8 validation

Date: 2026-10-31. Windows, installed VSCodium, MATLAB R2026b, and Node.js.
This batch repairs function-reference completeness and selected-folder lookup
scope. It repeats the previous visual-export and persistent-window regressions.

## Results

| Check | Result |
|---|---|
| TypeScript, ESLint, and production build | Passed |
| Deterministic Node regressions | 74 passed |
| Full suite with real MATLAB enabled | All 75 passed; no failures, cancellations, or skips; approximately 91 seconds |
| MATLAB function suite | All 13 passed |
| MATLAB Code Analyzer | No findings in either production MATLAB analyzer |
| Existing native-editor regressions | All eight phases passed: visual, call/reference restart and Reload Window, provider timeout |
| Native accuracy phase | All five observation groups passed |
| Read-only WEST reference phase | Both observation groups passed; inspected source bytes unchanged |
| VSIX inspection | 15 entries; bundled production JS, graph assets, and MATLAB helpers match local SHA-256 hashes; no tests, logs, profiles, or node_modules |
| Normal-profile installation | Installed `daw-0.matlab-viz@0.3.8`; existing user windows left untouched |

The Node suite has 75 tests: 74 deterministic tests and one opt-in integration
test that starts real MATLAB processes. CI without MATLAB skips only that test.
The native tests use separate editor profiles, storage, settings, and extensions;
they do not move or reload the user's ordinary windows.

## Accuracy evidence

The native fixture tests use registered editor providers, not only mocked
commands. Empty, declaration-only, and partial providers recover grouped function
references, while local/private/package conflicts and obvious array bindings do
not introduce global-name matches. Selecting a function use works without a
Definition result. Variable references stay provider-scoped. Deliberately hung
providers produce warnings and syntax results, then recover on Refresh.

On actual WEST sources, a declaration-only reference provider still recovers
`replay_heating_control.m` at line 134 for
`load_heating_control_scheme_configuration_from_pulse`: two nodes, one edge.
The commented fueling reference is excluded. The `tar_file_path` graph retains
provider occurrences at lines 9, 10, 14, and 16: two nodes, one edge. Both inspected
source files are byte-for-byte unchanged.

Fresh MATLAB-path analysis of the selected `offline-sim` tree gives:

| Lookup/external policy | Nodes | Edges | External nodes |
|---|---:|---:|---:|
| Selected tree only | 14 | 11 | 0 |
| Containing workspace lookup; external included | 27 | 26 | 13 |
| Same lookup; external excluded | 14 | 11 | 0 |

Only the original 14 files are analyzed as sources in every case. The extra
nodes are direct external targets, not a recursive whole-repository scan. Native
editor tests separately verify workspace opt-out, relative additional roots,
selected-source file limits, and invalid-root error recovery while the notification
is left open. MATLAB tests verify path precedence/restoration. Project behavior
is unchanged.

## Export, logging, and persistence regression evidence

The repeated native visual phase verifies all 515 nodes in four layouts, Fit,
pointer interaction, full vector SVG with 648 arrowed edges, filtered two-node
SVG/PNG, actual save dialogs, remembered destinations, and the oversized PNG
error. The filtered 4x PNG decodes at 3042 x 472 with rendered pixels. Real
editor-managed logs include export requests, counts, dimensions, saved paths,
and the expected error. Call/reference graphs retain detached placement, saved
view state, and original Refresh targets across restart and Reload Window.

The MATLAB suite checks all nine standalone artifacts, including CSV, DOT, MAT
reload, vector SVG, and raster PNG. The process-runner test separately checks
JSON/DOT/CSV output and saved success/failure/cancellation logs.

## Local evidence

Ignored artifacts under `.tools/validation/0.3.8/` include:

- `node-final.log`, `runner-summary.json`, and `runner-*.log`.
- `matlab-final-verified.log` and `matlab-results.csv`: final MATLAB checks.
- `repository-lookup-summary.json` and `offline-sim/`: actual lookup comparison
  and standalone reports.
- `native-accuracy/accuracy-result.json`, graph exports, and isolated logs.
- `west-references/repository-accuracy-result.json` and reference graph exports.
- `regression-host/*-result.json`, SVG/PNG, screenshots, pointer data, and logs.

Earlier diagnostic runs are retained; the named final results supersede them.
None of these artifacts, user source paths/content, test harnesses, or profiles
is bundled in the VSIX.

## Remaining limitations

Syntax evidence is a conservative inference, not proof of MATLAB runtime
resolution. Imports, nested capture, runtime path order, dynamic dispatch/loading,
and unknown object receivers are not fully modeled. Ambiguous names can be
omitted with notices; empty results do not establish that a symbol is unused.
Variables still depend on the language provider. Refresh anchors are saved
positions, so moving a symbol with edits can require a fresh trace.

Workspace lookup uses a recursive path and can cost time on very large trees;
disable it and configure narrower roots when appropriate. External inclusion
requires analysis configuration plus a new analysis, not merely the visibility
checkbox. Dense edges can still cross, details resizing remains pending, and
cross-platform/advanced Simulink coverage remains incomplete. See the
[acceptance record](ACCEPTANCE_TESTS.md).
