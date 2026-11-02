# Analysis baselines and comparison

Comparison answers **what changed in the recorded dependency-analysis evidence?**
It is not a source-code diff, regression test, runtime trace or prediction that
code will break. No MATLAB/source execution, live-file scan, license check or
automatic refresh occurs when saving, loading or comparing a baseline.

## Workflow

1. Generate a file dependency graph for the repository/root you want to track.
2. Click **Compare analyses** in the graph toolbar.
3. Choose **Save current analysis as baseline** and save the JSON file somewhere
   suitable. It contains the complete original analyzed graph, including all
   notices/products—not just visible nodes or a selected report scope.
4. Change your code as needed, then **Refresh** or generate the new analysis.
   Comparing without a new analysis compares old evidence, not live edits.
5. Click **Compare analyses** again, then **Compare entire analysis**.
6. Review recorded coverage changes and interpretation limits before deciding
   whether a difference may be caused by a source change.
7. Export the displayed comparison as Markdown or JSON for review.

**Load analysis baseline** selects a previously saved baseline. It must be a
version-1 MATLAB Viz baseline document, not a regular graph/report export.
The selected local baseline URI is remembered across editor restarts. It is
re-read and validated for each new comparison; a deleted, corrupted, wrong-root
or unsupported file produces an actionable error without changing the graph.
An invalid load does not replace a previously selected baseline.

**Clear baseline selection (keep file)** forgets the reference; it never deletes
the user's saved file. Canceling Save/Load does not replace that reference.
The baseline and comparison export dialogs share the existing last-successful
export-directory preference. Save creates a standalone file; it does not create
a Git commit or upload data. No normal editor window is moved/revealed by
comparison or export, and graph positions/filters remain unchanged.

## What is compared

| Evidence | Matching and reporting |
|---|---|
| File nodes | Established absolute path; Windows slash/case normalized, POSIX case-sensitive. Added/removed paths are listed. Recorded kind, missing/external status, extension and unresolved flag can be metadata changes. |
| Unresolved names | Exact native name text, kept distinct from established file paths. No guessed file location. |
| Dependency relationships | Original source/target file identities plus relationship kind. Added/removed relationships are distinct from changes in details or parallel-record count. Original arrows are preserved. |
| Notices | Severity, exact message and normalized exact file/name evidence, preserving duplicate counts. Changed wording appears as an old notice no longer reported plus a new notice. |
| Product records | Name, recorded version/number/certainty and exact introduced-by evidence. These remain analysis evidence, not license validation. |
| Recorded coverage | Backend, MATLAB version, external policy, search roots and Project name differences are shown separately. Lookup-root order is preserved because it can affect resolution precedence. |

Analyzer-generated IDs, input ordering, timestamps and durations are not file/link
identities. Canonical duplicate file/name identities, duplicate IDs, dangling
links, unmarked relative-file guesses and unsupported graph schemas are rejected
rather than matched arbitrarily. Current comparison supports file graphs only;
call-hierarchy and reference graphs require symbol identity rules not provided
by this feature. Baselines are limited to 64 MiB and local `file:` URIs.

Both analyses must have the same normalized absolute root. A repository copied
to another root is not silently rebased. Renames and moves appear as removed and
added paths; no rename/content similarity inference is made. Different recorded
backends or external/search policies are allowed for inspection but explicitly
flagged as coverage differences, not attributed automatically to code changes.

## Selected dependency and impact scopes

Select an original file node before opening **Compare analyses**, then choose:

- **Compare selected dependency scope:** all outgoing analyzed dependency hops
  from that file, independently in each analysis.
- **Compare selected impact scope:** all incoming analyzed dependent hops toward
  that file, independently in each analysis, preserving original arrows.

The report retains the entire-analysis comparison and adds the selected scope's
before/after node/link counts and added/removed/changed evidence. These differences
can include files that existed in both analyses but moved into or out of the
selected scope. The selected file itself is included, as in the corresponding
[entry-point](ENTRY_POINT_REPORTS.md) and [impact](IMPACT_REPORTS.md) reports.
Display trace depth, grouping, search, cycle isolation and visibility do not
affect membership or scope comparisons.

The current selected file is matched to the baseline by established path, not
its current analyzer ID. If it did not exist in the baseline, its previous scope
is **unavailable, not assumed empty**. No invented 'all members added' scope diff
is reported. Baseline-only removed files remain visible in the whole-analysis
removals; this version's scope picker starts from original current file nodes.
Synthetic groups and unresolved-name nodes are not scope seeds.

Comparison is a right-panel report, not a graph overlay: it does not manufacture
removed nodes/arrows inside the current graph. Existing visual and normal graph
exports retain their established semantics. Use the dedicated comparison exports
to preserve differences, including removed evidence.

## Interpretation and coverage

- **Unchanged node metadata does not prove unchanged code.** No source hashes,
  text diff, input data or runtime behavior are inspected.
- **No longer reported is not proven resolved.** Notice wording, MATLAB/toolbox
  versions, path state, exclusions or analysis failures can explain a difference.
- Zero differences is not proof of equal behavior, complete coverage or a safe
  change. Static analysis may miss dynamic callbacks, constructed names, `eval`,
  dispatch and workspace-dependent behavior, or over-approximate dependencies.
- Some options, limits, exclusions and environment state are not fully recorded
  in the graph schema. No recorded coverage-field changes does not establish
  identical coverage. Compare like-for-like analysis settings when possible.
- Review all baseline and current notices, including unchanged/general notices.
  Both are retained in the report; a small delta does not make old warnings safe.

The displayed current generation time identifies which analysis is compared.
A failed/cancelled Refresh retains the previous graph and latest-attempt banner;
comparison of that graph does not imply the failed attempt succeeded. A new
successful analysis invalidates old comparison exports and clears old panel
results; baseline selection remains available for a fresh comparison.

## Exports, persistence and safety

Baseline files use `baselineVersion: 1`, kind
`matlab-viz-analysis-baseline`, a save timestamp, and the complete original graph.
Comparison files use `comparisonVersion: 1`, kind
`matlab-viz-analysis-comparison`, before/current metadata, full deltas, coverage
differences, interpretation limits, optional scope differences, and all original
notices/product evidence on both sides. A comparison is not a replacement graph
cache. JSON preserves records; Markdown escapes all user-controlled values.

Default names are `*-analysis-baseline.json` and
`*-analysis-comparison.md/json`. Panel lists show up to 100 records per category,
with an explicit remainder note; both report formats contain every record.
Saving/loading a baseline never adopts it as the active graph.

Comparison exports use the exact host-owned snapshot currently displayed. A
subsequent external edit to the baseline file does not silently change an export;
compare again to read new disk evidence. Webview-supplied subgraphs or report
records are never trusted. Saved view state contains only selection/scope
instructions, not a second authoritative comparison document. Restart/Reload
Window rebuilds that report from the selected baseline and current cached graph;
missing/incompatible baseline errors leave the current graph intact.

Dialogs and reads can outlive a Refresh. Graph/request identity checks prevent
their late replies from replacing newer graph-panel state, and stale comparison
exports are rejected. Operation locks are released independently of error-message
dismissal, so a failed load/save can be retried immediately. Logs record baseline
save/load locations, difference counts, coverage changes and successful exports.
Nothing is sent remotely. Baselines/reports can contain absolute paths and source
names, so review them before sharing outside your organization.

## Automated validation

Engine tests cover ID/order independence, node/relationship changes, duplicate
record counts, exact notice/name semantics, coverage changes, path normalization,
scope membership/absent seeds, validation, snapshot isolation and Markdown escaping.
Host/renderer tests exercise persistence, errors, cancellation, size limits,
concurrent operations, Refresh during dialogs, exact exports, stale replies,
restoration and bounded lists without changing graph geometry.

Native VSCodium phases use a private profile and controlled saved graphs:
`prepare-comparison`, `compare-analyses`, `restore-comparison`, `reload-comparison`.
They exercise actual Save/Load dialogs, both export formats, complete-baseline
capture from a filtered view, recovery after invalid loads without dismissing an
error, Clear-without-delete, real log files and exact restart/Reload Window views.
No MATLAB or WEST source code is executed by those tests.
