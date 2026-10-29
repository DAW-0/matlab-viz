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

The extension asks the language service to resolve every candidate. Array indexing such as `values(index)` can resemble a function call syntactically, but its definition normally resolves inside the current function and is discarded as a self-edge.

## Function and variable references

Place the cursor on a function or variable and run **MATLAB Viz: Trace Symbol References**. MATLAB Viz resolves the definition, requests all references, and groups those occurrences by containing function. References in script-level code are grouped under the file.

This graph answers “where is this symbol used?” It does not reconstruct values. Edge details list the source lines containing references.

## Limitations

- Results depend on the installed MATLAB language provider's indexing and resolution quality.
- Command-form calls without parentheses are not yet treated as outgoing call candidates.
- Dynamic calls through `eval`, `feval` with computed names, callbacks stored in data, or reflection may be absent.
- A function handle is found syntactically, but the language provider must still resolve it.
- Method dispatch can be ambiguous when the receiver's class is unknown.
- Reference results do not distinguish reads from writes.
- The fallback declaration scanner approximates nested scopes when full document-symbol ranges are unavailable.

MATLAB Viz labels these graphs as `language-service` analysis so they are not confused with MATLAB Dependency Analyzer file graphs.
