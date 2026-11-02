# Entry-point dependency reports

An entry point is a file you intend to start from: a driver script, function,
or model. MATLAB Viz reports outgoing dependencies **already present in the
loaded file analysis**, without rerunning MATLAB or executing that file.
It is not proof that the workflow will run successfully.

For the reverse question—what depends on this file?—use the complementary
[Impact report](IMPACT_REPORTS.md). That report identifies potential change
exposure, not predicted runtime breakage, and preserves original arrow direction.

## Use

1. Generate or reopen a Project/folder file dependency graph.
2. Select an original file node. Expand a folder/package group first if needed.
   Groups and unresolved-name nodes are not valid entry points.
3. Click **Entry-point report** in the toolbar, or **Entry-point dependency
   report** in the node details.
4. Inspect node/link counts, unresolved names, missing files, notice categories
   and **Coverage limits** in the right panel.
5. Choose **Export report (Markdown)** for a readable audit or **Export report
   (JSON)** for complete structured evidence.

Scope includes the entry file, every reachable original node, all original
links among them, and minimum file-hop distances. Traversal follows outgoing
links to exhaustion, including cycles, self-links and external nodes present
in the result. Display depth, search, grouping, cycle isolation and visibility
do not affect reports. No graph controls, layout or panel location are changed.
Selecting a different file does not automatically run another report.

## Show the report's scope in the graph

Click **Show report scope in graph** in the report panel. This explicit action
displays every original node/link in that outgoing scope and automatically Fits
it using a fresh compact layout. It does not rerun MATLAB or add dependencies.
The entry stays selected. Search highlighting is cleared, grouping is temporarily
removed, and cycle isolation/tracing/visibility filters are paused so no part of
the report is silently hidden. Trace direction shows **Report scope**; trace depth
is disabled because all analyzed hops are included. Layout, node dragging, pan,
zoom, search highlighting and Fit still work within this scoped view.

A persistent banner identifies the active seed. **Return to previous view** is
always available there, even after clicking another node or empty space; it is
also shown in the report panel. Return restores the prior filters, grouping,
cycle state, layout, node positions and pan/zoom. Moving report nodes does not
alter those saved positions. The details width remains a general preference.
Repeated Show/Return actions do not accumulate layout drift. **Fit report scope**
only refits the current scoped coordinates; it does not relayout them.

## Explain why a file is included

While the report scope is visible, click any original node in that scope and
choose **Show dependency path** in its details. The right panel lists one
minimum-hop route from the entry file to that target, in order. Each hop uses
an original analyzed link and retains its reported relationship kind and
details. A route to the entry itself has zero links. A target outside the scope
has no route in this saved analysis; no link is invented to reach it.

The highlighted route dims other scoped nodes and links but does not remove
them, change counts or move nodes. **Fit dependency path** zooms to those
nodes without changing their coordinates. **Clear dependency path** in either
the panel or persistent scope banner restores normal styling. Clicking another
node or empty space does not silently clear the pinned path; select another
scoped node and Show dependency path to replace it. **Return to previous view**
clears the path and restores the original view, as before.

This is **one shortest route through analyzed file dependencies**, not proof
that it is the only route, a function call chain, or a route taken at runtime.
Dynamic dependencies can be missing and static edges can over-approximate.
Unresolved names remain labeled as such and cannot be opened as files; missing
file flags come from the saved analysis, not a fresh disk check. The target ID,
not the path's edge list, is saved across restart/Reload Window, and the host
reconstructs the route from the original graph. Stale responses after clearing,
switching scope or replacing the graph are ignored.

SVG/PNG exports of the scoped view retain route colors and include a textual
interpretation. JSON/DOT/CSV graph exports still contain the entire original
analysis, and Markdown/JSON entry-point reports still contain the complete
scope; route highlighting does not rewrite either dataset.

Opening another report while scoped does not change the active scope until you
click its Show button. Switching scopes keeps one backup of the original ordinary
view, not a nested history. Scope membership is recomputed from original links
on restart/Reload Window, and Return continues to work. Successful new analysis
clears the old scope/backup; a failed or cancelled attempt retains them and the
latest-attempt banner. Returning does not erase that failure/cancellation notice.

SVG/PNG graph exports reflect the scoped view (or selected viewport framing).
SVG descriptions identify the entry-point scope. Ordinary graph JSON/DOT/CSV
still export the complete original analysis; the report's Markdown/JSON still
include its complete scoped evidence and all classified notices. Global warning
and cycle counters remain repository-wide, not workflow-completeness claims.

Node lists are paginated in blocks of 50. Each notice category shows up to 100
entries and explicitly indicates any remainder. Both exports contain every
node, original link, notice and product record. Navigation is editor-only;
unresolved names cannot open files.

## Notice interpretation

| Category | Evidence | What it does not establish |
|---|---|---|
| Reachable | Exact notice file/name match to a reachable original node | The branch runs or the notice is a definite runtime failure |
| Outside | Exact matches exist only outside this outgoing trace | The requirement is optional for all uses or irrelevant at runtime |
| Unattributed | No exact graph-node association established | The notice is safe to ignore |

Absolute paths are lexically normalized; Windows paths are case-insensitive,
POSIX paths are case-sensitive. Explicit root-relative paths containing a
separator can match the analyzed root location. Native unresolved names match
exactly, including case, and are not turned into file paths. There is no
basename-only, message-text or similarly-named-file matching. Notices without
sources, or for files absent from the graph, remain unattributed. General
analysis errors and limits can affect the entire result and must be reviewed.

The repository warning count remains unchanged. Every notice retains its
original message, severity, source, classification and matching original node
IDs in the JSON report. Product records use the same association rules through
`introducedBy`; they are not license validation.

## Coverage and export boundaries

Constructed names (`str2func`, `eval`), callbacks, object dispatch, workspace
state and data-dependent branches may be absent or over-approximated. Reports
**do not infer extra links**, search for dynamic candidates, open Projects,
add MATLAB paths, validate input/cache data, check licenses or execute MATLAB.
Zero reachable notices is not a completeness or runtime-success claim.
Excluded external dependencies cannot be recovered by a view-only report.
Backend, analysis limits and path policy remain applicable.

JSON records original analysis metadata, scoped counts and whole-result totals.
It has its own `reportVersion: 1`, `kind: "entry-point-dependencies"`, and is not
a graph-cache replacement. Each node includes the original record, shortest
`depth`, and (except the entry) a real BFS predecessor `viaEdgeId`. This is one
analyzed route, not necessarily the only execution route. Edges are original
evidence, not new calls. Generation does not check disk existence/resolution.

Report filenames are entry-specific: `*-entry-point-report.md/json`. They share
the last successfully used export directory with other exports; cancel/failure
does not change that preference. Existing graph JSON/DOT/CSV remain the complete
original analysis, and SVG/PNG retain their existing visual export semantics.

Editor restart/Reload Window restores the selected report from the same cached
analysis by saving only its seed, not another report document. A new successful
analysis clears it. Failed analysis retains the previous graph/report and the
existing stale-result banner. Logs record report counts and successful saves.
No report is sent remotely.

## Automated validation

Engine regressions cover attribution, missing/unresolved semantics, path rules,
cycles/parallel/self links, disconnected entries, dangling targets, 50,000-hop
graphs, independent generated-graph comparisons and Markdown escaping. Host
tests check logging, both exports, directory reuse and invalid/stale requests.
Renderer tests check scope independence, exports, restoration and stale replies.

Reversible-scope tests also cover grouping/cycle-view backups, repeated no-drift
Show/Return, dragged-node selection, unbounded depth, switching seeds, independent
failure status, and rejection of stale or nested saved backups. Native-editor
checks save all five graph formats plus both reports, restart the application,
perform Reload Window, and verify that Return still restores the ordinary view.
An optional saved-repository smoke check validates original node/link counts and
Fit bounds without changing the supplied cache or running its code.

`test/fixtures/entryPoint` contains tiny standalone MATLAB sources, including a
constructed callback and a deliberately unavailable API. Analyze, never execute
these fixtures. Deterministic tests use controlled graph evidence rather than
assuming that every MATLAB release resolves dynamic constructs identically.
No WEST checkout is required.
