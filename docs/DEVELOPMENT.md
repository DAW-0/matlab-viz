# Development

## Toolchain

- Node.js LTS
- npm
- MATLAB
- VSCodium or VS Code 1.95+

Install and validate:

```powershell
npm install
npm run check
npm run lint
npm run test:compile
npm test
npm run build
```

Press `F5` from the repository to start an Extension Development Host. The launch configuration runs the build task first.

## Packaging

```powershell
npm run package
```

The package script type-checks and bundles the extension before invoking `vsce`. Install the resulting VSIX with:

```powershell
codium --install-extension .\matlab-viz-0.3.11.vsix
```

## MATLAB-only validation

The public folder analyzer can be tested without loading the extension:

```matlab
addpath("matlab")
report = analyzeMatlabFileDependencies(sourceRoot,Print=false);
```

Run its MATLAB function tests with:

```matlab
addpath("matlab")
results = runtests("test/matlab");
assertSuccess(results)
```

To test the extension JSON bridge, create an options JSON document matching
`AnalysisOptions`, then call:

```matlab
addpath("matlab")
MatlabVizAnalyze(sourceRoot,outputJson,optionsJson)
```

Run MATLAB Code Analyzer before committing changes:

```matlab
checkcode("matlab/analyzeMatlabFileDependencies.m","-id")
checkcode("matlab/MatlabVizAnalyze.m","-id")
```

## Controller, process, and export regressions

`npm test` runs Node tests for graph validation, exports, MATLAB diagnostics,
and the controller. Controller tests execute the compiled controller against
VS Code adapters and deliberately leave notification promises unresolved.
They verify retries, preservation of the previous graph/Refresh target,
cancellation, and late notification actions. They do not simulate the actual
VSCodium notification UI.

The real MATLAB runner test is opt-in so CI can run without a MATLAB license:

```powershell
$env:MATLAB_VIZ_TEST_EXECUTABLE = 'C:\Program Files\MATLAB\R2026b\bin\matlab.exe'
$env:MATLAB_VIZ_TEST_ARTIFACTS = 'E:\_Git\matlab-viz\.tools\validation\0.3.5'
npm run test:compile
npm test
Remove-Item Env:\MATLAB_VIZ_TEST_EXECUTABLE
Remove-Item Env:\MATLAB_VIZ_TEST_ARTIFACTS
```

It runs the production process runner with MATLAB, verifies single-item JSON
and Unicode paths, generates JSON/DOT/CSV exports, and checks saved success,
failure, and cancellation logs. It also verifies actual MATLAB exception
messages and successful retry after cancellation. Only the VS Code output and
cancellation interfaces are adapted; MATLAB and the filesystem are real.
Artifact logs are saved by the harness from the production runner's output.
VSCodium manages the installed extension's own log-output-channel files.

## Actual VSCodium host tests

The `test/host/index.ts` entry point runs against the installed editor's real
command, notification, webview, configuration, and cache APIs. It verifies file
analysis retries while error notifications remain untouched, retries after
function/reference input errors, the unchanged cache after a failure, and a
missing-file Project result with one edge and one warning. The real MATLAB Viz
output channel also produces a log under the isolated editor profile.

Build with `npm run test:compile` and `npm run build`. Set these environment
variables to absolute paths:

- `MATLAB_VIZ_TEST_EXECUTABLE`: the MATLAB executable.
- `MATLAB_VIZ_TEST_ARTIFACTS`: destination for the host log, result JSON, and exports.
- `MATLAB_VIZ_HOST_PROFILE`: a fresh editor user-data directory.
- `MATLAB_VIZ_HOST_FIXTURES`: a fresh fixture directory.

Prepare the fixtures in a separate MATLAB process using
`createMatlabVizHostFixtures` from `test/matlab`. The helper intentionally refuses
to overwrite an existing directory. Then launch the installed editor with:

```powershell
codium --new-window --wait --disable-extensions --disable-workspace-trust `
  --user-data-dir "$env:MATLAB_VIZ_HOST_PROFILE" `
  --extensions-dir "$env:MATLAB_VIZ_HOST_PROFILE\extensions" `
  --extensionDevelopmentPath 'E:\_Git\matlab-viz' `
  --extensionTestsPath 'E:\_Git\matlab-viz\dist-test\test\host' `
  "$env:MATLAB_VIZ_HOST_FIXTURES\project"
```

Use the separate profile to avoid changing the user's installed settings or
workspace cache. When launching the Electron executable directly instead of
the CLI, remove inherited `ELECTRON_RUN_AS_NODE` from that test process first;
the Codex terminal can set it. Capture its stdout/stderr and wait for its exit
code. No code in this harness closes or edits the user's normal windows.

MATLAB function tests cover raw JSON array syntax at zero/one/many cardinality,
missing Project files, and all nine standalone export artifacts, including
vector SVG, raster PNG, and MAT report reloading.

See [acceptance findings](ACCEPTANCE_TESTS.md) for the manual test history and
remaining work. Data-export tests and actual browser-renderer tests cover
different paths; run both when changing visual exports.

## Persistent-window restoration tests

The startup harness in `test/host/extension` runs against a normal, isolated
editor profile. It does not use `--extensionTestsPath`: that mode uses an
in-memory editor-state database and cannot verify full application restarts.
The harness uses only fixtures and profiles under the chosen artifact root.

```powershell
npm run test:compile
npm run build
& .\test\host\runRestoration.ps1 `
  -FixturesRoot 'E:\_Git\matlab-viz\.tools\validation\0.3.5\host-fixtures' `
  -ArtifactsRoot 'E:\_Git\matlab-viz\.tools\validation\0.3.6\final-restoration'
```

Prepare the fixtures with `createMatlabVizHostFixtures` as described above.
Pass `-EditorExecutable` to use another installed desktop editor. Each suite
creates a fresh profile but reuses it across its seven sequential phases:

1. Build an outgoing graph; change depth, select/filter, set layout/search,
   customize zoom, and move its editor to an auxiliary window.
2. Restart the application; compare the exact view state and Refresh from an
   unrelated source cursor, checking the original outgoing function/depth.
3. Invoke actual Reload Window; repeat view and Refresh-target checks.
4. Build a variable-reference graph and select its reference edge/details.
5. Restart; compare the view and Refresh the original variable anchor.
6. Reload Window; repeat reference restoration and Refresh checks.
7. Register a deliberately unresponsive Definition provider; verify the
   one-second request warning and recovery after disposing that provider.

The test-only debugger adapter connects to a loopback Chromium debug port on
the isolated editor. It reads actual webview DOM state and dispatches UI events;
it is not shipped in the VSIX. Result JSON files must be fresh and explicitly
report success, since a normally quitting editor can exit zero after a test
failure. Stdout/stderr, assertion logs, snapshots, profiles, and the real
editor-managed MATLAB Viz logs are retained for diagnosis.

Unit tests separately cover delayed cache loading, invalid caches/targets,
legacy graph handling, atomic-save failure, panel adoption without relocation,
and malformed or stale webview state.

## Real-renderer and visual-export tests

The same isolated startup harness has an optional `visual` phase:

```powershell
npm run test:compile
npm run build
& .\test\host\runRestoration.ps1 `
  -FixturesRoot 'E:\_Git\matlab-viz\.tools\validation\0.3.5\host-fixtures' `
  -GraphFile 'E:\_Git\matlab-viz\.tools\validation\0.3.5\west-control-fresh.json' `
  -ArtifactsRoot 'E:\_Git\matlab-viz\.tools\validation\0.3.7\visual-new-run' `
  -Phases visual
```

Supply a complete MATLAB Viz JSON graph with `-GraphFile` (or
`MATLAB_VIZ_TEST_GRAPH`), preferably a large graph with an ordinary single-edge
dependency suitable for a two-node trace. The retained 515-file/648-edge
repository snapshot was used for this release. The snapshot is not committed.
Use a fresh artifact directory so save dialogs do not ask to overwrite files.

The phase seeds only its isolated cache, without rerunning the repository
analyzer. It checks real SVG node rectangles and text measurements in all four
layouts, pairwise overlaps, and Fit clipping. It exercises the actual export
format/framing/resolution pickers and saves files through the editor's simple
file dialog, enabled only in this isolated profile. SVG is parsed by the
browser's XML parser and checked for vector nodes, complete arrowed edges,
and no embedded bitmap. PNG is decoded and inspected for dimensions and
nonblank pixels. A deliberate oversized PNG must produce an actionable error.

Trusted Chromium mouse events verify click selection, panning without losing
the trace, rapid dragging, pointer-capture recovery, and node DOM identity.
The harness retains images, screenshots, pointer-event JSON, result JSON, and
editor-managed output logs. Export destination persistence, cancelled/failed
saves, and error messages also have deterministic controller-adapter tests.

`media/graphGeometry.js` is the shared browser/Node geometry module. Tests
cover 515 varied rectangles, a 5,000-node chain, cycles, boundary intersections,
self-loops, XML/Unicode label preservation, viewport-independent SVG, and
explicit PNG limits. Fake-DOM state tests cover legacy-geometry migration,
captured clicks/double-clicks, drag DOM stability, panning, and extreme zoom.

The debugger adapter auto-attaches recursively to nested editor frames and
reconnects closed targets. This is test infrastructure only, not an extension
debugging port or shipped application dependency.

## Reference and folder-lookup accuracy tests

The deterministic suite includes the production reference index/resolver/merge
logic with adapted provider APIs. It covers declaration-only and partial
providers, local/private/package conflicts, obvious array bindings, recursion,
dirty buffers, Unicode masks, cancellation, node caps, and incomplete indexes.
It also verifies resource-scoped folder lookup configuration and notification
severity. There are 74 deterministic tests and one opt-in real MATLAB runner
test in 0.3.8; the MATLAB-only suite contains 13 tests.

The native `accuracy` phase registers real editor Definition/References
providers and executes the extension's commands. It creates its own fixture
workspace under a fresh artifact root and deliberately refuses to overwrite
existing files. `-WorkspaceRoot` must point to that child workspace:

```powershell
$accuracyRoot = 'E:\_Git\matlab-viz\.tools\validation\0.3.8\accuracy-new-run'
New-Item -ItemType Directory -Path "$accuracyRoot\workspace"
& .\test\host\runRestoration.ps1 `
  -FixturesRoot 'E:\_Git\matlab-viz\.tools\validation\0.3.5\host-fixtures' `
  -ArtifactsRoot $accuracyRoot `
  -WorkspaceRoot "$accuracyRoot\workspace" `
  -Phases accuracy
```

This phase checks grouped syntax recovery, mixed evidence, variable boundaries,
hung-provider warning/recovery, actual MATLAB workspace/explicit lookup roots,
external exclusion, opt-out, selected-source file limits, and retry after an
invalid lookup root without dismissing the error notification. Its real output
channel logs are retained under the isolated profile.

The separate `repository-accuracy` phase is a read-only check of the existing
WEST checkout (not a general repository fixture). Pass its workspace root and
a different fresh artifact directory. It expects the known heating-control
caller at line 134 and `tar_file_path` occurrences at lines 9, 10, 14, and 16;
it checks the two inspected sources are byte-for-byte unchanged. It does not
modify user settings or user source files. The normal fixture root is still
required by the launcher.

For the actual MATLAB lookup comparison, run this helper in a separate MATLAB
process, with `matlab` and `test/matlab` on the path:

```matlab
summary = validateMatlabVizAccuracy(artifactsRoot, westRepositoryRoot);
assert(summary.passed)
```

It compares selected-folder analysis on a clean MATLAB path, with workspace
lookup, and with external nodes excluded; it also writes the standalone report
artifacts. This is checkout-specific validation, not a portable CI assertion.
All test helpers, profiles, logs, and artifacts are excluded from the VSIX.

## Details-panel resizing tests

The 0.3.9 suite adds seven deterministic webview tests (81 deterministic tests,
plus the existing opt-in MATLAB runner test). They check rapid dragging without
node replacement, pointer/cancellation/capture handling, keyboard steps and
accessible values, bounds, reset, malformed/legacy state, new-result persistence,
temporary narrow-window clamping, and fitted/custom viewport behavior.

The existing `visual` phase also tests actual divider dragging and keyboard
input through Chromium, computed grid widths, stable graph DOM/trace/custom
zoom, and fitted canvas changes. It closes sidebars only in the isolated profile
to expose the divider above the existing 800px compact breakpoint. The restart
and Reload Window phases now compare custom details widths in their snapshots,
including detached call/reference views and Refresh. Use a fresh artifact root
under `.tools/validation/0.3.9/` with the earlier launcher examples.

No production MATLAB analysis code changes in this batch; its 13-test suite was
last fully exercised in 0.3.8. Rerun it whenever the MATLAB helpers change.
See [0.3.9 validation](VALIDATION_0.3.9.md) for the final observed results.

## Retained-graph status and analysis-policy tests

The 0.3.10 suite has 89 deterministic tests plus the opt-in real MATLAB runner
test. Eight new tests cover retained failure/cancellation status, cache/model
immutability, successful clearing, actual requested external policy, panel
message delivery, settings navigation, same-graph restoration, malformed status,
graph-specific relationship wording, and independent visibility/policy controls.

The native `clarity` phase uses the existing four-file Project fixture as a
folder. It runs actual MATLAB analysis, lowers Maximum Files to provoke an
error, checks the preserved cache/view/banner, and retries through the banner
with the error notification untouched. It changes Include External, verifies
that the recorded policy changes only after successful analysis, checks the
visibility filter does not run analysis, opens the actual settings UI, and
exercises real call/reference commands and their headings/traversal labels.

Use the restoration launcher with a fresh artifact root and `-Phases clarity`;
set `MATLAB_VIZ_TEST_EXECUTABLE` first. The existing restart/Reload Window phases
also provoke a missing-root error before saving their snapshots, verifying that
the notice restores with the same detached view and clears after success.
Condition-based UI waits are required: command completion intentionally does not
wait for notification dismissal or for every webview message to paint.

The visual phase seeds a graph cache before activation. Run it first in a fresh
profile, or in its own launcher invocation; running it after another phase can
leave a controller already holding that phase's cached graph. See
[0.3.10 validation](VALIDATION_0.3.10.md) for final artifact directories and scope.

## Licensed Simulink validation

The 0.3.11 Node suite contains 90 deterministic tests and one opt-in MATLAB runner
test. The new deterministic check verifies binary model navigation delegates to
`vscode.open`, never forced text loading or an extension-issued MATLAB command.
The MATLAB suite has 23 tests: the existing 13, an unreadable-model regression,
and nine licensed generated-model tests. Unavailable Simulink/license is reported
as incomplete coverage, not a passing licensed test.

Run `runtests("test/matlab")` in a separate MATLAB process and require
`assertSuccess(results)`. The fixture factory refuses an existing destination or
an already-open Project. Generated binaries and reports must remain outside Git
and the VSIX. The [Simulink guide](SIMULINK_VALIDATION.md) explains native graph
comparison, code-execution markers, direct-reference scope, and unvalidated cases.

To retain a fixture for editor tests:

```matlab
addpath("matlab", "test/matlab")
probeMatlabVizSimulink(artifactsRoot)
```

Then, in the test shell:

```powershell
$env:MATLAB_VIZ_TEST_EXECUTABLE = 'C:\Program Files\MATLAB\R2026b\bin\matlab.exe'
$env:MATLAB_VIZ_SIMULINK_FIXTURE = 'E:\_Git\matlab-viz\.tools\validation\0.3.11\probe-metadata\fixture\fixture.json'
& .\test\host\runRestoration.ps1 `
  -FixturesRoot 'E:\_Git\matlab-viz\.tools\validation\0.3.5\host-fixtures' `
  -ArtifactsRoot 'E:\_Git\matlab-viz\.tools\validation\0.3.11\native-models-new' `
  -Phases simulink
```

Use fresh directories when rerunning the probe/launcher. The native phase checks
automatic Project detection, parameter-setting Refresh, folder scope warnings,
external/isolated filtering, classification, and unchanged fixture source bytes.
Normal editor settings, user projects, and WEST model files are not changed.
The separate full renderer/restoration suite remains required when editor UI or
navigation code changes. See [0.3.11 evidence](VALIDATION_0.3.11.md).

## Grouping validation (0.3.12)

`media/graphGrouping.js` is a DOM-free projection, loaded before `graph.js` with
the same CSP nonce as the geometry helper. New tests load the actual production
helper into Node VM realms, not reimplemented grouping logic. The current Node
suite includes projection conservation, package/root/duplicate/external path
cases, 5,000-node aggregation, original-hop tracing, exact restore, grouped drag,
symbol terminology, visibility/missing flags, and grouped SVG assertions. The
existing real-MATLAB process/log/export test remains opt-in through
`MATLAB_VIZ_TEST_EXECUTABLE`; the complete MATLAB suite remains 23 tests.

Run fresh native profiles with:

```powershell
$env:MATLAB_VIZ_TEST_EXECUTABLE = 'C:\Program Files\MATLAB\R2026b\bin\matlab.exe'
& .\test\host\runRestoration.ps1 `
  -FixturesRoot 'E:\_Git\matlab-viz\.tools\validation\0.3.5\host-fixtures' `
  -ArtifactsRoot 'E:\_Git\matlab-viz\.tools\validation\0.3.12\native-grouping-new' `
  -Phases @('grouping', 'restore-grouping', 'group-refresh')
```

The first two phases use a retained graph cache (override `-GraphFile` if needed),
real layouts/save dialogs/five exports, and a full application restart. The
third uses the existing four-file MATLAB fixture for actual Refresh and error
preservation. Run `grouping` first in a fresh profile. The old visual/clarity/
seven restoration phases remain independent regression requirements. Keep
generated profiles/logs/screenshots/models out of Git and the VSIX. See the
[grouping guide](GROUPING.md) for expected user behavior and boundaries.

## Release checklist

1. Choose and add a distribution license.
2. Update `CHANGELOG.md` and the version in `package.json`.
3. Run TypeScript, unit, MATLAB Code Analyzer, and integration tests.
4. Build and inspect the VSIX contents.
5. Install the VSIX into a clean VSCodium profile.
6. Test Project and folder modes on Windows; test folder mode on macOS/Linux when available.
7. Tag the commit and attach the VSIX to the GitHub release.
