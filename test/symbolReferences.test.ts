import assert from "node:assert/strict";
import test from "node:test";
import { symbolHarness } from "./support/symbolHarness";
import { TestCancellationError } from "./support/loadModule";

const target = "function value = target()\nvalue = 42;\nend\n";

test("empty/declaration-only reference providers recover function and script usages with grouped lines", async () => {
  for (const declarationOnly of ["empty", "word", "whole-line", "placeholder"]) {
    const fixture = symbolHarness({ "target.m": target, "caller.m": "function value = caller\nvalue = target();\nvalue = target();\nend\n",
      "script.m": "callback = @target;\ntarget\n" });
    const declaration = fixture.location("target.m", "target");
    if (declarationOnly === "whole-line" || declarationOnly === "placeholder") {
      declaration.range.start = fixture.document("target.m").positionAt(0);
      declaration.range.end = fixture.document("target.m").positionAt(declarationOnly === "placeholder" ? 0 : target.indexOf("\n"));
    }
    fixture.providers({ references: declarationOnly === "empty" ? [] : [declaration] });
    const { graph } = await fixture.analyze("target.m", "target");
    assert.equal(graph.nodes.length, 3); assert.equal(graph.edges.length, 2);
    assert.ok(graph.edges.some((edge) => edge.details?.includes("lines 2, 3")));
    assert.ok(graph.edges.every((edge) => edge.details?.includes("MATLAB syntax")));
    assert.ok(graph.problems.some((problem) => problem.severity === "information" && problem.message.includes("Recovered")));
  }
});

test("partial provider results merge/deduplicate with syntax evidence without losing occurrence lines", async () => {
  const fixture = symbolHarness({ "target.m": target, "script.m": "target();\ntarget();\n" });
  fixture.providers({ references: [fixture.location("target.m", "target"), fixture.location("script.m", "target")] });
  const { graph } = await fixture.analyze("target.m", "target");
  assert.equal(graph.nodes.length, 2); assert.equal(graph.edges.length, 1);
  assert.ok(graph.edges[0]?.details?.includes("lines 1, 2"));
  assert.ok(graph.edges[0]?.details?.includes("MATLAB syntax + language service"));
});

test("function calls can be selected without a Definition result, while array variables are not promoted", async () => {
  const fixture = symbolHarness({ "target.m": target, "script.m": "value = target();\n" });
  const { graph } = await fixture.analyze("script.m", "target");
  assert.equal(graph.metadata.rootSymbol, "target"); assert.equal(graph.nodes.length, 2);
  assert.equal(graph.nodes.find((node) => node.label === "target")?.kind, "function");
  fixture.setFile("script.m", "value = target();\nfunction out = helper(target)\nout = target;\nend\n");
  assert.equal((await fixture.analyze("script.m", "target")).graph.nodes.find((node) => node.label === "target")?.kind, "function", "an unrelated local-function parameter shadowed the script call");
  fixture.setFile("script.m", "target = [1,2];\nvalue = target(1);\n");
  fixture.providers({ references: [fixture.location("script.m", "target"), fixture.location("script.m", "target", 1)] });
  const variable = await fixture.analyze("script.m", "target", {}, 1);
  assert.equal(variable.graph.nodes.find((node) => node.label === "target")?.kind, "variable");
  assert.equal(variable.graph.nodes.length, 2);
  assert.ok(!variable.graph.problems.some((problem) => problem.message.includes("Recovered")));
});

test("same-named private/local/package functions and shadowed arrays do not create false global references", async () => {
  const fixture = symbolHarness({ "target.m": target, "ordinary.m": "target();\n", "area/caller.m": "target();\n",
    "area/private/target.m": target, "local.m": "target();\nfunction value = target\nvalue=1;\nend\n",
    "+pkg/target.m": target, "qualified.m": "pkg.target();\n", "array.m": "target=[1,2];\nx=target(1);\n" });
  const { graph } = await fixture.analyze("target.m", "target");
  assert.equal(graph.edges.length, 1);
  assert.ok(graph.nodes.some((node) => node.label === "ordinary.m"));
  assert.ok(!graph.nodes.some((node) => ["caller.m", "local.m", "qualified.m", "array.m"].includes(node.label)));
});

test("ambiguous path order is reported instead of connecting every matching function", async () => {
  const fixture = symbolHarness({ "a/target.m": target, "b/target.m": target, "caller.m": "target();\n" });
  const { graph } = await fixture.analyze("a/target.m", "target");
  assert.equal(graph.nodes.length, 1); assert.equal(graph.edges.length, 0);
  assert.ok(graph.problems.some((problem) => problem.message.includes("same-named functions")));
  assert.ok(graph.problems.some((problem) => problem.message.includes("does not prove it is unused")));
});

test("recursive function references are self-edges, but the declaration is not a usage", async () => {
  const fixture = symbolHarness({ "target.m": "function value = target()\nvalue = target();\nend\n" });
  fixture.providers({ references: [fixture.location("target.m", "target"), fixture.location("target.m", "target", 1)] });
  const { graph } = await fixture.analyze("target.m", "target");
  assert.equal(graph.nodes.length, 1); assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0]?.source, graph.edges[0]?.target);
  assert.ok(graph.edges[0]?.details?.startsWith("lines 2;"));
});

test("reference limits retain all occurrence lines for already retained containers", async () => {
  const fixture = symbolHarness({ "target.m": target, "first.m": "target();\ntarget();\n", "second.m": "target();\n" });
  const { graph } = await fixture.analyze("target.m", "target", { maximumNodes: 2 });
  assert.equal(graph.nodes.length, 2); assert.equal(graph.edges.length, 1);
  assert.ok(graph.edges[0]?.details?.startsWith("lines 1, 2;"));
  assert.ok(graph.problems.some((problem) => problem.message.includes("stopped at 2 nodes")));
  const exact = symbolHarness({ "target.m": target, "first.m": "target();\n" });
  assert.ok(!(await exact.analyze("target.m", "target", { maximumNodes: 2 })).graph.problems.some((problem) => problem.message.includes("stopped at")));
});

test("provider failures preserve function syntax recovery and warn rather than silently claiming completeness", async () => {
  const fixture = symbolHarness({ "target.m": target, "caller.m": "target();\n" });
  fixture.providers({ definitions: new Error("Definition timed out"), references: new Error("Reference timed out") });
  const { graph } = await fixture.analyze("target.m", "target");
  assert.equal(graph.nodes.length, 2); assert.equal(graph.edges.length, 1);
  assert.equal(graph.problems.filter((problem) => problem.severity === "warning").length, 2);
});

test("syntax fallback sees dirty buffers and Refresh retains the original function anchor", async () => {
  const fixture = symbolHarness({ "target.m": target, "script.m": "value = 1;\n", "other.m": "other = 2;\n" });
  fixture.setFile("script.m", "target();\n", true);
  const result = await fixture.analyze("target.m", "target");
  assert.equal(result.graph.nodes.length, 2);
  await fixture.analyze("other.m", "other");
  const refreshed = await fixture.refresh(result.anchor);
  assert.equal(refreshed.metadata.rootSymbol, "target"); assert.equal(refreshed.nodes.length, 2);
});

test("an incomplete syntax index reports file limits and read failures rather than proving a function unused", async () => {
  const fixture = symbolHarness({ "target.m": target, "unreadable.m": "target();\n" });
  fixture.failRead("unreadable.m");
  const graph = (await fixture.analyze("target.m", "target")).graph;
  assert.ok(graph.problems.some((problem) => problem.severity === "warning" && problem.message.includes("Could not read")));
  const many = symbolHarness({ "target.m": target,
    ...Object.fromEntries(Array.from({ length: 5000 }, (_, index) => [`file${index}.m`, "value = 1;\n"])) });
  assert.ok((await many.analyze("target.m", "target")).graph.problems.some((problem) => problem.message.includes("first 5000")));
});

test("reference-provider cancellation propagates rather than becoming an inferred success", async () => {
  const fixture = symbolHarness({ "target.m": target, "caller.m": "target();\n" });
  fixture.providers({ references: new TestCancellationError("Expected cancellation") });
  await assert.rejects(fixture.analyze("target.m", "target"), TestCancellationError);
});
