import assert from "node:assert/strict";
import test from "node:test";
import { findMatlabCallCandidates, findMatlabDeclarations } from "../src/core/matlabSyntax";

const source = `function result = main(value)
result = helper(value);
text = "notAFunction(value)";
chars = 'alsoNot(value)';
% ignored(value)
%{
blocked(value)
%}
callback = @afterRun;
result = object.transform(result);
end

function result = helper(value)
result = value + 1;
end
`;

test("call candidate scanner ignores MATLAB strings and comments", () => {
  const names = findMatlabCallCandidates(source).map((candidate) => candidate.name);
  assert.ok(names.includes("main"));
  assert.ok(names.includes("helper"));
  assert.ok(names.includes("afterRun"));
  assert.ok(names.includes("object.transform"));
  assert.ok(!names.includes("notAFunction"));
  assert.ok(!names.includes("alsoNot"));
  assert.ok(!names.includes("ignored"));
  assert.ok(!names.includes("blocked"));
});

test("fallback declaration scanner finds primary and local functions", () => {
  const declarations = findMatlabDeclarations(source);
  assert.deepEqual(declarations.map((declaration) => declaration.name), ["main", "helper"]);
  assert.ok(declarations[0]!.endOffset <= declarations[1]!.startOffset);
});
