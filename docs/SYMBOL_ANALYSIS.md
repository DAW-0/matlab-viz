# Function and symbol analysis

MATLAB Viz implements function call-hierarchy and symbol-reference graphs even when the MATLAB language extension does not expose VS Code's standard Call Hierarchy command.

## Provider strategy

The extension combines three editor services:

1. **Document Symbols** identify functions, methods, classes, and their source ranges.
2. **Definition** resolves a call-site identifier to the file and function it denotes.
3. **References** finds callers and uses of the selected function or variable.

These are queried through VS Code's documented provider commands. When function document symbols are absent, a conservative MATLAB scanner identifies `function` and `classdef` declarations. Call candidates include parenthesized calls, qualified calls such as `object.method(...)`, and function handles such as `@callback`.

## Call hierarchy

Place the cursor inside a function or on a resolvable function name and run one of:

- **MATLAB Viz: Show Function Call Hierarchy**
- **MATLAB Viz: Show Callers**
- **MATLAB Viz: Show Callees**

An edge points from caller to callee. Bidirectional mode independently walks incoming and outgoing relationships to `matlabViz.symbols.maximumDepth`, stopping at `matlabViz.symbols.maximumNodes`.

The graph remembers its original function. Pressing **Refresh** therefore
rebuilds the same hierarchy even when the graph webview has focus. The toolbar
**Depth** value is passed back as the new traversal depth on refresh; changing
it without refreshing only changes the visible trace of the graph already in
memory.

Every editor-provider request is bounded by
`matlabViz.symbols.requestTimeoutSeconds`, and the complete operation is bounded
by `matlabViz.symbols.analysisTimeoutSeconds`. A document-symbol timeout falls
back to the MATLAB declaration scanner. Other request timeouts appear as
analysis notices instead of leaving the operation waiting indefinitely. The
output log records traversal progress by function, direction, and depth.

If Definition or References returns no result, MATLAB Viz indexes MATLAB
declarations and parenthesized call sites across the current workspace. This
syntax fallback recovers local caller/callee edges without requiring language
server support. Language-service results remain preferred because they can
disambiguate methods and functions with the same name.

The extension asks the language service to resolve every candidate. Array indexing such as `values(index)` can resemble a function call syntactically, but its definition normally resolves inside the current function and is discarded as a self-edge.

## Function and variable references

Place the cursor on a function or variable and run **MATLAB Viz: Trace Symbol References**. MATLAB Viz resolves the definition, requests all references, and groups those occurrences by containing function. References in script-level code are grouped under the file.

This graph answers “where is this symbol used?” It does not reconstruct values. Edge details list the source lines containing references.

Function references always supplement the provider's results with conservative
workspace syntax matches, even when the provider returns a nonempty but partial
list or only the declaration. Calls, function handles, qualified package names,
and simple line/semicolon-leading command-form uses are candidates. Comments,
strings, and function declarations are excluded. Actual recursive uses can
produce self-edges. Multiple occurrences in one container produce a single edge
with all retained source lines and `language service` / `MATLAB syntax` evidence.

The syntax resolver favors same-file local functions, visible private functions,
and same-folder primaries before a unique ordinary workspace function. Qualified
package functions are resolved separately; unknown object receivers and competing
global candidates are not guessed. Obvious parameters, outputs, assignments,
and loop bindings prevent treating array indexing as a function reference. Open
buffers, including unsaved edits, override disk content. Script-level binding
checks exclude unrelated local-function parameter lists.

Syntax recovery is informational; ambiguous matches, provider failures/timeouts,
index read failures, the 5,000-file index cap, and actual node truncation produce
warnings. Increasing the node limit does not address an incomplete index. A
zero-usage notice explicitly avoids claiming the symbol is unused. The log
distinguishes raw provider locations, newly recovered syntax locations, omitted
containers, and final grouped edge counts. These counts need not be identical.

Variables remain language-provider-only: syntax matching does not infer a variable
with the same spelling across files or reconstruct reads, writes, or values.

The reference summary counts container-to-symbol **reference links**, not raw
occurrences. Node details count distinct referenced symbols and referencing
containers in the complete result; edge details retain grouped source lines and
evidence. Call graphs instead show callers/callees and Function call headings.
The toolbar's recorded external-analysis policy refers to nodes outside open
workspace folders; Show external nodes is only a visibility filter. Change the
analysis setting and Refresh to alter the included analysis scope.

## Limitations

- Results depend on the installed MATLAB language provider's indexing and resolution quality.
- Simple command form is supported for function references, not the outgoing call-hierarchy candidate scanner.
- Dynamic calls through `eval`, `feval` with computed names, callbacks stored in data, or reflection may be absent.
- Unique function handles can be recovered syntactically for references; other call-hierarchy resolution still depends on its provider/fallback strategy.
- Method dispatch can be ambiguous when the receiver's class is unknown.
- Reference results do not distinguish reads from writes.
- The fallback declaration scanner approximates nested scopes when full document-symbol ranges are unavailable.
- The syntax resolver is not a complete MATLAB parser or path interpreter. Imports, nested-scope capture, dynamic loading, dispatch, and runtime path changes can cause omissions or incorrect inferred matches. Review syntax evidence; neither inferred edges nor empty results prove runtime behavior.
- Reference Refresh stores the original file/position, not an edit-tracking marker. Start a new trace if edits have moved that symbol.
- Increasing depth can grow the number of Definition and References requests exponentially; the node and total-time limits intentionally stop pathological traversals.

MATLAB Viz labels these graphs as `language-service` analysis so they are not confused with MATLAB Dependency Analyzer file graphs.
