# Packaged-install acceptance: 0.3.21

Date: 3 November 2026 (Europe/Paris). Environment: local Windows x64,
VSCodium 1.143.17232 and MATLAB R2026b. This is not evidence for other editors,
operating systems or MATLAB releases. Publication was on hold during acceptance;
the later GitHub/Open VSX authorization and status are recorded in [RELEASE.md](RELEASE.md).

## Artifact and isolation

The tested artifact is the existing tagged release, not a rebuilt development
bundle: `.tools/releases/v0.3.21/matlab-viz-0.3.21.vsix`, SHA-256
`85a059996960ebd6d42a03f56d20ba35733b5f4ec09ec841a131913afdf2b9d9`.
Package validation confirms 29 archive entries, MIT licensing, required user
guides and runtime, and no test/private/dependency content.

The runner installs that VSIX through the bundled editor CLI into each suite's
private extensions directory and uses a fresh user-data profile. Only the test
driver is a development extension. Per-phase installed-contract evidence checks
MATLAB Viz's actual installed load path, activation, all 11 commands, all 17
settings and required bundled files. Runtime hashes are compared with the clean
release checkout. The editor may display "Extension Development Host" because
of the test driver; MATLAB Viz itself must not load from the source checkout.

The first install-launch attempt used the GUI entry point instead of the CLI.
That harness issue was corrected; its isolated process was identified and closed,
and the suite was rerun in a fresh directory. No release runtime change was needed.
Evidence from the unsuccessful attempt is retained, not counted as a product pass.
Likewise, `cycles-calls` initially used the ordinary four-file fixture workspace,
which lacks the call-cycle sources. Its independent rerun against
`test/fixtures/cycles` passed; the missing-fixture attempt remains as evidence.

## Automated checks

All 29 native phases passed across 11 independent suite profiles. Every successful
phase also produced its passing installed-package contract. The retained failed
fixture invocation is excluded from this total. Installed host, renderer and
MATLAB-helper hashes match the clean release checkout in all eleven profiles.

- TypeScript checking, ESLint, test compilation and the deterministic Node suite:
  209 passed, zero failed. Two normally optional MATLAB tests were then explicitly
  enabled and both passed (the selected two-file invocation passed all 16 tests).
  Thus all 211 distinct tests have passing evidence across those invocations.
- Real MATLAB-process checks: singleton/one-edge JSON, Unicode paths, CSV/DOT,
  detailed success and structured-error logs, file-count and missing-Project
  errors, cancellation and successful retry. Entry-point report generation
  preserves all fixture source bytes and does not execute fixture scripts.
- Packaged comparison/report/impact phases: actual baseline and export dialogs,
  JSON/Markdown reports, SVG/PNG/JSON/DOT/CSV graph exports, native log contents,
  malformed baseline recovery, exact Show/Return, restart and Reload Window.
- Packaged visual phase: 515 nodes in all four layouts, no rectangle overlap,
  Fit clipping or label overflow; full SVG with 515 vector nodes and 648 arrowed
  edges, no embedded bitmap. Filtered PNG decodes with nonblank pixels; oversized
  PNG fails with an actionable message. Counts describe the historical saved
  test graph, not the current WEST checkout.
- Actual Chromium mouse/keyboard input: rapid node drag, pan selection retention,
  adjustable details panel, limits/reset and compact/wide resize restoration.
- Real MATLAB file-limit recovery preserves graph/cache/selection/viewport;
  banner Refresh succeeds while the old notification remains open. External
  analysis policy and visibility stay independent.
- Function/reference phases: detached placement, original Refresh targets,
  controls/selection/viewport and selected reference evidence survive restart
  and Reload Window. A deliberately hung provider times out and recovers.
- Grouping phases: layouts, exports and restart restoration; twenty repeated
  collapse/expand operations preserve positions/viewport/DOM. Disconnected
  groups expand in place, without moving unrelated groups. Failed real MATLAB
  Refresh preserves the grouped view.

- Cycle isolation, restart/Reload Window and real MATLAB failure/successful
  Refresh passed. Independent actual Show Callees checks recover both mutual
  two-function recursion and a self-call without executing either function.
- Folder lookup/provider accuracy passed: declaration-only and partial
  providers merge with syntax evidence without local/private/package/array
  false positives; variable evidence remains provider-scoped. Sibling and
  relative search roots work without expanding source count, external policy
  is respected, and an invalid lookup root preserves the graph and permits retry.
- Licensed controlled Simulink fixtures passed: automatic Project backend,
  five-to-six-link parameter analysis, explicit folder partial-coverage warnings,
  selected-model external lookup/filtering and connected-only filtering. All
  inspected model, dictionary and MATLAB source bytes remain unchanged. No model
  simulation or compilation was requested.

## Evidence and limits

Local private evidence is under
`.tools/validation/0.3.21/installed-acceptance-20261103/`: install/editor logs,
per-phase results, installed-contract results, screenshots and real exports.
Private profiles and saved repository graphs must not be committed or packaged.

These suites do not run WEST controllers, simulations or deployment code. The
normal editor profile is not the test target. Workspace trust is disabled in
the automated profiles; trust-prompt UX and execution sandboxing are not claimed.
Licensed Simulink integration, if completed below, is controlled fixture analysis,
not numerical or simulation validation. No push, publication or visibility change
is performed, and the existing release artifact/tag are not replaced.

Manual follow-up is limited to subjective readability and interaction comfort in
the maintainer's actual monitor/detached-window setup. Automated geometry checks
and screenshot inspection cannot establish every DPI/theme/accessibility case.
