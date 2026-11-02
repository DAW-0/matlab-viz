# Cycle explorer

The cycle explorer inspects the **loaded analysis graph**. It does not launch
MATLAB, the language server, or user code, and it does not add inferred edges to
the graph. It works with file dependencies, function-call hierarchies, and symbol
references. Detection uses original nodes/edges before grouping or view filters.

## Controls

1. Click **Cycles (N)** to open the browser in the resizable details panel.
2. Choose **Highlight cycles** to mark the selected component's nodes/links while
   retaining the surrounding graph. The component selector defaults to **All
   cyclic components**. Selecting one component enables highlighting if it was
   off and brings its included nodes/groups into view.
3. Choose **Isolate cycles** to show only selected component members and their
   internal links. Isolation clears the trace direction to Entire Graph and
   disables the direction control so an old file trace cannot silently restrict
   the cycle. For function hierarchies, Analysis Depth remains available for a
   subsequent Refresh; ordinary Trace Depth is disabled during isolation.
4. Select one component or all of them using the toolbar. The same highlight,
   isolate and off actions are available in the browser. Compact windows that
   hide the details panel retain the toolbar controls.
5. Use **Open: ...** to navigate to a member's source position without executing
   MATLAB. Clicking a cyclic original node also offers **Inspect cyclic
   component** after its usual Open File/Open Symbol action.
6. Choose **Cycles: off** to remove cycle markings/isolation. Existing visibility
   filters and grouping/expansion preferences remain in effect. Isolation does
   not restore a previous trace automatically.

The browser lists up to 50 component shortcuts; the toolbar selector includes
every component. A selected component's members are paginated in groups of 100,
with previous/next controls and saved page state. A very long example loop is
explicitly truncated to its first 50 nodes for display; no graph data is dropped.

## What N means

A strongly connected component (SCC) is a maximal set of nodes where every member
can reach every other member through directed links. It is **cyclic** if it has
more than one member, or one member with a direct self-link. The explorer lists
only cyclic SCCs, not isolated acyclic nodes.

One SCC can contain many overlapping simple cycles. The counter is the number
of cyclic components, **not the number of distinct loops**, runtime calls, or
recursion depth. Enumerating every simple cycle can be impractical, so each
component instead shows all internal original links and one actual example
directed loop. The example repeats its start node at the end; each step follows
an actual original edge in the correct direction. It need not visit every
component member or be the shortest loop. Parallel edge records remain separate
evidence; counts are graph links, not grouped source occurrences.

| Graph type | Interpretation |
|---|---|
| File dependencies | A circular dependency among analyzed files; it does not identify a specific recursive function |
| Function calls | A cyclic caller/callee relationship in the analyzed graph; direct function self-links are labelled direct recursion |
| Symbol references | A cyclic reference relationship; this does not prove runtime recursion or variable read/write dataflow |

These statements describe the supplied static graph, not an execution trace.
Version 0.3.14 also repairs call discovery that previously discarded every
self-target. Real self-calls are retained without re-enqueueing the same symbol;
declarations are excluded explicitly. Handle creation alone is not direct
recursion, and syntax fallback does not guess past bound-array names or unknown
object receivers. Proven package qualification or language-service function
identity can disambiguate a self-call. Ambiguous same-named output bindings may
still need language-service resolution. **Refresh older function-call graphs**
to regenerate previously omitted self-links; merely reloading the UI cannot add
missing analyzer edges to an old cached graph.

Backend/provider mistakes, unresolved dynamic calls, omitted externals, analysis
depth/limits, and incomplete syntax recovery can affect the result. Inspect the
original source and analysis notices before drawing conclusions. **No cycles
found** is not proof that the complete repository or runtime behavior is acyclic.

## Grouping and false cycles

Consider two unrelated original links `A/file1 -> B/file1` and
`B/file2 -> A/file2`. Folder grouping draws `A -> B` and `B -> A`, but there is
no original return path. The explorer therefore reports no cycle for this graph.
It never runs SCC detection on collapsed summary nodes.

A highlighted collapsed group means **some included member** belongs to the
selected cyclic component, not that every member is cyclic or the folder is a
function. A highlighted aggregate arrow means at least one represented original
link is internal to a selected cyclic component. Its ordinary number still counts
all represented original links. Tooltip/edge details distinguish the cyclic
subset (for example 1 of 2), and SVG records that subset count separately.

Activating isolation automatically expands the owners of selected original
members, including when changing grouping modes during isolation. Unselected
members in those groups are filtered out, not relabelled as cyclic. You can
explicitly collapse groups again afterward; their internal links are then
summarized, not drawn. Turning cycle view off leaves those expansion preferences
as normal view state; it does not restore a separate pre-cycle arrangement.

With **All cyclic components** isolated, links between separate components are
excluded even if both endpoints belong to cyclic components: a one-way bridge
is not itself a cycle. Every selected component's internal original edge is
retained, subject to visibility filtering.

## Filters, selection and partial visibility

Cycle classification is computed once for the full loaded result. Search,
external/isolated visibility, grouping and trace filters do not change component
membership or the counter. Highlighting can coexist with an ordinary trace;
isolation clears tracing as described above. Visibility filters remain respected
even in isolation and are never silently enabled.

The browser reports included/total selected members and internal links. Hiding
an external intermediate member, for example, can show 2/3 members and 1/3 links:
the visible picture no longer contains the complete loop. Markings indicate
membership in the **original** cyclic component, not proof of a visible return
path. Check Show External Nodes or remove other filters to inspect the complete
loaded component. This cannot recover nodes omitted by the original analysis.

Selected/missing-node styling retains priority over cycle coloring. Counts,
component membership, examples and isolation provide non-color ways to inspect
the relationships. Search highlights still do not remove nodes from exports.

## Persistence, Refresh and exports

The cycle mode, selected component and member page are editor-view preferences,
not graph-schema fields. The same cached graph restores them with grouping,
expanded members, positions, details, filters, custom viewport and panel width
across restart and Reload Window. Older saved states default to Cycles Off.
Invalid/stale component IDs are rejected rather than isolating an unrelated set.

A failed/cancelled analysis retains the previous cycle view and shows the usual
previous-graph notice. A successful **new** result recomputes components and
resets cycle mode/selection to Off/All: coverage can change, and components can
merge/split. This is deliberate, not a failure to restore. Choose the desired
component again after Refresh. Function Analysis Depth changes still require
Refresh to expand underlying analysis coverage.

| Export | Behavior |
|---|---|
| SVG/PNG, Filtered graph | Current cycle highlighting/isolation, visibility, grouping and expansion; includes offscreen included nodes |
| SVG/PNG, Current viewport | The same view cropped to current pan/zoom |
| JSON | Complete original graph, products, notices and metadata, not only the isolated component |
| DOT/CSV | Complete original directed graph/edge table, not only the cycle view |

SVG retains vector nodes/arrows, cyclic styling, selected cyclic-link counts and
a description of the cycle view. Visual exports are not a complete diagnostic or
cycle report: filters/collapsing can hide members/internal links. No component
list or witness is inserted into JSON/DOT/CSV. This keeps portable analysis data
unchanged and consistent with other view-only filters. The standalone MATLAB
renderer/API is unchanged; this explorer is an editor feature.

## Implementation boundaries

`media/graphCycles.js` is DOM-free and well-commented. Iterative graph traversal
avoids JavaScript recursion limits; SCC discovery is O(V + E), followed by
deterministic member/component sorting. Stable identities use each component's
smallest original node ID: disjoint components cannot share one, so no hash
collision or synthetic graph node is needed. A second iterative traversal
retains one real directed witness. Inputs are never mutated.

Automated tests compare membership against independent reachability, include a
50,000-node chain/ring and cover original/grouped distinctions, self-links,
bridges, parallel evidence, filtering, pagination, source navigation, exports
and restored views. The large-graph engine check is not a promise of interactive
50,000-node rendering; minimap/virtualization remain separate roadmap work.
