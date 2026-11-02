# MATLAB Viz 0.3.14 validation

Validation: 2026-11-01–02 (Europe/Paris). Windows, installed VSCodium, Node.js,
MATLAB R2026b Update 1 and licensed Simulink. Scope: original-graph cycle
exploration, exports/state, and direct self-call discovery repaired after an
actual-source native check exposed discarded self-edges.

## Results

| Check | Result |
|---|---|
| TypeScript / ESLint / production build | Passed |
| Complete Node suite with real MATLAB enabled | All 137 passed, no failures/skips/cancellations; approximately 103 seconds |
| New deterministic tests | Six SCC engine, nine cycle webview, five call-discovery regressions |
| Native cycle view | Passed: actual controls, original/grouped distinction, partial visibility, five exports, source navigation |
| Native cycle restart / Reload Window | Both passed with exact mode, component, expansion, details, search, positions and custom viewport |
| Native cycle failure / real MATLAB Refresh | Passed: failed file-limit analysis retains previous isolated view; successful acyclic analysis recomputes and clears stale cycle selection |
| Native actual recursive call graphs | Passed: Show Callees produces two functions/two mutual-call edges, then one function/one self-call edge; each gives one cyclic component |
| Grouping regressions | All three passed, including disconnected local expansion, repeated no-drift actions, exports, restart and actual Refresh |
| Existing renderer/editor regressions | All nine passed in the final release-profile run: visual, clarity, seven call/reference/restart/Reload Window/provider-timeout phases |
| Native Simulink regression | Passed: all four Project/folder/filtering/source-preservation observation groups |
| Native phases total | 18 passing final phases |
| VSIX | 17 entries, eight production/helper SHA-256 hashes match; no test code/fixtures, profiles, logs, generated models or node_modules |
| Local installation | `daw-0.matlab-viz@0.3.14` verified; normal editor windows left running |

The full Node integration still launches actual MATLAB processes and checks
singleton/one-edge JSON, Unicode paths, portable exports, logs, actionable errors,
cancellation and retry. MATLAB `.m` backend helpers are unchanged. The separate
23-test standalone/licensed MATLAB suite was not rerun for this editor/TypeScript
patch; its last complete run remains documented under 0.3.12, while the native
Simulink workflow was rerun here against retained generated models.

## Correctness and scale

- Cyclic SCCs are classified from original nodes/edges before grouping/filters.
  A singleton is cyclic only with a self-link. Multiple overlapping loops remain
  one component; simple cycles are not exhaustively enumerated.
- SCC membership agrees with independent transitive reachability on 200
  deterministic random directed graphs. Every example witness in these checks
  closes in the actual original edge direction.
- A 50,000-node chain gives no component; adding its closing edge gives one
  50,000-member/50,000-edge component with a full-length real witness. Iterative
  traversal avoids stack overflow. This is engine coverage, not a claim of
  interactive 50,000-node rendering.
- Parallel records, internal/self edges, one-way intercomponent bridges, tails,
  arbitrary IDs, input immutability, stable component identities and projection
  false-cycle traps are covered. The retained 515-file/648-edge snapshot has two
  two-file components/four internal edges; no new WEST analysis is claimed.
- Grouped marks count only real selected cyclic originals. A two-record aggregate
  with one cyclic original reports that subset separately. Isolation expands
  original members and excludes bridges between separate components; explicit
  visibility settings can still hide members, with included/total counts.
- Call/reference semantics, direct self-links, invalid/old saved states, failed
  attempts, new-result resets, source positions, paginated members and SVG
  markings/isolation are exercised by production-renderer VM tests.

## Native cycle scenarios

`test/host/cycles.ts` first seeds a controlled four-node/five-edge cache: a
three-member cycle, a self-link, and a one-way bridge. These are synthetic UI
inputs, not a claim that the owned acyclic MATLAB fixture actually recurses.
Real menu/save dialogs export an isolated three-node/three-edge vector SVG and
PNG. Complete JSON is exactly the original four-node/five-edge model; DOT/CSV
keep every original edge. Member navigation opens the owned source at line one
without evaluating it. Hiding an external member reports 2/3 members and 1/3
links. Opposite arrows between collapsed folders with no original return path
correctly report zero cycles.

Application restart and actual Reload Window preserve the isolated component,
grouping, expansion, browser details, search and custom viewport. A subsequent
real MATLAB file-limit failure preserves that view, and successful Refresh
replaces the controlled cache with the real four-file/two-edge acyclic result,
recomputing the counter to zero and resetting stale selection.

A separate workspace containing only the three owned sources under
`test/fixtures/cycles` runs actual Show Callees commands. Mutual recursion was
already recovered correctly; direct recursion initially produced no edge
because existing call discovery explicitly discarded self-targets. The repair
retains actual self-calls, excludes signatures/declaration-only provider ranges,
canonicalizes function identity, and does not re-enqueue an already-scanned self.
Bound-name indexing, handle creation and unresolved object receivers are not
promoted to recursion. Proven package calls and authoritative function definitions
remain supported. Five new discovery regressions cover outgoing/incoming/both
directions and provider/syntax evidence. The final native phase confirms both
mutual and direct recursion from source without evaluating either function.

## Existing workflows

The 515-file snapshot still passes four layouts with no automatic overlap/Fit
clipping, vector full/filtered SVG, filtered 4x PNG, trusted fast dragging,
divider resizing/keyboard/compact behavior, export dialogs and oversized-raster
errors. Grouping still preserves all 648 original records, local isolated
expansion and exact no-op bulk actions. Detached placement, restored Refresh
targets, warning/error retention, actual Reload Window and deliberately hung
provider recovery pass. Native Simulink checks preserve every owned model,
dictionary and MATLAB fixture source byte-for-byte. WEST sources/models are
not changed, loaded, saved, compiled or simulated.

An intermediate final-profile clarity run hit a Windows `EPERM` renaming a
pending cache file onto `last-graph.json`. Analysis completed, the existing cache
error path logged the save failure and retained the previous disk cache; its
polling test therefore timed out waiting for a new disk generation. The named
fresh release-profile suite below passes all nine phases. Production cache
semantics were not weakened to hide this environmental lock; this is not a claim
that Windows file locks can never interrupt persistence.

## Evidence

Ignored local artifacts under `.tools/validation/0.3.14/`:

- `node-final-verified.log`, `runner-final/`: final 137-test run and real MATLAB
  logs/summary/JSON/DOT/CSV. Earlier 132-test runs precede the self-call repair.
- `native-cycles/`: four passing cycle phase results, vector/raster/portable
  exports, screenshot, restored snapshots, actual MATLAB failure/Refresh logs.
- `native-cycle-calls-verified/`: actual recursive source graph result and logs.
  The earlier `native-cycle-calls/` failure is retained as diagnostic evidence.
- `native-grouping/`: all three passing grouping regression phases.
- `native-regression-release/`: final nine-phase passing old editor regressions.
  Earlier `native-regression-final/` retains the cache-lock failure.
- `native-simulink/`: passing native generated-model workflow and byte checks.

## Handoff

See the [cycle guide](CYCLES.md). Reload Window activates the installed controls.
Existing graph data can be inspected without MATLAB reanalysis. Older function
call graphs need Refresh to regenerate previously omitted self-links. Successful
new results intentionally reset cycle view; failed attempts retain it. Component
counts describe the loaded analysis only, not runtime behavior or complete
repository coverage. Public extension publishing remains on hold; the existing
missing-license packaging warning is unchanged.
