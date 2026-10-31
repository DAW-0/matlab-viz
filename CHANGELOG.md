# Changelog

All notable changes to MATLAB Viz will be documented here.

## [Unreleased]

## [0.3.5]

### Fixed

- MATLAB JSON collections remain arrays when empty or when they contain a single node, edge, product, or notice; missing-file Project results are no longer rejected.
- Folder analyses with no dependency edges correctly retain isolated files instead of accessing an absent empty-graph node-name column.
- Legacy scalar collections are normalized when reading graph documents, with field-specific validation errors for malformed data.
- File, function, and reference analyses release their running state without waiting for error-notification dismissal.
- Failed folder analyses preserve the previous successful graph's Refresh target.
- MATLAB's original exception identifier and message are included in failure notifications instead of only its exit code.
- JSON and process-output handling preserve Unicode paths and text.

### Added

- Controller regression tests that leave error notifications open during retries.
- Real MATLAB JSON, missing-file Project, artifact-generation, logging, cancellation, and recovery tests.
- Analysis options and explicit completion counts in the MATLAB Viz output log.

## [0.3.4]

### Fixed

- File-dependency graphs now distinguish client-side trace depth from function-hierarchy analysis depth.
- Trace depth is disabled while an entire file graph is displayed, avoiding the impression that it changes repository analysis scope.
- Nonfatal MATLAB analyzer diagnostics are now described accurately instead of being presented as a graph-generation failure.

### Added

- Analysis notices can be inspected from the graph toolbar or directly from the completion notification, including source-file navigation.

## [0.3.3]

### Fixed

- Refresh now updates an existing graph webview in place, preserving its editor group or detached-window location.
- Explicitly showing an existing graph no longer forces it into the first editor column.

## [0.3.2]

### Fixed

- Empty Definition and References responses now fall back to a workspace-wide MATLAB declaration and call-site index.
- Local caller/callee edges are recovered when the MATLAB language provider silently returns no symbol relationships.
- Qualified calls participate in fallback matching by their method name.

## [0.3.1]

### Fixed

- Function and reference refreshes now preserve their original symbol instead of depending on the active editor after the graph gains focus.
- The graph toolbar Depth value now controls the call-hierarchy depth used by Refresh.
- Language-service requests and complete symbol analyses now have configurable time limits.
- Cancellation is no longer swallowed as a per-function warning.
- Document-symbol timeouts now use the MATLAB syntax fallback.

### Added

- Per-function traversal progress and completion timing in the MATLAB Viz output log.

## [0.3.0]

### Added

- Public `analyzeMatlabFileDependencies` MATLAB API returning a `digraph` and portable report tables.
- Standalone CSV, Graphviz DOT, MAT, MATLAB-rendered SVG, and PNG artifacts.
- Standalone analyzer documentation and MATLAB function tests.

### Changed

- The extension folder backend now delegates to the public analyzer instead of maintaining a duplicate scanner.
- Standalone reports include isolated/external controls, missing-file metadata, safety limits, and compatibility error data.

## [0.2.0]

### Added

- Function call-hierarchy graphs with caller, callee, and bidirectional modes.
- Symbol-reference tracing for MATLAB functions and variables.
- Definition, References, and Document Symbols integration with a MATLAB syntax fallback.
- Source-position navigation from graph nodes.
- Function-graph depth and node safety limits.

## [0.1.0]

### Added

- Initial VS Code/VSCodium extension scaffold.
- MATLAB Project Dependency Analyzer integration.
- Direct folder dependency analysis with `requiredFilesAndProducts`.
- Interactive SVG graph with search, layouts, filtering, impact/dependency traversal, source navigation, and exports.
- Configuration, logging, cancellation, file watching, and last-graph persistence.
- Architecture, analysis, development, roadmap, security, and contribution documentation.
