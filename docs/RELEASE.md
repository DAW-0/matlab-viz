# Local release procedure and public-release gates

Version 0.3.21 is an MIT-licensed development preview. Publication is on hold.
This procedure creates a local source commit/tag and VSIX; it never changes
GitHub visibility, pushes refs, creates a GitHub release, or uploads to a registry.

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

## Remaining public-publication gates — explicit permission required

1. Review the source and documentation for organizational/proprietary data and
   confirm permission to distribute any contributed or third-party material.
2. Decide when to push the reviewed source/tag. Relative packaged links are
   pinned to that tag, so they are not publicly accessible while the source is
   private/unpushed. User guides are also included in the VSIX for offline use.
3. The maintainer confirmed GitHub private vulnerability reporting is enabled.
   Verify an external signed-in reporter can access the private form once public;
   the API currently returns 404 while this repository is private. Do not change
   visibility just to perform this check. See [SECURITY.md](../SECURITY.md).
4. Confirm publisher ownership/authentication separately for the Visual Studio
   Marketplace and Open VSX. Open VSX requires its namespace and Publisher
   Agreement. Do not sign an agreement or create/use publication tokens silently.
5. Authorize registry upload and any GitHub release explicitly. Then publish the
   verified immutable VSIX, not an unreviewed rebuild. Until that authorization,
   all actions remain local and no release/publisher account changes are made.

CI is configured for source/lint/unit/package checks on Windows/Linux Node jobs;
it has no publication step and does not establish MATLAB/editor integration
support. This local preparation does not push refs or trigger a new remote CI run.
