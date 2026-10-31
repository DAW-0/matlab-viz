import assert from "node:assert/strict";
import * as path from "node:path";
import test from "node:test";
import { findMatlabReferenceCandidates, matlabBoundNames, resolveFunctionReference } from "../src/core/matlabReferences";

const file = (...parts: string[]) => path.resolve("/workspace", ...parts);
const candidate = (name: string, ...parts: string[]) => ({ name, path: file(...parts) });

test("function references include calls, qualified handles, and commands but not declarations/comments/strings", () => {
  const source = `function answer = caller(input)
answer = target(input);
callback = @pkg.target;
target input
target
% target(input)
text = "target(input)";
chars = 'target(input)';
disp 'target(input)'
disp prefix 'target(input)'
cellText = [input 'target(input)'];
continued = [ ...
 'target(input)'];
%{
target(input)
%}
end
`;
  assert.deepEqual(findMatlabReferenceCandidates(source).filter((item) => item.name.endsWith("target")).map((item) => item.name),
    ["target", "pkg.target", "target", "target"]);
  assert.ok(!findMatlabReferenceCandidates(source).some((item) => item.name === "caller"));
});

test("same-file locals and private functions have lexical precedence", () => {
  const global = candidate("target", "global", "target.m");
  const local = candidate("target", "owner.m");
  const privateTarget = candidate("target", "private", "target.m");
  assert.equal(resolveFunctionReference("target", file("owner.m"), [global, local, privateTarget]).target, local);
  assert.equal(resolveFunctionReference("target", file("other.m"), [global, local, privateTarget]).target, privateTarget);
  assert.equal(resolveFunctionReference("target", file("child", "caller.m"), [global, local, privateTarget]).target, global);
});

test("duplicate functions never guess MATLAB path order, while a same-folder primary is unambiguous", () => {
  const first = candidate("target", "a", "target.m"), second = candidate("target", "b", "target.m");
  assert.equal(resolveFunctionReference("target", file("caller.m"), [first, second]).ambiguous, true);
  assert.equal(resolveFunctionReference("target", file("a", "caller.m"), [first, second]).target, first);
  assert.equal(resolveFunctionReference("target", file("caller.m"), [candidate("target", "other.m")]).target, undefined);
});

test("qualified package functions are distinct and arbitrary object receivers are not guessed", () => {
  const first = candidate("target", "+first", "target.m"), second = candidate("target", "+second", "target.m");
  const nested = candidate("target", "+first", "+nested", "target.m");
  assert.equal(resolveFunctionReference("first.target", file("caller.m"), [first, second, nested]).target, first);
  assert.equal(resolveFunctionReference("first.nested.target", file("caller.m"), [first, second, nested]).target, nested);
  assert.equal(resolveFunctionReference("target", file("caller.m"), [first, second, nested]).target, undefined);
  assert.equal(resolveFunctionReference("object.target", file("caller.m"), [first, second, nested]).target, undefined);
});

test("obvious input/output/assignment/loop bindings prevent function-name inference", () => {
  const bound = matlabBoundNames(`function [out,other] = caller(input,target)
values(1) = 4;
cells{1} = 2;
[left,right] = deal(1,2);
for item = 1:3
end
global shared secondShared
persistent cache
text = "notBound = 1";
% commented = 1
end`);
  for (const name of ["out", "other", "input", "target", "values", "cells", "left", "right", "item", "shared", "secondShared", "cache", "text"]) assert.ok(bound.has(name), name);
  for (const name of ["caller", "notBound", "commented"]) assert.ok(!bound.has(name), name);
});

test("Unicode strings do not misalign syntax masks used for variable bindings", () => {
  const bound = matlabBoundNames('text = "😀 target = 9";\ntarget = [1,2];\n');
  assert.ok(bound.has("target")); assert.ok(bound.has("text"));
});
