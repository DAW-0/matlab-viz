# Roadmap

## Maintenance focus (3 November 2026)

The current feature set meets the maintainer's intended use. Work now focuses on
reproducible bug fixes, security/dependency upkeep and compatibility checks when
the validated editor/MATLAB environment changes. New features, new platforms and
a 1.0 release are optional future choices, not prerequisites or commitments.

Release housekeeping is separate from feature development: the 0.3.23
activity-bar icon update is published. Namespace ownership was approved on
4 November 2026 and live OIDC verification passed. The old GitHub secret and PAT
workflow are retired; revoke the original temporary token in Open VSX. See
[publication status](RELEASE.md) and [Open VSX operations](OPEN_VSX.md).

The historical feature ideas below remain a backlog, not scheduled work.

## 0.1 — functional foundation

- [x] MATLAB Project Dependency Analyzer backend
- [x] Folder direct-dependency backend
- [x] Interactive graph with navigation, filtering, layouts, and tracing
- [x] JSON, DOT, CSV, SVG, and PNG exports
- [x] File watching, cancellation, caching, logs, and settings
- [x] MATLAB backend integration test on a real subsystem
- [x] Complete Windows Extension Development Host validation (ongoing regression suite)
- [x] Package/install local VSIX builds and publish verified previews on GitHub/Open VSX

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
- [x] Saved-analysis comparison and selected dependency/impact scope differences (0.3.20; not an automatic Git/source-content diff)

## 0.3 — large graph workflows

- [x] Folder/package grouping and collapsible summary nodes (0.3.12; flat first version)
- [x] Persisted graph controls, node positions and view restoration
- Notes and manual edges
- [x] Original-graph cyclic strongly connected components and cycle explorer (0.3.14)
- Community detection and centrality ranking
- Minimap and virtualized rendering for very large projects
- [x] Complete analysis baselines, evidence comparison and Markdown/JSON reports (0.3.20)
- [x] MIT release preparation and reproducible tagged-package workflow (0.3.21 onward)

## 1.0 — production release

- Stable versioned graph schema and migration policy
- Windows, macOS, and Linux CI/integration coverage
- Accessibility and keyboard-navigation audit
- Marketplace/Open VSX publishing pipeline
- Comprehensive user guide and example gallery

The roadmap is intentionally ordered around correctness first: native MATLAB dependency data, then richer interaction, then scale and collaboration features.
