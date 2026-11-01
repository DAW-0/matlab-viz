# Security policy

Please report security issues privately to the repository owner rather than opening a public issue. A dedicated security email will be added before the first public release.

MATLAB Viz executes the locally configured MATLAB binary and loads a MATLAB Project when using Project mode. Project startup and shutdown tasks may execute code controlled by that project. MATLAB's model-analysis operations can also load model content. Analyze only projects/models you trust; dependency analysis is not a sandbox.

Folder model scanning uses saved `Simulink.MDLInfo` metadata without loading, updating, or simulating diagrams. MATLAB program-file analysis uses `requiredFilesAndProducts`. These are static-analysis paths, not an execution sandbox or a guarantee about every third-party MATLAB analyzer/plugin.

The extension does not download source code or explicitly compile/simulate analyzed models. Binary-file navigation delegates to the editor's registered handler, whose own behavior depends on installed extensions. It does not transmit source code, graph data, file paths, or telemetry.
