# Development

## Toolchain

- Node.js LTS
- npm
- MATLAB
- VSCodium or VS Code 1.95+

Install and validate:

```powershell
npm install
npm run check
npm run test:compile
npm test
npm run build
```

Press `F5` from the repository to start an Extension Development Host. The launch configuration runs the build task first.

## Packaging

```powershell
npm run package
```

The package script type-checks and bundles the extension before invoking `vsce`. Install the resulting VSIX with:

```powershell
codium --install-extension .\matlab-viz-0.3.2.vsix
```

## MATLAB-only validation

The public folder analyzer can be tested without loading the extension:

```matlab
addpath("matlab")
report = analyzeMatlabFileDependencies(sourceRoot,Print=false);
```

Run its MATLAB function tests with:

```matlab
addpath("matlab")
results = runtests("test/matlab/testAnalyzeMatlabFileDependencies.m");
assertSuccess(results)
```

To test the extension JSON bridge, create an options JSON document matching
`AnalysisOptions`, then call:

```matlab
addpath("matlab")
MatlabVizAnalyze(sourceRoot,outputJson,optionsJson)
```

Run MATLAB Code Analyzer before committing changes:

```matlab
checkcode("matlab/analyzeMatlabFileDependencies.m","-id")
checkcode("matlab/MatlabVizAnalyze.m","-id")
```

## Release checklist

1. Choose and add a distribution license.
2. Update `CHANGELOG.md` and the version in `package.json`.
3. Run TypeScript, unit, MATLAB Code Analyzer, and integration tests.
4. Build and inspect the VSIX contents.
5. Install the VSIX into a clean VSCodium profile.
6. Test Project and folder modes on Windows; test folder mode on macOS/Linux when available.
7. Tag the commit and attach the VSIX to the GitHub release.
