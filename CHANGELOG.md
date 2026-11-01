# Changelog

All notable changes to MATLAB Viz will be documented here.

## [Unreleased]

## [0.3.11]

### Fixed

- Folder analysis no longer silently treats Simulink models as dependency-free MATLAB program inputs. It reads saved direct model/subsystem references using `Simulink.MDLInfo` without loading the diagram and labels the resulting edge evidence.
- Every inspected folder model has an explicit partial-scope warning; unresolved names and unreadable/default metadata descriptors are warned without inventing target paths. Scope warnings survive isolated-node filtering and JSON/MAT/problem-CSV output.
- Simulink binary navigation uses the editor's registered handler instead of forcing model/dictionary archives into text documents. Data-dictionary and protected-model target node kinds are distinguished.
- Documentation now states model-analysis boundaries and the release requirements of the configured Project options rather than implying full Simulink folder analysis or R2019a option compatibility.

### Added

- Generated, licensed fixtures covering model references, repeated instances, a linked library, callbacks, dictionaries, block-parameter analysis off/on, a legacy MDL model, a referenced subsystem, external filtering, missing-model recovery, byte preservation, and standalone exports.
- Native VSCodium Simulink workflow tests and a reproducible native-versus-bridge diagnostic probe. Add-on option passthrough is checked without installing third-party code; full add-on discovery remains unvalidated.

## [0.3.10]

### Added

- Persistent previous-graph banner after a failed/cancelled attempt, with generation time, Refresh Displayed Graph, and Show Logs. Successful analysis clears the notice; failures do not replace graph data, cache, or Refresh target. The notice restores with the same open graph tab and is excluded from graph exports.
- Recorded external-analysis policy in extension-generated graph metadata, explicit Show External Nodes visibility wording, and an External Analysis Settings action. Settings changes require Refresh; legacy policy is identified as unrecorded rather than guessed.
- Controller, panel, and webview regressions plus native MATLAB failure/retry, settings-navigation, terminology, and restored-banner tests.

### Fixed

- File, call, and reference details use their actual relationship terminology and distinct-neighbor counts with singular/plural wording. Reference summaries count grouped reference links, not occurrences.
- Sidebar counts use actual graph arrays rather than optional cached counts, and source paths are escaped for HTML display. Notices and status-bar relationships use consistent terminology.

## [0.3.9]

### Added

- Resizable right-hand details panel with a focusable, accessible divider, captured pointer dragging, keyboard fine/coarse steps, minimum/maximum sizing, and double-click/Enter reset.
- Per-view width persistence across Refresh, new analysis results, Reload Window, and editor restart. Narrow windows clamp only the displayed size and retain the preferred width.
- Canvas ResizeObserver handling: fitted graphs refit after panel/layout changes, while custom pan/zoom, selection, trace, node positions, and rendered node identity remain unchanged.
- Commented sizing, persistence, and gesture logic; deterministic and native-editor interaction/restoration regressions.

### Fixed

- Long headings and edge details wrap within the panel instead of forcing horizontal overflow.

## [0.3.8]

### Fixed

- Function references merge conservative syntax evidence with empty, declaration-only, or partial language-service results. Declaration ranges are excluded, recursion is retained, and repeated occurrences are grouped/deduplicated without losing source lines.
- Reference inference checks local/private/package resolution and obvious variable bindings; ambiguous same-named functions produce notices instead of indiscriminate edges. Dirty editor buffers participate in the syntax index.
- Provider failures/timeouts, incomplete indexes, node truncation, and zero-usage uncertainty are explicit. Informational recovery notices no longer produce warning notifications. Variable tracing remains provider-scoped.
- Selected-folder analysis can resolve dependencies in its containing workspace without analyzing the whole workspace or broadening the selected source-file limit.

### Added

- Folder lookup settings `matlabViz.folder.useWorkspacePath` and `matlabViz.folder.additionalSearchRoots`, plus standalone `SearchRoots` and recorded lookup metadata. Selected roots retain path precedence; MATLAB path restoration covers errors.
- Reference-resolution, provider-merge, shadowing, Unicode, dirty-buffer, cancellation, limit, and lookup-scope regressions.
- Real-editor accuracy/error-retry tests and read-only WEST checks, alongside the repeated visual-export, log, restoration, and real MATLAB regression suites.

## [0.3.7]

### Fixed

- Automatic layouts use measured, wrapped node dimensions instead of fixed spacing. Hierarchical layout handles cycles using strongly connected components; force layout separates colliding rectangles.
- Fit uses actual node/self-loop bounds and no longer clamps large graphs to an excessive minimum zoom.
- A queued startup Fit does not overwrite early user zoom. Older saved geometry is recalculated once without losing controls or selection.
- Showing a lazily restored auxiliary graph explicitly focuses its editor group before selecting the tab, instead of reopening a main-window editor.
- Edge endpoints use rectangle intersections rather than an elliptical approximation; self-references have visible loops.
- Node labels retain their full text, wrapping into multiple lines instead of truncating long paths.
- Dragging updates the node and incident edges in place with pointer capture on the stable SVG. Dropped capture is recovered while the button remains held; captured clicks/double-clicks still select/navigate correctly.
- Background panning does not clear the selected trace. Changing trace/visibility filters relayouts the visible graph, avoiding stale mixed-layout positions.
- Visual exports contain portable vector text/shapes and explicit arrowheads. Filtered-graph framing includes offscreen nodes and is independent of viewport pan/zoom.
- Export remembers the last successful directory across formats and sessions. Cancelled/failed saves do not change it, and export failures are logged and reported without blocking analysis.

### Added

- Explicit filtered-graph/viewport export framing and 1×/2×/4× PNG resolution.
- Clear PNG safety limits (32 megapixels, 16,384 pixels per side) with SVG/lower-resolution alternatives instead of blank or silently downscaled output.
- Shared geometry/export regressions and real VSCodium renderer, trusted mouse, picker/save-dialog, SVG/PNG, and export-log checks.

## [0.3.6]

### Fixed

- Graph commands wait for the saved graph to load, preventing the first Show or Refresh command from racing cache restoration.
- The editor can restore its existing graph webview after Reload Window or a restart, including detached-window placement, filters, selection/details, node positions, layout, and custom viewport.
- Cached function graphs retain their original function, caller/callee direction, and analysis depth; reference graphs retain their original file/cursor anchor for Refresh.
- Older call graphs without a saved direction remain viewable but request one fresh function analysis before Refresh, rather than silently starting a repository scan.
- Showing or visually exporting an unchanged graph no longer replaces its data and resets its selection/filter state.
- Local cache writes replace the saved graph atomically; a failed save keeps the previous disk cache and reports a nonfatal warning.

### Added

- Portable, validated Refresh context in graph metadata.
- Controller, panel-lifecycle, and webview-state regression tests.
- Isolated real-editor tests for full restarts, Reload Window, detached windows, and a deliberately hung language provider with timeout/recovery checks.

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
