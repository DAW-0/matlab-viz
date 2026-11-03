# Open VSX publication

Current version: [0.3.23](https://open-vsx.org/extension/daw-0/matlab-viz/0.3.23),
with matching marketplace and theme-aware activity-bar icons. VSIX SHA-256:
`f047c8b961b77d7d1f0ef68d553f591cfa3a334a70ffc22147b520271b43e456`.
The bootstrap targets these reviewed bytes. The prepared OIDC workflow deliberately
retains the already-published 0.3.22 verification target; it has not been activated.
Current publication evidence:
[run 41636481880](https://github.com/DAW-0/matlab-viz/actions/runs/41636481880).

Published on 3 November 2026:
[MATLAB Viz 0.3.21](https://open-vsx.org/extension/daw-0/matlab-viz).
[Workflow run 41629809567](https://github.com/DAW-0/matlab-viz/actions/runs/41629809567)
created the namespace, uploaded the immutable archive and verified the public
download's checksum. The preceding attempt was rejected for an invalid token;
the maintainer replaced the GitHub secret, without disclosing it in chat or source.
Namespace verification and OIDC migration are not yet completed.

The maintainer authorized requesting ownership on 3 November 2026. The request
is [EclipseFdn/open-vsx.org#15194](https://github.com/EclipseFdn/open-vsx.org/issues/15194),
with matching GitHub/namespace identity and public history evidence. Registry
approval is still required; the request itself does not grant ownership.

Publisher namespace: `daw-0`. Extension ID: `daw-0.matlab-viz`.
The initial release is the immutable, tested `matlab-viz-0.3.21.vsix` from the
GitHub `v0.3.21` release. Its SHA-256 is:

```text
85a059996960ebd6d42a03f56d20ba35733b5f4ec09ec841a131913afdf2b9d9
```

## Initial publication workflow

`.github/workflows/publish-openvsx.yml` is manually triggered, main-branch-only
and bound to the current reviewed release bytes. It has no push/release/PR trigger
and does not check out, execute or rebuild repository source. The first `check`
run downloads the GitHub asset, verifies its checksum, installs pinned `ovsx`
1.3.0 with lifecycle scripts disabled and checks the public registry. It does
not receive the publishing secret or create anything in Open VSX.

An explicit `publish` run receives repository secret `OVSX_PAT` only in the
namespace-create/upload step. The secret is an environment variable, never a
command-line argument or output. The workflow has read-only GitHub contents
permission; it neither creates nor retrieves the secret value through GitHub's
API. It creates `daw-0` only if absent, uploads the existing VSIX, then checks
the public version identity and downloads its bytes for SHA-256 verification.
An existing version is verified instead of overwritten. Registry scanning and
availability checks have bounded waits. A failed verification must be investigated,
not treated as permission to delete/re-publish an immutable version.

Dry run:

```powershell
gh workflow run publish-openvsx.yml --repo DAW-0/matlab-viz --ref main --field operation=check
```

Only after release authorization and successful checks:

```powershell
gh workflow run publish-openvsx.yml --repo DAW-0/matlab-viz --ref main --field operation=publish
```

The workflow intentionally has no arbitrary version, shell command, namespace,
registry URL or checksum input. Future releases need a reviewed version/hash
change or a separately reviewed release manifest design. The runtime VSIX/tag
are not rebuilt or moved by adding the workflow.

## Namespace verification and trusted publishing

### Prepared migration, awaiting registry approval

The current bootstrap targets 0.3.23 as recorded above. The prepared OIDC
verification target remains 0.3.22, SHA-256
`42c45b3ef68cf09183be7c906877cff90e3e958adaf362fcd7100cec927bedf2`.
The separate `.github/workflows/publish-openvsx-trusted.yml` is prepared but is
not registered/activated at Open VSX. Its publishing job has `id-token: write`,
no `secrets.OVSX_PAT` reference or token fallback, an explicit
`--trusted-publishing` flag, and a public namespace-verification precondition.
The working bootstrap remains available while ownership is under review.

After ownership is approved, the maintainer must register these exact fields
under Open VSX **Settings → Trusted Publishers** for `daw-0.matlab-viz`:

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `DAW-0` |
| Repository | `matlab-viz` |
| Workflow filename | `publish-openvsx-trusted.yml` |
| Environment | Leave blank for this prepared workflow; no environment is currently declared |

Review branch protection and a protected publishing environment before relying
on OIDC for long-term release access. If an environment is added, update both
the job and registry registration together; do not silently claim protection
that has not been configured.

The trusted workflow defaults to `verify`, requiring 0.3.22 already to exist.
It invokes the official CLI with `--skip-duplicate`: the CLI performs OIDC
exchange before upload, then treats the existing-version rejection as a skip.
This checks authentication without replacing release bytes; registry identity
and download checksum are also checked. The explicit `publish` mode can upload
the pinned artifact if absent. Neither mode deletes versions or rewrites source.
Do not call migration verified until an actual registered OIDC run succeeds.

Namespace creation allows initial publication but does not establish verified
namespace ownership. Follow Open VSX's [namespace ownership process](https://github.com/eclipse-openvsx/openvsx/wiki/Namespace-Access)
before claiming a verified-publisher badge. Filing an ownership request is public
external coordination and requires maintainer approval.

Open VSX currently requires namespace ownership, a signed Publisher Agreement
and at least one active extension version before registering a
[trusted publisher](https://github.com/eclipse-openvsx/openvsx/wiki/Trusted-Publishing).
Once eligible, review a workflow migration to short-lived OIDC publishing:
register the exact GitHub owner/repository/workflow, preferably a protected
environment, add `id-token: write` only to the publishing job and explicitly use
`--trusted-publishing`. The current bootstrap workflow has no OIDC permission
and must not be claimed to use trusted publishing.

Once the migration is verified, revoke the temporary Open VSX token and remove
its GitHub secret. Merely removing a secret does not revoke its registry token;
an `OVSX_PAT` still present in a migrated job overrides OIDC. Do not remove the
only working credential before the replacement path has been verified.

## Credential-file safety

`matlab-viz-publishing.txt` is a user-owned local file. It is explicitly excluded
from both Git and future VSIX builds. It must not be staged, read into logs,
uploaded as an artifact or copied into documentation. Existing credential-free
release bytes remain unchanged. Keep credentials in secure storage; Git ignore
rules are not encryption or protection from local access or backups.
