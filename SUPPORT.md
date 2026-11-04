# Support and tested environments

MATLAB Viz 0.3.23 is a maintenance-focused public preview available as a verified
[GitHub VSIX download](https://github.com/DAW-0/matlab-viz/releases/tag/v0.3.23).
This is an icon/metadata release: its runtime bundle, MATLAB helpers and graph
scripts are unchanged from 0.3.21; that release's native integration evidence is
carried forward explicitly, not represented as a new full MATLAB test run.
It is also published on [Open VSX](https://open-vsx.org/extension/daw-0/matlab-viz)
as `daw-0.matlab-viz`; its downloadable VSIX matches the verified GitHub artifact.
Open VSX verified namespace ownership on 4 November 2026. The maintainer has
registered the token-free publishing workflow; live OIDC verification is in
progress, so the working temporary credential has not yet been retired.

## Validated integration environment

| Component | Validated environment |
|---|---|
| Operating system | Local Windows x64 |
| Editor | VSCodium 1.143.17232 |
| MATLAB | R2026b, locally configured executable |
| Simulink | Licensed R2026b controlled fixtures; see the model-analysis limits |
| Build toolchain | Node.js 26.13.0 and the committed npm lockfile |

The manifest's editor floor is 1.143; older editors are not supported by this
preview. Microsoft VS Code, macOS/Linux integration, other MATLAB releases,
ARM hosts, WSL, SSH/dev-container extension hosts, virtual workspaces and web
editors are not validated/supported release targets. Shared APIs or passing
Linux unit checks do not establish integration compatibility. Experimental code
paths may exist, but no broader support claim is made.

Development tools require Node.js 22.13+ on the 22 line, or 24+; that requirement is not a claim
that every Node/editor/MATLAB combination has been tested. The conservative
VS Code 1.95 type declarations constrain API use, not the supported runtime floor.

Function/reference graphs additionally depend on the installed MATLAB language
extension's Definition/References providers and a conservative syntax fallback.
Dynamic dispatch, constructed names, nested-scope inference and runtime values
are not completely modeled. Project analysis can run Project-controlled tasks;
analyze only trusted content. Folder Simulink scanning covers saved direct
references, not complete library/callback/dictionary relationships.

## Reporting a normal problem

Use [GitHub Issues](https://github.com/DAW-0/matlab-viz/issues) for non-security
bugs. The repository is public as of 3 November 2026.
Include the extension/editor/MATLAB versions, OS, analysis backend, steps and a
small shareable fixture. Remove confidential source, absolute paths, usernames,
tokens and proprietary model names from logs, graph exports and baselines.
Do not upload a real WEST checkout or private analysis cache by default.

For security issues use the private channel in [SECURITY.md](SECURITY.md), never
a public bug report. There is no guaranteed response-time or commercial support
commitment for this preview.

## Guides

- [Dependency analysis](docs/DEPENDENCY_ANALYSIS.md)
- [Function/symbol analysis](docs/SYMBOL_ANALYSIS.md)
- [Entry-point reports](docs/ENTRY_POINT_REPORTS.md)
- [Impact reports](docs/IMPACT_REPORTS.md)
- [Analysis comparison](docs/ANALYSIS_COMPARISON.md)
- [Local release procedure and publication gates](docs/RELEASE.md)
