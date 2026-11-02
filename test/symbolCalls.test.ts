import assert from "node:assert/strict";
import test from "node:test";
import { symbolHarness } from "./support/symbolHarness";

test("call discovery retains real self-edges in outgoing/incoming/both directions with syntax or provider evidence", async () => {
  for (const direction of ["outgoing", "incoming", "both"] as const) for (const provider of [false, true]) {
    const fixture = symbolHarness({ "self.m": "function value = self(n)\nvalue=0;\nif n>0\nvalue=self(n-1);\nend\nend\n" });
    if (provider) fixture.providers({ definitions: [fixture.location("self.m", "self")], references: [fixture.location("self.m", "self"), fixture.location("self.m", "self", 1)] });
    const graph = await fixture.analyzeCall("self.m", "self", direction);
    assert.equal(graph.nodes.length, 1); assert.equal(graph.edges.length, 1, `${direction}, provider=${provider}`);
    assert.equal(graph.edges[0]!.source, graph.edges[0]!.target);
    assert.match(graph.edges[0]!.details!, /:4/); assert.equal(graph.edges[0]!.kind, "calls");
  }
});

test("declaration-only provider/index results never invent recursive call edges", async () => {
  for (const direction of ["outgoing", "incoming", "both"] as const) for (const shape of ["word", "line", "placeholder"]) {
    const fixture = symbolHarness({ "self.m": "function value = self(n)\nvalue=n;\nend\n" });
    const declaration = fixture.location("self.m", "self");
    if (shape !== "word") { declaration.range.start = fixture.document("self.m").positionAt(0); declaration.range.end = fixture.document("self.m").positionAt(shape === "line" ? 24 : 0); }
    fixture.providers({ definitions: [declaration], references: [declaration] });
    assert.equal((await fixture.analyzeCall("self.m", "self", direction)).edges.length, 0, `${direction}: ${shape}`);
  }
});

test("same-named array parameters are not promoted to self-recursion by container lookup or syntax fallback", async () => {
  for (const direction of ["outgoing", "incoming", "both"] as const) {
    const fixture = symbolHarness({ "self.m": "function value = self(self)\nvalue=self(1);\nend\n" });
    fixture.providers({ definitions: [fixture.location("self.m", "self", 1)], references: [fixture.location("self.m", "self")] });
    assert.equal((await fixture.analyzeCall("self.m", "self", direction)).edges.length, 0);
  }
});

test("an authoritative function definition can retain recursion despite an ambiguous same-named output binding", async () => {
  const fixture = symbolHarness({ "self.m": "function self = self(n)\nself = self(n-1);\nend\n" });
  fixture.providers({ definitions: [fixture.location("self.m", "self", 1)] });
  const graph = await fixture.analyzeCall("self.m", "self", "outgoing", 1);
  assert.equal(graph.edges.length, 1); assert.equal(graph.edges[0]!.source, graph.edges[0]!.target);
});

test("handles and unknown object receivers do not invent self-invocations; proven package self-calls remain", async () => {
  for (const direction of ["outgoing", "incoming", "both"] as const) {
    for (const body of ["value = @self;", "value = other.self(1);"]) {
      const fixture = symbolHarness({ "self.m": `function value = self(other)\n${body}\nend\n` });
      fixture.providers({ references: [fixture.location("self.m", "self")] });
      assert.equal((await fixture.analyzeCall("self.m", "self", direction)).edges.length, 0, `${direction}: ${body}`);
    }
    const qualified = symbolHarness({ "+pkg/self.m": "function value = self(n)\nvalue = pkg.self(n-1);\nend\n" });
    assert.equal((await qualified.analyzeCall("+pkg/self.m", "self", direction)).edges.length, 1);
  }
});
