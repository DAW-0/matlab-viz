# Changelog

All notable changes to MATLAB Viz will be documented here.

## [Unreleased]

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
