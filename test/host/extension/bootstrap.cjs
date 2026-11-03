const path = require('node:path');
const vscode = require('vscode');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');

// Check the extension actually loaded by the editor, not the source manifest.
// Run after fixture seeding: early activation would read the cache too soon.
async function checkInstalledPackage(stage) {
  const root = process.env.MATLAB_VIZ_INSTALLED_ROOT;
  if (!root) return;
  const extension = vscode.extensions.getExtension('daw-0.matlab-viz');
  assert.ok(extension, 'Packaged extension is not discoverable');
  const relative = path.relative(root, extension.extensionPath);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Source extension shadowed private VSIX');
  await extension.activate();
  const manifest = extension.packageJSON;
  const commands = new Set(await vscode.commands.getCommands(true));
  for (const item of manifest.contributes.commands) assert.ok(commands.has(item.command), `Unregistered command: ${item.command}`);
  const settings = vscode.workspace.getConfiguration();
  for (const key of Object.keys(manifest.contributes.configuration.properties)) assert.ok(settings.inspect(key), `Missing setting: ${key}`);
  for (const file of ['LICENSE.txt', 'README.md', 'SECURITY.md', 'SUPPORT.md', 'docs/RELEASE.md', 'dist/extension.js', 'media/graph.js', 'matlab/MatlabVizAnalyze.m']) {
    assert.ok((await fs.stat(path.join(extension.extensionPath, file))).size > 0, `Missing bundled file: ${file}`);
  }
  await fs.writeFile(path.join(process.env.MATLAB_VIZ_TEST_ARTIFACTS, `${stage}-installed-contract.json`), JSON.stringify({
    passed: true, version: manifest.version, extensionPath: extension.extensionPath,
    commands: manifest.contributes.commands.length, settings: Object.keys(manifest.contributes.configuration.properties).length
  }, null, 2));
}

// A test-only development extension. Normal extension-test mode deliberately
// uses in-memory storage and therefore cannot test full editor restarts.
exports.activate = () => {
  const stage = process.env.MATLAB_VIZ_RESTORE_STAGE;
  const testModule = ['cycles', 'restore-cycles', 'reload-cycles', 'cycles-refresh', 'cycles-calls'].includes(stage) ? 'cycles.js' : ['grouping', 'restore-grouping', 'group-refresh'].includes(stage) ? 'grouping.js' : stage === 'simulink' ? 'simulink.js' : stage === 'clarity' ? 'clarity.js' : stage === 'visual' ? 'visual.js' : stage === 'accuracy' ? 'accuracy.js' : stage === 'repository-accuracy' ? 'repositoryAccuracy.js' : 'restoration.js';
  const runner = require(path.resolve(__dirname, '../../../dist-test/test/host', ['prepare-comparison', 'compare-analyses', 'restore-comparison', 'reload-comparison'].includes(stage) ? 'comparison.js' : ['impact-reports', 'restore-impact-reports', 'reload-impact-reports'].includes(stage) ? 'impactReports.js' : ['reports', 'restore-reports', 'reload-reports', 'reports-repository'].includes(stage) ? 'reports.js' : testModule));
  void runner.run().then(() => checkInstalledPackage(stage)).then(
    () => vscode.commands.executeCommand('workbench.action.quit'),
    (error) => {
      console.error('[MATLAB Viz restoration bootstrap]', error);
      return vscode.commands.executeCommand('workbench.action.quit');
    }
  );
};
