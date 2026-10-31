# MATLAB Viz 0.3.6 validation

Date: 2026-10-31. Platform: Windows, installed VSCodium 1.140.6880,
MATLAB R2026b, and Node.js 26.13.0. This batch repairs saved-graph and
editor-window restoration; it does not resolve every acceptance finding.

## Results

| Check | Result |
|---|---|
| TypeScript, ESLint, and production bundle | Passed |
| Complete Node suite with MATLAB enabled | 37 passed, zero failures/skips |
| Real MATLAB production-runner integration | Passed: JSON/DOT/CSV, Unicode paths, logs, errors, cancellation, and retry |
| Actual editor MATLAB commands | All six observation groups passed in an isolated profile |
| Actual editor restoration suite | All seven phases passed using one fresh persistent profile across sequential launches |
| Deliberately hung editor Definition provider | One-second request warning observed; complete graph recovered without dismissing the warning |
| Editor-managed MATLAB Viz log | Present; options, original MATLAB error, and successful completion counts verified |
| VSIX contents | 14 entries; version/activation event checked; no tests, profiles, logs, node_modules, or validation artifacts |

The final suite contains 36 deterministic checks and one opt-in real MATLAB
integration test. All 37 passed together with MATLAB enabled; the complete
run took approximately 100 seconds.

## Real editor restoration checks

The startup test extension runs in normal editor mode with isolated settings,
extensions, workspace storage, and a loopback-only debugger connection. This
is important: `--extensionTestsPath` uses an in-memory editor-state database,
which cannot validate real application restarts.

The final seven-phase run verified:

1. An outgoing function graph expands from depth one to two, moves into an
   auxiliary window, and saves its node selection, dependency filter, grid
   layout, search, visibility controls, positions, and custom zoom.
2. A full application restart restores that exact view. The first Show command
   does not run analysis. Refresh from an unrelated source cursor still uses
   the original function, outgoing direction, and depth two.
3. Actual Reload Window retains the auxiliary graph and view. Refresh retains
   the original context, and the restored tab list contains one graph tab.
4. A variable-reference graph saves a selected edge, occurrence-line details,
   and custom viewport.
5. Full restart restores that reference view and Refresh uses the original
   variable anchor, not the current unrelated cursor.
6. Actual Reload Window preserves the reference view and Refresh target.
7. A deliberately unresponsive Definition provider reaches the one-second
   request limit, produces an explicit analysis warning, and remains bounded.
   Disposing the provider and refreshing restores three symbols/two calls
   without dismissing its warning notification.

The reference provider is a test fixture returning known variable occurrences;
this checks the real editor API, controller, graph, and restoration lifecycle,
not the completeness of the third-party MATLAB provider. Function tests use
the extension's production syntax fallback over four real MATLAB files.

Initial runs exposed two additional issues: generic file-service replacement
could briefly remove the canonical cache name, and a lazily restored graph tab
could cause Show to create a duplicate docked panel. Local caches now use a
same-directory native atomic rename, and Show activates an existing graph tab
before its serializer completes. Deterministic regressions cover both paths.
An exact-transform assertion was also corrected to explicitly customize the
reference viewport: automatic Fit legitimately recalculates when the editor's
window dimensions change.

## MATLAB commands, logs, and exports

The separate real-editor command harness again verified Project analysis,
unchanged cache after a missing-project error, retries with untouched error
notifications, retries after function/reference input errors, and a missing
registered file producing four nodes, one edge, one missing node, and one
warning. Its JSON/DOT/CSV artifacts were written successfully.

The opt-in real MATLAB runner checked singleton and single-edge JSON,
JSON/DOT/CSV exports, original file-limit/missing-project error messages,
Unicode paths, process cancellation, successful retry, and saved success,
failure, and cancellation logs. The real editor-managed `MATLAB Viz.log` was
also checked independently for options, `ProjectNotFound`, and a successful
`files=4, dependencies=1, notices=1` completion.

The unchanged MATLAB function tests and nine standalone artifacts remain
covered by the [0.3.5 validation](VALIDATION_0.3.5.md); they were not all rerun
for this TypeScript/webview-only repair. No four-minute repository scan was
required from the user.

## Evidence on the development machine

Artifacts under `.tools/validation/0.3.6/` are excluded from Git and the VSIX:

- `runner-summary.json`, `runner-*.log`, and `runner-one-edge.{json,csv,dot}`.
- `commands/vscodium-host-result.json`, `vscodium-host.log`,
  `host-missing-project.{json,csv,dot}`, stdout/stderr, and the isolated profile.
- `commands/profile/logs/.../exthost/daw-0.matlab-viz/MATLAB Viz.log`.
- `final-restoration/*-result.json`: seven final, explicitly passing phases.
- `final-restoration/expected-*-view.json`, reload markers, assertion logs,
  and per-phase stdout/stderr.
- `final-restoration/persistent-profile-*/logs/.../MATLAB Viz.log`:
  editor-managed restoration, analysis, and recovery logs.

Earlier diagnostic runs/profiles are retained. Their expected or superseded
failures are not the final outcome; use the final phase result files.

## Remaining limitations

Legacy call graphs do not contain their caller/callee direction. They remain
viewable but require one fresh function command before Refresh. Invalid cached
Refresh targets never silently become repository scans. Editor settings still
control whether windows/tabs themselves reopen; the extension adopts the panel
the editor restores rather than forcing a new desktop window.

Cross-platform and older editor versions have not been exercised. Visual
export framing, arrowheads, raster resolution, layout/dragging defects,
reference completeness, external-folder resolution, and other items in the
[acceptance record](ACCEPTANCE_TESTS.md) remain separate work. Showing or
visually exporting an unchanged graph no longer resets its selection/filter
state, but that is not a claim that SVG/PNG exports are fully repaired.

The private VSIX still reports the existing missing-distribution-license
warning. Public publication remains deferred.
