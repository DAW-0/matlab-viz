# Changelog

All notable changes to MATLAB Viz will be documented here.

## [Unreleased]

## [0.3.22] - 2026-11-03

### Marketplace identity

- Add an original four-node marketplace icon: blue dependencies converge on the
  highlighted upper-left node and a green impact arrow leads to the lower-right.
  Include the editable SVG and reproducible 256-pixel PNG, a matching dark banner
  and explicit preview metadata. The theme-aware activity-bar icon is unchanged.
- Add pinned development-only SVG rasterization, icon/package regression checks
  and artwork documentation. No MATLAB analysis or graph-runtime behavior changes.
- Request `daw-0` namespace ownership; trusted publishing remains gated on registry
  verification and maintainer registration. Keep the working PAT bootstrap until
  the replacement authentication path has been verified.

### Public preview preparation carried forward

- Publish the existing verified 0.3.21 public-preview source/tag and GitHub VSIX,
  enable/verify GitHub private vulnerability reporting, and publish the same
  checksum-verified archive on Open VSX as `daw-0.matlab-viz`. Add manual,
  checksum-pinned upload tooling and exclude local publisher notes from Git and
  VSIX packaging. No runtime rebuild or tag replacement; namespace verification
  and OIDC migration remain pending.
- Add installed-VSIX acceptance mode and record 29 passing native phases across
  11 private profiles, plus both real MATLAB-process tests. Current source CI
  passes on Windows/Linux with Node 22 and 26.13.0; integration claims stay narrow.

## [0.3.21] - 2026-11-02

### Release preparation

- Adopt the MIT License under DAW-0 and MATLAB Viz contributors, include it in the manifest/VSIX, and add concrete GitHub private security-reporting and support policies. Public publishing remains on hold.
- Narrow validated integration claims to local Windows x64, VSCodium 1.143.17232 and MATLAB R2026b; raise the manifest editor floor to 1.143 and explicitly decline untrusted/virtual workspaces. Other editor/platform/MATLAB combinations remain unvalidated.
- Migrate ESLint 8 to ESLint 10/TypeScript-ESLint flat configuration and apply a narrowly targeted, contract-tested minimatch 10.2.6 → 11.0.1 development-tool mitigation. Retain recommended lint enforcement; no npm tooling is bundled in the runtime.
- Add clean-commit/tag release packaging, deterministic ZIP timestamps/order, tag-pinned documentation links, bundled user guides, package-content checks and source/package CI. Update stale installation examples and release gates. Local source tags/artifacts do not authorize pushes or registry upload.

## [0.3.20] - 2026-11-02

### Added

- **Compare analyses** saves/loads local versioned complete-analysis baselines, remembers the selected baseline, and compares original file/name, relationship, notice and product evidence independently of display filters. Stable file/name identities replace volatile analyzer IDs; ambiguous identities and incompatible roots/schemas are refused.
- Whole-analysis and selected dependency/impact-scope comparisons, separate recorded-coverage differences, bounded panel lists and complete Markdown/JSON reports retaining all notices/product evidence. Notices no longer reported are not claimed resolved; unchanged node metadata is not a source-content equality claim.
- Host-owned comparison snapshot exports, local-file/size validation, Clear-without-delete, cancellation/failure recovery, stale-dialog/Refresh guards, saved selection/scope restoration and real baseline/comparison logging. Added engine, host, renderer and native Save/Load/export/restart/Reload Window regressions; no MATLAB execution is needed for comparison.

## [0.3.19] - 2026-11-02

### Added

- **Impact report** traces all incoming analyzed links to identify direct and transitive dependents of a selected file, independently of display filters/depth. The selected file is not counted as its own dependent; cycles and parallel links do not inflate counts. All original notices/products retain exact-evidence classifications and Markdown/JSON exports.
- Reversible impact scopes and **Show impact path** reuse original graph evidence without reversing any arrows. The panel explicitly distinguishes potential change exposure from runtime execution, predicted breakage or required edits. Ordinary graph exports retain complete analysis; visual exports reflect the scope/path.
- Target-only restoration, direction-aware stale-response checks, report/path logging, documented interpretation limits and native-editor export/restart/Reload Window regressions. Existing entry-point report formats and cache schemas remain unchanged.

## [0.3.18] - 2026-11-02

### Added

- **Show dependency path** in a report-scoped node's details highlights one minimum-hop route from the entry file using only original analyzed predecessor links. The ordered panel retains each link's kind and details, marks missing/unresolved targets, and explicitly says this is neither the only possible route nor a runtime execution trace.
- **Fit dependency path** and persistent **Clear dependency path** leave graph membership and coordinates unchanged. The active path survives graph-tab restoration by saving its target ID and rebuilding evidence in the host; delayed responses after Clear/Return are ignored.
- SVG/PNG visual exports preserve route highlighting; graph JSON/DOT/CSV and report Markdown/JSON continue to export their prior complete evidence. Added engine, host, renderer, SVG and native-editor regression coverage.

## [0.3.17] - 2026-11-02

### Added

- **Show report scope in graph** displays and Fits all original analyzed outgoing dependencies from the report's entry point, independently of display depth. Fresh compact coordinates and original, ungrouped nodes avoid repository-scale gaps; conflicting visibility/grouping/cycle/trace filters are explicitly paused.
- Persistent scope banner, **Fit report scope**, and **Return to previous view**. Return restores the original filters, grouping, cycle state, coordinate banks, selection, layout and viewport without cumulative drift. Scope and a single ordinary-view backup survive restart/Reload Window; new successful analysis clears them, while failed attempts remain identified correctly.
- Scoped visual exports retain their normal visual semantics and identify the entry-point scope; graph JSON/DOT/CSV and report Markdown/JSON retain their existing complete evidence. Added renderer and native-editor regressions for reversible scope, exports and restoration.

## [0.3.16] - 2026-11-02

### Added

- Entry-point file reports traverse all original outgoing analyzed links independently of view filters/depth, retaining shortest-hop evidence, missing files and unresolved names without inferring dynamic targets.
- Exact-evidence reachable/outside/unattributed notice and product classification. All original notices remain exportable; coverage limits distinguish static evidence from runtime validation.
- Right-panel inspection, paginated navigation, Markdown/JSON exports, shared export-directory preference, logging, saved-seed restoration and stale-response protection. Existing graph exports and schemas are unchanged.
- Self-contained MATLAB fixtures and engine/host/webview regression tests; no WEST checkout required.

## [0.3.15] - 2026-11-02

### Fixed

- Cycle isolation now lays out disconnected visible components as compact, non-overlapping islands, so Fit no longer includes repository-sized gaps. Isolated positions are saved separately; leaving isolation restores overview coordinates, and older isolated states migrate on first load.
- Project dependency names without established file paths are retained as unresolved names, not asserted to be missing files or outside-root files. Their links/notices survive external-file exclusion. Details show unknown scope, file navigation is disabled, folder/package ownership is not guessed, and mixed summaries distinguish files/names. Absolute tracked missing paths retain normal missing-file handling.

## [0.3.14]

### Fixed

- Actual recursive self-calls are no longer discarded by the function call-hierarchy builder. Declaration-only references/signatures are excluded explicitly; handle creation, shadowed-array indexing and unresolved object receivers do not manufacture direct recursion. Provider-resolved function identity and proven package self-calls remain supported. Existing call graphs need Refresh to regenerate previously omitted self-links.

### Added

- Original-graph cyclic strongly connected component analysis with iterative traversal, stable component identities, all internal edge evidence, self-link counts and one real directed-loop example per component. Grouped projection arrows never manufacture cycles.
- Cycle browser, single/all component selection, highlighting, isolation, source navigation, paginated members, node-to-component inspection and partial-visibility counts. Call-graph self-links identify direct recursion; reference cycles do not claim runtime behavior.
- Cycle state/details/custom viewport restore with the same cached graph across restart/Reload Window. Failed analysis retains that view; successful new analysis recomputes components and resets stale cycle selection. Isolation clears/disables tracing, reveals original grouped members, and excludes intercomponent bridges.
- SVG/PNG preserve cyclic markings and isolation; JSON/DOT/CSV remain the complete ungrouped original analysis. No graph schema change or MATLAB rerun is required to inspect cycles.
- Independent reachability comparisons, 50,000-node chain/ring checks, webview integration tests, and native-editor menu/export/navigation/restart/Reload Window/failure/Refresh tests.

## [0.3.13]

### Fixed

- Individual group expansion no longer reruns the entire graph layout: disconnected members form a compact block near their summary and are brought into view, while unrelated nodes keep their positions. Local placement avoids occupied rectangles without a Force pass.
- Collapse restores the summary anchor instead of spreading the overview. Repeated Collapse All/Expand All calls with no expansion-state change preserve exact positions, viewport, and node DOM; repeated disconnected Force-group clicks no longer cause cumulative drift.
- Member inspection shares the same local expansion path. Added crowded-placement, all-layout isolated expansion, repeated bulk/cycle and real-editor reproduction regressions; updated the grouping guide to describe local focus and layout behavior.

## [0.3.12]

### Fixed

- Lazy detached graph tabs retry activation while cross-window focus settles, instead of silently targeting the main window's source editor. Retries remain bounded, preserve the existing owning group, and log an unsuccessful activation.

### Added

- View-only leaf-folder and innermost MATLAB-package groups for file, call, and reference graphs. Collapsed summary nodes show included/total membership, internal relationship counts, and external/missing summaries. Ordinary non-package code falls back to folder grouping.
- Directed aggregate arrows with original-link counts and auditable original relationship details. Original-graph tracing avoids collapsed-group shortcuts; hidden members still participate in search highlights.
- Individual keyboard/detail-panel expansion, a Groups browser, Collapse All/Expand All, per-mode positions, and restoration of grouping/mixed expansion across Refresh and editor restart. SVG/PNG reflect the grouped view; data exports retain the complete ungrouped model with no schema change.
- Pure projection tests, 5,000-node conservation checks, grouped webview/pointer/restoration tests, and native-editor grouping/layout/export/restart/real-MATLAB Refresh/error checks.

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
