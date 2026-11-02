# 0.3.21 release-preparation validation

Validated locally on 2 November 2026 with Windows x64, VSCodium 1.143.17232,
Node.js 26.13.0 and the locked npm dependency tree. MATLAB integration evidence
is R2026b; no broader editor/platform/MATLAB support is inferred.

## Checks completed before the release source commit

- TypeScript check, ESLint 10 flat-config lint and test compilation passed.
- Node suite: 211 tests, 209 passed, 0 failures, 2 opt-in MATLAB-process tests
  skipped. This release-preparation change does not alter MATLAB analyzer code.
- All four reviewed consumers resolve patched minimatch 11.0.1. Contract tests
  check retained match APIs, actual lint-file selection/rule enforcement,
  exclusions and a bounded amplified-glob preprocessing probe.
- Full npm advisory check: zero informational/low/moderate/high/critical entries.
- Preflight VSIX contains MIT LICENSE.txt (normalized by VSCE), support/security
  policy, user guides and runtime; no tests, private profiles, build scripts or
  dependency tree. Package-content validation passed without a license warning.
- Ten native-editor phases passed in separate fresh private profiles: prepare/
  compare/restore/reload comparison, impact/restore/reload, and entry-report/
  restore/reload. These exercise actual save/load/report/graph exports, log
  files, failure recovery, source-cache preservation and exact restored views.
  They do not run WEST source/controller/simulation code.

## Reproducible release artifacts

Follow [RELEASE.md](RELEASE.md): use reviewed committed source, a local tag, LF
checkouts, locked dependencies and commit-derived ZIP timestamps. Preserve exact
commit/hash and two-clean-checkout reproduction results with the local release
artifacts under `.tools/validation/0.3.21/`; do not commit private profiles.
The public tag/source and registry-upload steps require separate permission.

## Security reporting and remaining publication gates

MIT is selected. The maintainer confirmed GitHub private vulnerability reporting
is enabled. The repository remains private and the reporting-status API returned
404, so external public-form availability is not independently claimed. Verify
that form after an explicitly authorized visibility change. No visibility,
publisher account, agreement, token, push or upload is changed by local release
preparation. Remote CI jobs are configured, not claimed to have run locally.
