# 0.3.23 activity-bar identity validation

3 November 2026, Windows x64, Node.js 26.13.0. This update changes the monochrome
activity-bar SVG, version metadata, documentation and related tests. The colored
marketplace PNG, graph runtime and MATLAB helpers are unchanged.

- TypeScript, ESLint, test compilation and icon reproduction checks passed.
- Node suite: 214 total, 212 passed, zero failures, two opt-in MATLAB-process
  tests skipped. Native/MATLAB acceptance evidence from 0.3.21 is carried forward,
  not represented as a new full integration run for this artwork-only change.
- New regression verifies four corner nodes, three arrow paths, a filled
  upper-left anchor, transparent 24-pixel viewBox, self-contained markup and
  `currentColor`-only strokes/fills. Light/dark foreground render checks passed;
  the actual-size preview was visually inspected on both backgrounds.
- Two packages from the same clean tagged checkout produced identical bytes.
  This is a repeat-build check, not a claim of independent-checkout reproduction.
- Tagged source: `d972668cd32f1bf718207d0a520b4f8e3ee77cf9`, `v0.3.23`.
- VSIX SHA-256:
  `f047c8b961b77d7d1f0ef68d553f591cfa3a334a70ffc22147b520271b43e456`.
- Local VSCodium installation was updated to 0.3.23. Installed activity-bar SVG
  and gallery PNG hashes match the source; the editor was not automatically
  reloaded or the graph relocated. The maintainer confirmed the glyph looks right.
- Publisher notes remain excluded from Git and VSIX builds, unread and unstaged.

Ignored local evidence and release bytes are under `.tools/validation/0.3.23/`
and `.tools/releases/v0.3.23/`. The publishing workflow checks the same checksum
before upload and after downloading the registry artifact. Namespace verification
and trusted-publisher activation remain separate from this release's correctness.

## Publication close-out

The [GitHub release](https://github.com/DAW-0/matlab-viz/releases/tag/v0.3.23)
and [Open VSX 0.3.23](https://open-vsx.org/extension/daw-0/matlab-viz/0.3.23)
are public. [Publishing run 41636481880](https://github.com/DAW-0/matlab-viz/actions/runs/41636481880)
passed upload and public-download SHA-256 verification after registry processing.
The preceding credential-free dry run also passed. Source/package CI is green;
the final release/icon policy checks passed all seven focused tests.
No token values or publisher notes were read, staged, committed or uploaded.

Feature development is now maintenance-focused at the maintainer's request.
Namespace claim [15194](https://github.com/EclipseFdn/open-vsx.org/issues/15194)
remains open and the registry still reports the namespace unverified. OIDC is
prepared but not activated; the working token is retained until migration can
be verified. This follow-up does not prevent ordinary use of the extension.
