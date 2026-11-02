# Contributing

MATLAB Viz is distributed under the [MIT License](LICENSE). Contributions should
preserve that license and identify any third-party material rather than assuming
that dependencies' or copied sources' licenses have changed.

Before opening a pull request:

1. Create a focused branch from `main`.
2. Keep MATLAB analysis independent from presentation code.
3. Add or update tests for pure TypeScript behavior.
4. Use `npm ci --ignore-scripts`, then run `npm run check`, `npm run lint`, `npm run test:compile`, `npm test`, `npm audit`, and `npm run build`.
5. Run MATLAB Code Analyzer on every changed `.m` file.
6. Document user-visible behavior and settings.

Do not add telemetry, network uploads, or source-code transmission without an explicit design discussion and an opt-in privacy model.

Report MATLAB version, operating system, analysis mode, and a minimal reproducible project with bug reports. Remove confidential source code and paths from logs before sharing them.

See [SUPPORT.md](SUPPORT.md) for the deliberately narrow tested environment and
[the release procedure](docs/RELEASE.md) before creating a package/tag. Local
commits/tags are not authorization to push, create a GitHub release or publish to
either extension registry. Report vulnerabilities using [SECURITY.md](SECURITY.md).
