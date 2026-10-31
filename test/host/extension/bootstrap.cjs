const path = require('node:path');
const vscode = require('vscode');

// A test-only development extension. Normal extension-test mode deliberately
// uses in-memory storage and therefore cannot test full editor restarts.
exports.activate = () => {
  const runner = require(path.resolve(__dirname, '../../../dist-test/test/host/restoration.js'));
  void runner.run().then(
    () => vscode.commands.executeCommand('workbench.action.quit'),
    (error) => {
      console.error('[MATLAB Viz restoration bootstrap]', error);
      return vscode.commands.executeCommand('workbench.action.quit');
    }
  );
};
