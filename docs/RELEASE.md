# Local release procedure and public-release gates

## Current release: 0.3.22

The [GitHub icon release](https://github.com/DAW-0/matlab-viz/releases/tag/v0.3.22)
and [Open VSX 0.3.22](https://open-vsx.org/extension/daw-0/matlab-viz/0.3.22)
contain the new four-node gallery artwork. SHA-256:
`42c45b3ef68cf09183be7c906877cff90e3e958adaf362fcd7100cec927bedf2`.
Two independent clean builds matched those exact bytes; all four source/package
CI jobs passed, including cross-platform PNG reproduction. Local validation
passed 211 tests with two optional MATLAB-process tests skipped. The analysis
runtime is byte-identical to 0.3.21; full native integration was not rerun for art.
See [0.3.22 validation](VALIDATION_0.3.22.md) and [artwork](BRANDING.md).

Namespace claim [15194](https://github.com/EclipseFdn/open-vsx.org/issues/15194)
is awaiting external approval. The separate OIDC workflow is prepared, not yet
registered/activated; retain the working token until migration is verified.

## Initial public release: 0.3.21

Version 0.3.21 is an MIT-licensed public preview. On 3 November 2026 the maintainer
authorized public GitHub visibility, source/tag pushes, a GitHub release and
Open VSX publication. The repository and immutable `v0.3.21` tag are public;
the [GitHub release](https://github.com/DAW-0/matlab-viz/releases/tag/v0.3.21)
provides the tested VSIX. A downloaded release asset matches SHA-256
`85a059996960ebd6d42a03f56d20ba35733b5f4ec09ec841a131913afdf2b9d9`.

Open VSX 0.3.21 was published on 3 November 2026 as
[`daw-0.matlab-viz`](https://open-vsx.org/extension/daw-0/matlab-viz).
The [successful publishing run](https://github.com/DAW-0/matlab-viz/actions/runs/41629809567)
verified the public version and downloaded bytes against the same SHA-256.
The namespace exists but is not yet verified; trusted publishing is not enabled.
See [Open VSX operations](OPEN_VSX.md) for credential boundaries and next steps.
Microsoft Marketplace publication has not been authorized as part of this Open VSX-first step.
Private vulnerability reporting is enabled and confirmed by the GitHub API.
The release source's four Windows/Linux Node CI jobs passed, including audit,
tests and repeated-package byte equality; those are not Linux MATLAB/editor tests.

The procedure below packages locally only. Actual publication is a separate
explicit action. The tagged source/VSIX retain their preparation-time hold
wording; these current notes supersede it without moving tags or rebuilding bytes.

## Supported/tested scope

See [SUPPORT.md](../SUPPORT.md). The integration evidence is local Windows x64,
VSCodium 1.143.17232 and MATLAB/Simulink R2026b with controlled fixtures. It is not
a VS Code/macOS/Linux/older-MATLAB support matrix. This release's build is
validated with Node.js 26.13.0. Development tools require Node 22.13.x+ on the 22
line, or Node 24+; the committed lockfile fixes dependency versions.

## Development-tool advisory remediation

ESLint 8's legacy eslintrc/glob/rimraf chain is replaced with ESLint 10.14.0 and
the TypeScript-ESLint 8.72.1 flat configuration. Recommended TypeScript linting
remains enabled; existing intentional `no-explicit-any` policy is unchanged.

Upstream ESLint/VSCE/TypeScript-ESLint still request minimatch 10.2.6, affected by
[GHSA-g3hv-75wg-m249](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249).
The override is deliberately limited to **minimatch 10.2.6 → 11.0.1**, not every
historical major. The v11 changelog removes `makeRe`, `regexp`, `AST` and internal
methods; the inspected consumers here use the retained `minimatch()` function
and `Minimatch.match()` API. Toolchain contract tests, actual lint-file selection,
full packaging/exclusion checks and clean-source builds guard that compatibility.
This is a reviewed temporary cross-major mitigation, not an upstream support
guarantee. Remove/reassess it when parent dependencies officially adopt a patched
version, and do not replace older APIs blindly just to silence audit output.
The pre-existing MSAL override remains unchanged. No npm development tool is
bundled as an extension runtime dependency.

## Validation before the source commit

```powershell
npm ci --ignore-scripts
npm audit --audit-level=moderate
npm run check
npm run lint
npm run test:compile
npm test
npm run build
npm run package -- --out .tools/validation/0.3.21/preflight.vsix
npm run package:check -- .tools/validation/0.3.21/preflight.vsix
```

Create the preflight output directory first if absent; choose a new output name
instead of overwriting a previously verified artifact. Re-run the documented
private-profile native comparison/impact/entry-report phases after host/panel or
packaging changes. They do not require running WEST source. MATLAB-process tests
are opt-in and their skipped status must be recorded rather than called passed.

Review the diff, include all required source/tests/docs in Git, and inspect staged
files for private data. Do not stage `.tools`, caches, real repository graph
exports, credentials or `node_modules`. Update the version/changelog, commit,
and create a new local annotated tag `v<package version>` pointing at that commit.
Never move an existing release tag silently.

## Committed/tagged reproducible package

With a clean worktree and local tag pointing at HEAD:

```powershell
npm run package:release
```

The default output is
`.tools/releases/v0.3.21/matlab-viz-0.3.21.vsix`. Use `-- --out <new-path.vsix>`
to choose a different new output. The script refuses dirty/untracked source,
missing/mismatched tags and existing output files. It pins documentation links
to that tag, sets ZIP ordering/timestamps from the commit's `SOURCE_DATE_EPOCH`,
packages locally, and checks the result. It does not create tags for you.

`.gitattributes` keeps text LF-normalized in clean checkouts. Build from two
fresh local clones of the tag with the same lockfile, Node/npm and OS, run
`npm ci --ignore-scripts` and `npm run package:release` in both, then compare the
VSIX SHA-256 hashes. Matching hashes establish byte reproducibility in that
tested environment—not an untested cross-OS/tool-version guarantee. Preserve the
commit ID, tool versions, hash and test evidence. Packages must include MIT
LICENSE, security/support policy, user guides and the runtime, and exclude tests,
private profiles, build scripts and dependency trees.

## Local installation

```powershell
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
codium --install-extension ".tools/releases/v$version/matlab-viz-$version.vsix" --force
```

Reload the user editor explicitly; release tooling must not reload or relocate
the user's graph window. Verify the installed version and runtime/renderer hashes.

## Publication gates and current status

1. Review the source and documentation for organizational/proprietary data and
   confirm permission to distribute any contributed or third-party material.
2. The reviewed source/tag and immutable VSIX are now public on GitHub with
   explicit permission. Tag-pinned package links resolve to the release source;
   user guides are also included in the VSIX for offline use.
3. GitHub private vulnerability reporting is enabled and confirmed by the public
   repository's authenticated status API. This is not an independent external
   account submission test. See [SECURITY.md](../SECURITY.md).
4. Confirm publisher ownership/authentication separately for the Visual Studio
   Marketplace and Open VSX. Open VSX requires its namespace and Publisher
   Agreement. Do not sign an agreement or create/use publication tokens silently.
5. GitHub and Open VSX both provide the verified immutable VSIX. Future versions
   require reviewed release bytes and explicit publication authorization; the
   current bootstrap workflow is pinned to 0.3.22. Microsoft Marketplace remains separate.

CI's four Windows/Linux Node jobs passed on the published release commit. They
have no publication step and do not establish MATLAB/editor integration support.
