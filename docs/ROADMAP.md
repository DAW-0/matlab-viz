# Roadmap

## 0.1 — functional foundation

- [x] MATLAB Project Dependency Analyzer backend
- [x] Folder direct-dependency backend
- [x] Interactive graph with navigation, filtering, layouts, and tracing
- [x] JSON, DOT, CSV, SVG, and PNG exports
- [x] File watching, cancellation, caching, logs, and settings
- [x] MATLAB backend integration test on a real subsystem
- [x] Complete Windows Extension Development Host validation (ongoing regression suite)
- [x] Package and install local VSIX builds (public publishing remains on hold)

## 0.2 — richer MATLAB semantics

- [x] Function-level caller and callee graphs using language-service definitions and references
- [x] Function-handle and qualified-method call discovery
- [x] Symbol-reference graphs grouped by containing function or file
- [x] Source positions and editor line navigation
- [ ] Class inheritance and property-type relationships
- [ ] Read/write classification for variable references
- MATLAB package, class-folder, namespace, and inheritance visualization
- [x] Saved Simulink model/subsystem reference metadata with explicit folder-scope limits (0.3.11)
- Problems and required-products panes
- Source-control change and blast-radius graph

## 0.3 — large graph workflows

- [x] Folder/package grouping and collapsible summary nodes (0.3.12; flat first version)
- Saved graph workspaces, node positions, notes, and manual edges
- Strongly connected components and cycle explorer
- Community detection and centrality ranking
- Minimap and virtualized rendering for very large projects
- Compare two graph snapshots

## 1.0 — production release

- Stable versioned graph schema and migration policy
- Windows, macOS, and Linux CI/integration coverage
- Accessibility and keyboard-navigation audit
- Marketplace/Open VSX publishing pipeline
- Comprehensive user guide and example gallery

The roadmap is intentionally ordered around correctness first: native MATLAB dependency data, then richer interaction, then scale and collaboration features.
