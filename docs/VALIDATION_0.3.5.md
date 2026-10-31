# MATLAB Viz 0.3.5 validation

Date: 2026-10-31. Platform: Windows, MATLAB R2026b, Node.js 26.13.0, and the
installed VSCodium application. This is the first repair batch, not a claim
that all findings in [the acceptance record](ACCEPTANCE_TESTS.md) are fixed.

## Results

| Check | Result |
|---|---|
| TypeScript and ESLint | Passed |
| Node tests | 18 passed, zero failures/skips with MATLAB integration enabled |
| MATLAB function tests | 9 passed, zero failures/incomplete tests |
| MATLAB Code Analyzer | Zero findings in the two production MATLAB files and two new MATLAB test/helper files |
| Actual VSCodium extension host | Passed all six observation groups using isolated settings, extensions, and workspace storage |
| Standalone artifact generation | All nine files generated; MAT round-trip and CSV counts passed |
| SVG/PNG integrity | Native SVG contains 14 circle nodes, 11 connection polylines, no bitmap; PNG decodes at 2508 x 1739 |
| Real MATLAB log files | Success options/completion, failure identifier/message/stack, and cancellation entries checked |
| Full repository old/new comparison | Identical nodes, edges, products, and notices after sorting records |
| VSIX | Built successfully; 14 archive entries, no tests, profiles, logs, node_modules, or validation artifacts |
| Dependency audit | No high/critical findings; 15 moderate development-tool findings remain |

## What was tested automatically

The 17 deterministic Node checks cover exports, traversal, syntax scanning,
structured exception parsing, collection normalization, malformed graph
documents, cancellation, and retries with notification promises deliberately
left unresolved. They also check that a late Show Logs action cannot overwrite
the status of a newer successful analysis.

The eighteenth Node test runs the production process runner against real
MATLAB. It verifies one-node/one-product and one-edge graphs, a Unicode path,
JSON/DOT/CSV exports, actionable file-limit and missing-project errors, actual
process cancellation, successful retry, and saved logs.

The MATLAB suite checks the raw JSON syntax of every collection at zero and
single-item cardinality, direct dependency directions, a missing registered
Project file, Unicode output, empty graphs, all nine standalone artifacts,
and MAT report reloading. It also found and drove the repair of the empty
unnamed `digraph` bug for folders without any edges.

The actual-editor harness opens a fresh VSCodium profile and runs commands
through the real API. It confirms a four-file/two-edge Project result; leaves
an error notification untouched; verifies that a second analysis succeeds;
repeats recovery after function/reference input errors; and saves a missing
Project result with four nodes, one edge, one missing node, and one warning.
Its actual `MATLAB Viz.log` contains the original MATLAB failure and subsequent
successful completions. No normal user-profile configuration was changed.

## Full repository comparison

On the current `west-control` checkout (`d1ef303`), fresh processes running the
installed 0.3.4 MATLAB code and the repaired 0.3.5 code both returned:

- 515 files;
- 648 dependencies;
- 895 per-source product records;
- the same five expected warnings.

An independent Node check compared all node, edge, product, and notice records,
not only the counts: the old and new results were identical. JSON, DOT, and CSV
consistency checks also passed for the complete graph and the missing-file
Project result. The missing node retains red styling in the DOT export.

The historical 694-edge export was not reproduced even by the unchanged 0.3.4
analyzer on the current checkout. Its differences involve Simulink-origin
relationships. Their cause remains a separate reproducibility investigation;
the repair did not introduce an old/new difference in this comparison.

## Evidence on the development machine

Artifacts are retained under `.tools/validation/0.3.5/` and intentionally
excluded from Git and the VSIX:

- `matlab-results.csv`: final nine passing MATLAB results.
- `matlab-tests.log`: test-session history, including initial failures and
  the final successful rerun. Earlier failures document the edge-free bug.
- `runner-summary.json`, `runner-*.log`, and `runner-one-edge.{json,csv,dot}`.
- `vscodium-host-result.json`, `vscodium-host.log`, `host-stdout.log`, and
  `host-stderr.log`. The host stderr also contains editor startup/deprecation
  messages unrelated to extension test failures; its exit code was zero.
- `vscodium-profile/logs/.../exthost/daw-0.matlab-viz/MATLAB Viz.log`: the
  actual editor-managed output log.
- `host-missing-project.{json,csv,dot}` and `missing-project.json`.
- `west-control-fresh.{json,csv,dot}` and `west-control-legacy.json`.
- `repository-fresh.log`, `repository-legacy.log`, and
  `repository-validation.log`.
- `standalone/`: all nine public-analyzer artifacts.

Deliberate failure tests should contain error messages in their logs. A log
containing an expected error is not itself a failed test; use the result CSV
and runner/host result JSON for the final outcome.

## Limitations and remaining work

The dependency audit reports moderate advisories in development tooling such
as ESLint, minimatch/glob, and vsce. They were not upgraded in this focused
repair. There are no package production dependencies, and node_modules is not
included in the verified VSIX. No high/critical audit findings were reported.

The actual-host tests exercise commands and graph data, not pixel-level visual
assertions or detached-window placement. The known layout, visual-export,
persistence, function-reference, and selected-folder external-resolution
issues remain listed in the acceptance record. Notification dismissal itself
is no longer needed for retry; an old notification may remain visible/history.

The VSIX still emits the pre-existing missing-LICENSE packaging warning.
Publishing remains deferred.
