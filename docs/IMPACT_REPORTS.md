# File impact reports

An impact report answers: **Which files in this saved analysis depend, directly
or indirectly, on the selected file?** It complements an entry-point report,
which asks what that file depends on. Both operate locally on original analyzed
links; neither reruns MATLAB, executes source code, or checks disk existence.

## Use

1. Open a Project/folder file dependency graph and select an original file node.
   Expand its folder/package group first if needed. Synthetic groups and native
   unresolved-name nodes cannot be report seeds. A tracked missing file can be
   selected to investigate its dependents.
2. Click **Impact report** in the toolbar or the selected node's details.
3. Read the direct/total dependent counts, exact-evidence notice classifications
   and **Coverage limits**. The report is independent of search, trace depth,
   grouping, cycle isolation and external/isolated visibility filters.
4. Use **Export report (Markdown)** or **Export report (JSON)** for a complete
   record, or **Show report scope in graph** to see that reverse-reachable scope.

Example: if `driver.m -> helper.m -> shared.m`, selecting `shared.m` reports
one direct dependent (`helper.m`) and two total dependents (`helper.m` and
`driver.m`). Selecting `driver.m` instead reports zero dependents in that graph,
even though it has outgoing dependencies.

## Counts and arrow direction

- **Direct dependents:** unique original source nodes with a link into the
  selected file, excluding the selected file itself.
- **Total dependents:** every distinct original node that can reach the selected
  file through outgoing analyzed links, excluding the selected file. This
  includes direct dependents; the two counts must not be added together.
- **Scope nodes:** total dependents plus the selected file. The selected file is
  included at zero hops, but never counted as its own dependent, even in cycles.
- **Scope links:** all original links with both endpoints in that scope. Parallel
  and self-links are retained as evidence but do not inflate dependent counts.
- **Minimum hops:** the shortest analyzed route from a dependent toward the
  selected file. Cycles terminate through visited-node tracking, not a depth cap.

Traversal follows incoming links to find ancestors, but **no displayed/exported
arrow is reversed**. `driver -> helper -> shared` remains exactly that direction.
Other outgoing dependencies of these dependents are not automatically included:
the impact scope is not a complete execution environment for every dependent.

## Scope view and impact paths

**Show report scope in graph** displays all selected-file/ancestor nodes using
fresh compact coordinates. Conflicting display filters are paused; pan, zoom,
layout, search highlighting and dragging still work. **Fit report scope** fits
the current positions. **Return to previous view** restores the prior filters,
grouping, cycles, positions, selection and viewport without layout drift.

Click any node in the impact scope and choose **Show impact path**. The panel
shows one minimum-hop original dependency route from that dependent **to the
selected file**, with each original link's kind/details. Equal-length choices
use original edge order; no uniqueness or runtime-path claim is made. A path
for the selected file itself has zero links, not an invented self-loop.

**Fit impact path** zooms to that route without moving nodes. Other scoped nodes
are dimmed, not removed, and counts remain unchanged. **Clear impact path** is
available in the panel and persistent scope banner. It restores ordinary styling
without moving the graph. Clicking other nodes or empty space does not silently
clear a pinned route. Unresolved names, if present as ancestors in native graph
evidence, remain names and cannot navigate to a guessed file.

Switching between dependency and impact scopes retains one original-view backup,
not nested history. The direction is part of saved scope state, so a restored
impact view recomputes incoming—not outgoing—membership. Only seed/target IDs,
direction and the ordinary-view backup are saved; the host rebuilds path evidence.
New successful analysis clears old reports/scopes/paths. Failure or cancellation
retains the previous result and its latest-attempt banner. Delayed replies cannot
restore a cleared path or replace the opposite report direction.

## Evidence, interpretation and limits

Impact means **potential change exposure in the saved static graph**, not proof
that a dependent runs, will break, or needs editing. Zero dependents is not proof
that a change is safe. Constructed function names, `eval`, callbacks, object
dispatch, workspace state, data-dependent branches and excluded external files
can make the analysis incomplete or over-approximate relationships.

Every original notice/product record is retained and classified by the same
exact file/name evidence rules as [entry-point reports](ENTRY_POINT_REPORTS.md):

- **Reachable:** has an exact association to a selected-file/ancestor node.
- **Outside:** associated only with nodes outside this reverse-reachable scope;
  not declared irrelevant or optional at runtime.
- **Unattributed:** has no exact node association and still needs review.

General errors, truncation and excluded dependencies can affect the whole result.
No basename matching, message-text inference, dynamic candidate linking, file
existence checks, input-data validation, simulation or license checks are added.
Product records remain evidence, not license validation or complete per-workflow
requirements. Review global warnings and coverage limits even with zero scoped
notices. Missing/unresolved status is from the saved analysis, not rechecked.

## Export and logging

Report files use `*-impact-report.md/json` and share the last successful export
directory with other exports. Cancel/failure does not change that preference.
Markdown is escaped; JSON retains all original scope nodes/links and every
classified notice/product, even when the panel paginates long lists.

The structured report has `reportVersion: 1`, `kind: "file-impact"`,
`selectedFile`, and `scope: "all-analyzed-incoming-dependents"`. It is not a graph
cache replacement. Each node records minimum `depth` and, except the selected
file, `viaEdgeId`: an original edge leading one hop closer to the selected file.
Counts distinguish `directDependents`, `totalDependents` and total scope `nodes`.

SVG/PNG graph exports reflect the current visual scope/path, including explanatory
text in SVG. Normal graph JSON/DOT/CSV still retain the entire original analysis,
not just the impact view. Report generation and path requests log direction,
counts and the fact that MATLAB was not executed; successful exports log their
destination and format. Nothing is sent remotely.

## Automated validation

Engine tests independently check reverse reachability, long chains, cycles,
self/parallel/dangling links, missing/unresolved evidence, shortest original
routes and Markdown escaping. Host/renderer tests cover both exports, logging,
direction-aware stale replies, scope switching, return, failures and restoration.
Native-editor phases use a private profile, actual report/graph save dialogs,
real log files, application restart and Reload Window. An optional saved-graph
smoke test verifies repository-scale impact without changing the supplied cache
or executing its MATLAB/Simulink source.
