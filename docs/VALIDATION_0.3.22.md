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
