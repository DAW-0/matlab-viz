# Roadmap

## 0.1 — functional foundation

- [x] MATLAB Project Dependency Analyzer backend
- [x] Folder direct-dependency backend
- [x] Interactive graph with navigation, filtering, layouts, and tracing
- [x] JSON, DOT, CSV, SVG, and PNG exports
- [x] File watching, cancellation, caching, logs, and settings
- [x] MATLAB backend integration test on a real subsystem
- [ ] Complete Extension Development Host validation
- [ ] Package and install the first VSIX

## 0.2 — richer MATLAB semantics

- [x] Function-level caller and callee graphs using language-service definitions and references
- [x] Function-handle and qualified-method call discovery
- [x] Symbol-reference graphs grouped by containing function or file
- [x] Source positions and editor line navigation
- [ ] Class inheritance and property-type relationships
- [ ] Read/write classification for variable references
- MATLAB package, class-folder, namespace, and inheritance visualization
- Simulink subsystem/model-reference metadata
- Problems and required-products panes
- Source-control change and blast-radius graph

## 0.3 — large graph workflows

- Folder/package grouping and collapsible clusters
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
