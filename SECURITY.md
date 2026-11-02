# Security policy

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/DAW-0/matlab-viz/security/advisories/new), not a public issue. Use the repository's **Security → Advisories → Report a vulnerability** form. Include affected versions, a minimal non-confidential reproduction and impact; do not post credentials or proprietary source/model data.

The maintainer confirmed private reporting is enabled on 2 November 2026. While the repository remains private, non-collaborators may see a 404 instead of its reporting form. Before any public release, verify the form is accessible to an external signed-in reporter after the intended visibility change. A private-repository API 404 is not treated as independent verification of that public form. This release does not change repository visibility or publish anything.

Only the current development release and the integration environment in [SUPPORT.md](SUPPORT.md) are actively validated. Older builds have no maintenance guarantee. Updates are coordinated through the private advisory; no response-time SLA is promised.

MATLAB Viz executes the locally configured MATLAB binary and loads a MATLAB Project when using Project mode. Project startup and shutdown tasks may execute code controlled by that project. MATLAB's model-analysis operations can also load model content. Analyze only projects/models you trust; dependency analysis is not a sandbox.

Folder model scanning uses saved `Simulink.MDLInfo` metadata without loading, updating, or simulating diagrams. MATLAB program-file analysis uses `requiredFilesAndProducts`. These are static-analysis paths, not an execution sandbox or a guarantee about every third-party MATLAB analyzer/plugin.

The extension does not download source code or explicitly compile/simulate analyzed models. Binary-file navigation delegates to the editor's registered handler, whose own behavior depends on installed extensions. It does not transmit source code, graph data, file paths, or telemetry.

Graph caches, baselines and reports can contain absolute paths, analysis messages and proprietary names. Review/sanitize them before sharing. Workspace Trust is explicitly required in the manifest; virtual workspaces are unsupported. Static analysis is not a sandbox and must not be used to inspect untrusted Projects/models merely because it is called analysis.
