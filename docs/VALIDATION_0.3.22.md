# 0.3.22 marketplace-icon validation

3 November 2026, local Windows x64, Node.js 26.13.0. This release changes gallery
art/metadata, development tooling and publication documentation, not analysis.

- TypeScript check, ESLint, test compilation and deterministic tests passed:
  213 total, 211 passed, zero failures, two optional MATLAB-process tests skipped.
- New tests verify four-corner geometry, dependency/impact description,
  self-contained SVG, PNG signature/dimensions, manifest wiring, unchanged
  activity-bar icon, exact vector-to-PNG reproduction and 32-pixel rendering.
- The 256-pixel PNG and a 32-pixel thumbnail were visually inspected. Artwork
  uses no MathWorks marks, text, fonts, scripts, remote resources or SVG filters.
- Full npm audit reports zero vulnerabilities. The pinned SVG renderer is
  development-only and excluded from installed extension runtime dependencies.
- Preflight VSIX package validation passed with the PNG and SVG source included.
  Package checks enforce PNG signature, 256-by-256 dimensions and preview metadata.
- Generated `dist/extension.js` SHA-256 exactly matches the clean 0.3.21 runtime:
  `9eafcddb09865c31c06189dfb09bc3f5c53c274d2bb14f348eb8b7f26af8bbf0`.
  The graph scripts and MATLAB analysis helpers are unchanged. Earlier 0.3.21
  native/MATLAB acceptance evidence is carried forward explicitly; those native
  suites were not rerun merely for gallery art.
- User-owned `matlab-viz-publishing.txt` remains ignored by both Git and VSIX
  packaging. It is not read, staged, uploaded or included in the release.

The 0.3.21 source tag and VSIX remain immutable. Clean-tag reproduction, release
artifact identity and publication results are recorded with ignored local
artifacts under `.tools/validation/0.3.22/`. Namespace claim
[15194](https://github.com/EclipseFdn/open-vsx.org/issues/15194) is external review;
it is not a verified-publisher or completed OIDC claim.

## Release and installed-artifact evidence

- Source commit `0ce1cb606dbc0c36905923da4f79e7606631fd54`, tag `v0.3.22`.
- Main build and independent clean checkouts A/B produced SHA-256
  `42c45b3ef68cf09183be7c906877cff90e3e958adaf362fcd7100cec927bedf2`.
- Release-source CI passed on Windows/Linux with Node 22 and 26.13.0, including
  exact vector-to-PNG checks and repeated package byte equality.
- A fresh private VSCodium profile installed the release VSIX; the installed
  gallery-icon manifest path and PNG bytes match the source. The initial direct
  GUI-executable invocation returned before installation; the waited CLI
  invocation passed. The normal editor profile was not changed by this test.
- Open VSX's exact-version endpoint serves 0.3.22 and its icon PNG matches the
  original artwork byte-for-byte. Publication/verification evidence is
  [run 41632816454](https://github.com/DAW-0/matlab-viz/actions/runs/41632816454).
- Both publishing workflows were YAML-parsed and all Bash blocks syntax-checked.
  Static checks enforce manual-only triggers, main-only jobs, fixed artifact
  checksum, bootstrap PAT isolation and no OIDC PAT fallback. These do not prove
  registry registration: the trusted workflow is not yet activated.
