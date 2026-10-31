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
codium --install-extension .\matlab-viz-0.3.5.vsix
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
remaining work. A passing data-export regression does not imply that the
known webview SVG/PNG framing and layout defects are repaired.

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

## Release checklist

1. Choose and add a distribution license.
2. Update `CHANGELOG.md` and the version in `package.json`.
3. Run TypeScript, unit, MATLAB Code Analyzer, and integration tests.
4. Build and inspect the VSIX contents.
5. Install the VSIX into a clean VSCodium profile.
6. Test Project and folder modes on Windows; test folder mode on macOS/Linux when available.
7. Tag the commit and attach the VSIX to the GitHub release.
