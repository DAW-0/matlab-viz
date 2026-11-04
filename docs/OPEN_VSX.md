# Open VSX publication

## Current state

Current public version: [0.3.23](https://open-vsx.org/extension/daw-0/matlab-viz/0.3.23).
Its VSIX SHA-256 is
`f047c8b961b77d7d1f0ef68d553f591cfa3a334a70ffc22147b520271b43e456`.
[Publication run 41636481880](https://github.com/DAW-0/matlab-viz/actions/runs/41636481880)
verified those registry bytes. No runtime release is needed for this migration.

Open VSX approved namespace `daw-0` on 4 November 2026:
[ownership request 15194](https://github.com/EclipseFdn/open-vsx.org/issues/15194)
is closed and the live namespace API reports `verified: true`.

The maintainer registered GitHub Actions trusted publishing.
[Verification run 41878905602](https://github.com/DAW-0/matlab-viz/actions/runs/41878905602)
succeeded: Open VSX issued a short-lived token, the CLI skipped existing version
0.3.22, and its downloaded VSIX checksum matched. No release was replaced and
no new version was invented to test authentication. The initial `ubuntu-latest`
run also eventually succeeded after queuing. The workflow now pins supported
Ubuntu 24.04 for image stability, not as a proven queue remedy.

The PAT bootstrap workflow has been removed (recoverable in Git history), and
the obsolete `OVSX_PAT` GitHub repository secret has been removed. **The maintainer
must still revoke the original token in Open VSX Settings → Access Tokens.**
Deleting a GitHub secret does not revoke its registry credential. No token value
was retrieved, printed, copied from local notes or committed during migration.

## Registered workflow identity

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `DAW-0` |
| Repository | `matlab-viz` |
| Workflow filename | `publish-openvsx-trusted.yml` |
| Environment | None currently declared or registered |

Keep the exact workflow filename unless the registry registration is migrated
too. Registrations are not branch pins: protect repository write/workflow access.
The job currently checks `refs/heads/main`; a protected publishing environment
with reviewers remains optional hardening, not a configured guarantee.

## Verification and future releases

```powershell
gh workflow run publish-openvsx-trusted.yml --repo DAW-0/matlab-viz --ref main --field operation=verify
```

The workflow is manual-only, main-only, checksum-pinned, has no source checkout
or repository lifecycle execution, and uses pinned Node setup/CLI versions.
Only its publishing job has `id-token: write`; there is no secrets reference or
PAT fallback. The official CLI uses `--trusted-publishing --skip-duplicate` and
keeps credentials out of logs and command arguments.

The current verification target deliberately remains immutable version 0.3.22,
SHA-256 `42c45b3ef68cf09183be7c906877cff90e3e958adaf362fcd7100cec927bedf2`.
Verify mode refuses to proceed if it is absent. The CLI exchanges OIDC before
upload, then skips duplicate-version rejection; public download identity/checksum
is checked afterward. No version is deleted or overwritten.

For a future release, review/update the pinned version/checksum and preconditions
together, complete release validation, publish the immutable GitHub asset, and
explicitly authorize the workflow's `publish` operation. Do not merely dispatch
`publish` expecting it to package arbitrary new source. Keep tags/bytes immutable.

## Credential and local-document safety

`matlab-viz-publishing.txt` is user-owned and excluded from Git and VSIX packaging.
It was not read, staged or uploaded. After revoking its obsolete token, remove
or sanitize the token value locally if desired; user-owned notes are not deleted
without permission. Ignore rules are not encryption.

The user-provided ownership PDF is preserved untracked and excluded from VSIX
builds. Ownership was confirmed through the live issue/namespace API, not by
publishing the local PDF.

Official reference: [Open VSX trusted publishing](https://github.com/eclipse-openvsx/openvsx/wiki/Trusted-Publishing).
