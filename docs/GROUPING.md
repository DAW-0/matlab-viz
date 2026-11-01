# Folder and MATLAB-package grouping

Grouping is a webview projection of the existing result. It does not start
MATLAB, expand analysis coverage, infer new dependencies, or alter the graph
cache/schema. It works with file dependencies, function hierarchies, and symbol
references. The default is **No grouping** for compatibility with older views.

## Controls

1. Choose **By folder** or **By MATLAB package** in the toolbar. All groups start
   collapsed when switching grouping modes. **No grouping** restores individual
   nodes and their previous ungrouped positions.
2. Click a summary node to select it. The details show included/total membership,
   internal relationship counts, external/missing member counts, and location.
3. Double-click the summary, press Enter/Space while it has keyboard focus, or
   use **Expand group** in its details to reveal its individual files/symbols.
   Expanding does not open a synthetic path or run source code.
4. Use **Groups** to list all groups and expand/collapse any individual group,
   including one whose nodes are currently expanded or excluded by filters.
   The button labels describe the next action; `aria-expanded` records the state.
5. Use **Collapse all** for the overview or **Expand all** for original nodes.
   **Inspect: ...** in group details expands the group and selects that original
   member. Its usual Open File/Open Symbol button then navigates to source.

The Groups browser and per-member inspector use the resizable details panel.
At compact widths where that panel is hidden, summary-node keyboard/double-click
expansion and the toolbar's Expand All/Collapse All remain available.

## What constitutes a group?

| Mode | Membership |
|---|---|
| Folder | The physical file's immediate parent folder, relative to the selected root; files directly in the root use `(root)` |
| MATLAB package | The nearest enclosing `+package` folder, qualified through contiguous enclosing `+parent` folders; `private` and `@Class` descendants stay owned by that package |
| Non-package code in package mode | Its ordinary leaf-folder group |
| External files | Separate identities using their full outside-root folder/package location, labelled `External:` |

Example: `src/+plant/+control/private/helper.m` belongs to package `plant.control`.
`src/+plant/main.m` belongs to `plant`; nested packages are separate groups.
Selecting a `+package`, `private`, or `@Class` folder as the analysis root does
not erase the enclosing package's name. Equal package names in different source
trees remain distinct and show their different locations in brackets. Windows
path identities ignore case; POSIX identities preserve it.

This is **physical organization**, not a new MATLAB name/path resolver. It does
not claim which duplicate package MATLAB would choose. Symbols in the same
physical `.m` file share its folder/package membership regardless of source line.
Each file/symbol belongs to exactly one group. This first version is flat:
expanding exposes original nodes, not recursively nested parent-folder boxes.

## Counts and arrows

- A label such as `src (12 files)` means all 12 members are included by current
  visibility/trace filters. `src (3/12 files)` means three of the original 12
  currently pass those filters. Symbol graphs say `symbols`, not `files`.
- Arrows retain source-to-target direction. Arrows between the same displayed
  endpoints combine original graph links, even if their relationship kinds
  differ. Opposite aggregate directions curve apart, with separate hit targets
  and count labels, so neither direction hides the other.
- The arrow's number counts original graph edge records, **not source
  occurrences**, individual block instances, distinct neighbors, or calls at
  runtime. A reference link can already summarize several source lines.
- Links whose endpoints are both inside one collapsed group are not drawn as
  self-loops; they are counted as internal relationships in its details and the
  graph summary. Original self/recursive links are included in that count.
  Expanding the group restores those original links, including self-loops.
- The main file/symbol and dependency/call/reference fractions always describe
  original data after filters, not the smaller count of summary nodes. Additional
  text gives collapsed groups, displayed links, and internal relationships.
- Clicking an aggregate arrow lists each original direction, relationship kind,
  and available evidence. Missing/external flags on a summary mean respectively
  **any member missing** and **all included members external**; details give counts.

Across a projection, the sum of original-edge counts represented by displayed
arrows plus internal collapsed-group links equals the original filtered edge
count. Expanding everything restores every included original edge, not a
reconstructed approximation.

## Tracing, search and visibility

Selecting a group and choosing Dependencies/Impact (or the corresponding symbol
terminology) starts the trace at **every original member**. Depth counts hops
along original graph edges, not aggregate arrows. It therefore cannot skip
several file dependencies simply because they occupy the same collapsed group.
Depth one from a group can include many files because all its members are seeds.

If an individual file was selected before grouping, it remains the exact trace
seed even if its owner is now collapsed. Its displayed group is highlighted;
selecting the group explicitly changes the seed to every member. Expanding a
selected group keeps that same set of seeds. A real background click clears
selection/trace as before; dragging or panning does not.

Search highlights a collapsed group when its name or an included member's
label/relative/full path matches. It does not filter data, alter counts, expand
groups, or start MATLAB. External/isolated visibility controls and depth filters
are applied to original nodes before grouping. As before, trace traversal can
pass through nodes hidden by visibility filters; grouping does not change this
existing rule. Search and trace do not add dependencies missing from analysis.

## Layout, persistence and exports

All four layouts work on displayed summary/original nodes. Re-expanding or
collapsing applies the current layout and Fit so new rectangles do not overlap
automatically. Manual drags can still create overlap; choosing a layout again
restores spacing. Grouping changes Fit the view. Positions are kept separately
for No Grouping, Folder, and Package modes, while expansion resets to collapsed
when switching modes. Zoom is not independently remembered for each mode.

An open graph view saves its current grouping, mixed expansion, selections,
details, positions, filters, custom viewport and panel width for restart/Reload
Window. Older saved views default to ungrouped. Successful Refresh of the same
root/graph type retains grouping, layout, expansion and compatible positions, pruning
removed IDs. As before, a new analysis result clears selection/trace/custom zoom;
it does not promise to keep every view control after reanalysis. A different
root/type starts ungrouped. Failed/cancelled attempts retain the previous view.

| Export | Scope |
|---|---|
| SVG/PNG, Filtered graph | Current grouping/expansion and visibility/trace filters, including offscreen nodes |
| SVG/PNG, Current viewport | The same view cropped to current pan/zoom |
| JSON | Complete original graph, metadata, products and notices; no synthetic groups/edges |
| DOT/CSV | Complete original directed graph/edge table, regardless of current grouping or filters |

SVG remains vector and includes an explanatory description of original and
internal counts. SVG/PNG show aggregate arrow numbers and member-count labels.
They do **not** contain all hidden member/internal-edge detail or the complete
diagnostic table: use JSON for the full portable report, or expand all first for
an individual-node image. View preferences live in editor state, not graph JSON.
The standalone MATLAB renderer is unchanged and does not offer grouping.

## First-version limits

Groups are summary nodes, not nested compound containers. There is no parent
folder depth selector, manual group editing, block/subsystem grouping, or runtime
dataflow inference. Node positions are retained per grouping mode, but manually
dragged groups do not carry their hidden members as a rigid block. Dense graphs
can still have crossing arrows/arrow labels; grouping is not an edge-routing
engine. Full graph data remains available via No Grouping and data exports.
