const path = require('node:path');
const vscode = require('vscode');

// A test-only development extension. Normal extension-test mode deliberately
// uses in-memory storage and therefore cannot test full editor restarts.
exports.activate = () => {
  const stage = process.env.MATLAB_VIZ_RESTORE_STAGE;
  const testModule = ['cycles', 'restore-cycles', 'reload-cycles', 'cycles-refresh', 'cycles-calls'].includes(stage) ? 'cycles.js' : ['grouping', 'restore-grouping', 'group-refresh'].includes(stage) ? 'grouping.js' : stage === 'simulink' ? 'simulink.js' : stage === 'clarity' ? 'clarity.js' : stage === 'visual' ? 'visual.js' : stage === 'accuracy' ? 'accuracy.js' : stage === 'repository-accuracy' ? 'repositoryAccuracy.js' : 'restoration.js';
  const runner = require(path.resolve(__dirname, '../../../dist-test/test/host', ['prepare-comparison', 'compare-analyses', 'restore-comparison', 'reload-comparison'].includes(stage) ? 'comparison.js' : ['impact-reports', 'restore-impact-reports', 'reload-impact-reports'].includes(stage) ? 'impactReports.js' : ['reports', 'restore-reports', 'reload-reports', 'reports-repository'].includes(stage) ? 'reports.js' : testModule));
  void runner.run().then(
    () => vscode.commands.executeCommand('workbench.action.quit'),
    (error) => {
      console.error('[MATLAB Viz restoration bootstrap]', error);
      return vscode.commands.executeCommand('workbench.action.quit');
    }
  );
};
