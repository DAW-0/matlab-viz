const path = require('node:path');
const vscode = require('vscode');

// A test-only development extension. Normal extension-test mode deliberately
// uses in-memory storage and therefore cannot test full editor restarts.
exports.activate = () => {
  const stage = process.env.MATLAB_VIZ_RESTORE_STAGE;
  const testModule = stage === 'simulink' ? 'simulink.js' : stage === 'clarity' ? 'clarity.js' : stage === 'visual' ? 'visual.js' : stage === 'accuracy' ? 'accuracy.js' : stage === 'repository-accuracy' ? 'repositoryAccuracy.js' : 'restoration.js';
  const runner = require(path.resolve(__dirname, '../../../dist-test/test/host', testModule));
  void runner.run().then(
    () => vscode.commands.executeCommand('workbench.action.quit'),
    (error) => {
      console.error('[MATLAB Viz restoration bootstrap]', error);
      return vscode.commands.executeCommand('workbench.action.quit');
    }
  );
};
