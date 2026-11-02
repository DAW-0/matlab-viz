import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import test from "node:test";
import * as vm from "node:vm";
import { buildEntryPointDependencyPath, buildEntryPointReport, buildImpactDependencyPath, buildImpactReport } from "../src/core/entryPointReport";
import { entryPointFixture } from "./support/entryPointFixture";
import { compareAnalyses, createAnalysisBaseline } from "../src/core/analysisComparison";

class Element {
  public children: Element[] = [];
  public attributes: Record<string, string> = {};
  public listeners = new Map<string, Array<(event: any) => void>>();
  public value = "";
  private ownText = "";
  public get textContent(): string { return this.ownText + this.children.map((child) => child.textContent).join(""); }
  public set textContent(value: string) { this.ownText = value; this.children = []; }
  public checked = true;
  public disabled = false;
  public hidden = false;
  public title = "";
  public className = "";
  public style: Record<string, any> = { setProperty: (key: string, value: string) => { this.style[key] = value; } };
  public focused = false;
  public focus(): void { this.focused = true; }
  public click(): void { this.trigger("click"); }
  public options = [{ textContent: "" }, { textContent: "" }, { textContent: "" }];
  public clientWidth = 1000;
  public clientHeight = 600;
  public captured = new Set<number>();
  public setPointerCapture(id: number): void { this.captured.add(id); }
  public hasPointerCapture(id: number): boolean { return this.captured.has(id); }
  public releasePointerCapture(id: number): void { this.captured.delete(id); }
  public get firstChild(): Element | undefined { return this.children[0]; }
  public setAttribute(key: string, value: string): void { this.attributes[key] = value; }
  public getAttribute(key: string): string | undefined { return this.attributes[key]; }
  public appendChild(child: Element): Element { this.children.push(child); return child; }
  public append(...children: Element[]): void { this.children.push(...children); }
  public removeChild(child: Element): void { this.children.splice(this.children.indexOf(child), 1); }
  public replaceChildren(...children: Element[]): void { this.children = children; }
  public addEventListener(name: string, listener: (event: any) => void): void {
    const callbacks = this.listeners.get(name) ?? []; callbacks.push(listener); this.listeners.set(name, callbacks);
  }
  public trigger(name: string, values: Record<string, unknown> = {}): void {
    const event = { target: this, button: 0, pointerId: 1, clientX: 0, clientY: 0, stopPropagation() {}, preventDefault() {}, ...values };
    for (const listener of this.listeners.get(name) ?? []) listener(event);
  }
  public getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
}

const graph = { metadata: { schemaVersion: 1, generatedAt: "saved", root: "/fixture", mode: "folder", graphType: "files", durationSeconds: 0 },
  nodes: ["a", "b", "c", "isolated"].map((id) => ({ id, label: `${id}.m`, relativePath: `${id}.m`, path: `/fixture/${id}.m`, kind: "MATLAB code", external: false, missing: false })),
  edges: [{ id: "ab", source: "a", target: "b", kind: "dependency" }, { id: "bc", source: "b", target: "c", kind: "dependency" }], products: [], problems: [] };

function webview(initialState?: unknown) {
  const controls = new Map<string, Element>();
  const frames: Array<() => void> = [];
  const events = new Map<string, (event: any) => void>();
  const messages: any[] = [];
  const documentEvents = new Map<string, (event: any) => void>();
  const resizeObservers: Array<() => void> = [];
  let snapshot: any;
  const get = (id: string): Element => {
    if (!controls.has(id)) controls.set(id, new Element());
    return controls.get(id)!;
  };
  get("depth").value = "3"; get("direction").value = "all"; get("layout").value = "force";
  // Model the grid's width allocation, not CSS rendering. Native editor tests
  // independently check real computed rectangles and ResizeObserver delivery.
  get("graph-main").clientWidth = 1286;
  get("graph-main").style.setProperty = (key: string, value: string) => {
    get("graph-main").style[key] = value;
    get("graph").clientWidth = get("graph-main").clientWidth <= 800 ? get("graph-main").clientWidth
      : get("graph-main").clientWidth - 6 - Number.parseFloat(value);
  };
  const context = {
    acquireVsCodeApi: () => ({ getState: () => initialState, setState: (value: unknown) => { snapshot = JSON.parse(JSON.stringify(value)); }, postMessage: (message: unknown) => messages.push(message) }),
    document: { getElementById: get, createElement: () => new Element(), createElementNS: () => new Element(),
      addEventListener: (name: string, listener: (event: any) => void) => documentEvents.set(name, listener) },
    window: { addEventListener: (name: string, listener: (event: any) => void) => events.set(name, listener) },
    ResizeObserver: class { constructor(callback: () => void) { resizeObservers.push(callback); } public observe() {} },
    getComputedStyle: () => ({ fontFamily: "Arial, sans-serif", getPropertyValue: () => "" }),
    requestAnimationFrame: (callback: () => void) => { frames.push(callback); return frames.length; }
  };
  const realm = vm.createContext(context);
  vm.runInContext(readFileSync(path.resolve(__dirname, "../../media/graphGeometry.js"), "utf8"), realm);
  vm.runInContext(readFileSync(path.resolve(__dirname, "../../media/graphGrouping.js"), "utf8"), realm);
  vm.runInContext(readFileSync(path.resolve(__dirname, "../../media/graphCycles.js"), "utf8"), realm);
  vm.runInContext(readFileSync(path.resolve(__dirname, "../../media/graph.js"), "utf8"), realm);
  function flush() { for (let count = 0; frames.length && count < 20; count++) frames.shift()!(); assert.equal(frames.length, 0); }
  function send(value: unknown, finish = true) { events.get("message")?.({ data: value }); if (finish) flush(); }
  function load(value = graph, viewState?: unknown) { send({ type: "setGraph", graph: value, defaultLayout: "grid", viewState }); }
  function nodes() { return (get("graph").children[1]?.children ?? []).filter((node) => node.attributes.class?.startsWith("node")); }
  return { get, flush, send, load, nodes, state: () => snapshot, events, messages, resizeObservers, documentEvents };
}

test("unresolved Project names remain visible without guessed file navigation", () => {
  const fixture: any = structuredClone(graph); fixture.metadata.mode = "project";
  fixture.nodes.push({ id: "unknown", label: "UnavailableClass", path: "UnavailableClass", relativePath: "UnavailableClass", kind: "unresolved dependency", unresolved: true, external: false, missing: false });
  fixture.edges.push({ id: "bu", source: "b", target: "unknown", kind: "dependency" });
  const app = webview(); app.load(fixture);
  assert.match(app.get("summary").textContent, /5\/5 files\/names/);
  assert.match(app.get("summary").textContent, /1\/1 unresolved names/);
  app.get("external").checked = false; app.get("external").trigger("change");
  const node = app.nodes().find(n => n.attributes["data-node-id"] === "unknown")!;
  assert.ok(node); node.trigger("click");
  const details = app.get("details");
  assert.match(details.textContent, /Unresolved nameUnavailableClass/);
  assert.match(details.textContent, /ExternalUnknown/);
  assert.match(details.textContent, /MissingNot established/);
  assert.ok(details.children.find(child => child.textContent === "No resolved file")?.disabled);
  node.trigger("dblclick");
  assert.equal(app.messages.filter(message => message.type === "openFile").length, 0);
});

test("webview state preserves filters, selection, layout, positions, details, and custom zoom", () => {
  const first = webview(); first.load();
  first.nodes().find((node) => node.children[1]?.textContent === "b.m")!.trigger("click");
  first.get("direction").value = "dependencies"; first.get("direction").trigger("change");
  first.get("depth").value = "2"; first.get("depth").trigger("change");
  first.get("search").value = "c.m"; first.get("search").trigger("input");
  first.get("external").checked = false; first.get("isolated").checked = false;
  first.get("isolated").trigger("change");
  first.get("graph").trigger("wheel", { clientX: 500, clientY: 300, deltaY: -300 }); first.flush();
  const expected = first.state(); assert.equal(expected.viewportCustomized, true);
  assert.equal(first.nodes().length, 2);
  const second = webview(expected); second.load();
  assert.deepEqual(second.state(), expected);
  assert.equal(second.nodes().length, 2);
  assert.equal(second.get("depth").disabled, false);
  assert.equal(second.get("details").children[0]?.textContent, "b.m");
  second.events.get("resize")?.({}); second.flush();
  assert.deepEqual(second.state().transform, expected.transform, "resize destroyed restored custom zoom");
  second.load();
  assert.deepEqual(second.state(), expected, "reposting an unchanged graph reset state");
});

function groupedFixture() {
  const value = JSON.parse(JSON.stringify(graph));
  value.nodes.forEach((node: any, index: number) => {
    node.path = `/fixture/${index < 2 ? "src" : "lib"}/${node.label}`;
    node.relativePath = `${index < 2 ? "src" : "lib"}/${node.label}`;
  });
  return value;
}

test("entry-point panel requests full original scope, preserves filters and exports host-derived reports", () => {
  const fixture = entryPointFixture(), app = webview(); app.load(fixture as any);
  assert.equal(app.get("entry-point-report").disabled, true);
  app.nodes().find(node => node.attributes["data-node-id"] === "n0")!.trigger("click");
  app.get("direction").value = "dependencies"; app.get("direction").trigger("change");
  app.get("depth").value = "1"; app.get("depth").trigger("change"); app.flush();
  const before = app.state(); assert.equal(app.nodes().length, 2);
  app.get("entry-point-report").trigger("click");
  assert.equal(app.messages.at(-1).type, "entryPointReport");
  assert.equal(app.messages.at(-1).nodeId, "n0"); assert.equal(app.messages.at(-1).depth, undefined);
  const report = buildEntryPointReport(fixture, "n0");
  app.send({ type: "entryPointReport", graphKey: JSON.stringify(fixture.metadata), report });
  assert.match(app.get("details").textContent, /3\/6 original nodes/);
  assert.match(app.get("details").textContent, /1 reachable notices.*1 outside.*2 unattributed/);
  assert.match(app.get("details").textContent, /Constructed function names/);
  assert.equal(app.nodes().length, 2); assert.deepEqual(app.state().controls, before.controls);
  for (const format of ["Markdown", "JSON"]) {
    app.get("details").children.find(child => child.textContent === `Export report (${format})`)!.trigger("click");
    assert.equal(app.messages.at(-1).type, "exportEntryPointReport");
  }
  const saved = app.state(), restored = webview(saved); restored.load(fixture as any);
  assert.equal(restored.messages.at(-1).type, "entryPointReport");
  assert.equal(restored.messages.at(-1).nodeId, "n0");
  assert.deepEqual(restored.state().transform, saved.transform);
});

test("entry-point report ignores stale responses and does not replace another selected node", () => {
  const fixture = entryPointFixture(), app = webview(); app.load(fixture as any);
  app.nodes().find(node => node.attributes["data-node-id"] === "n0")!.trigger("click");
  app.get("entry-point-report").trigger("click");
  const report = buildEntryPointReport(fixture, "n0");
  app.send({ type: "entryPointReport", graphKey: "stale", report });
  assert.match(app.get("details").textContent, /Preparing entry-point/);
  app.nodes().find(node => node.attributes["data-node-id"] === "n1")!.trigger("click");
  app.send({ type: "entryPointReport", graphKey: JSON.stringify(fixture.metadata), report });
  assert.equal(app.get("details").children[0]!.textContent, "scopeLeaf.m");
  app.nodes().find(node => node.attributes["data-node-id"] === "unknown")!.trigger("click");
  assert.equal(app.get("entry-point-report").disabled, true);
  fixture.metadata.graphType = "references"; fixture.metadata.generatedAt = "changed";
  app.load(fixture as any); app.nodes()[0]!.trigger("click");
  assert.equal(app.get("entry-point-report").disabled, true);
});

test("entry-point pagination/navigation and failure retention preserve evidence; successful analysis resets stale report", () => {
  const fixture = entryPointFixture();
  for (let i = 0; i < 60; i++) {
    fixture.nodes.push({ ...fixture.nodes[1]!, id: `extra${i}`, path: `/fixture/extra${i}.m`, relativePath: `extra${i}.m` });
    fixture.edges.push({ id: `extra-edge${i}`, source: "n1", target: `extra${i}`, kind: "dependency" });
  }
  const app = webview(); app.load(fixture as any); app.nodes()[0]!.trigger("click"); app.get("entry-point-report").trigger("click");
  const key = JSON.stringify(fixture.metadata), report = buildEntryPointReport(fixture, "n0");
  app.send({ type: "entryPointReport", graphKey: key, report });
  assert.match(app.get("details").textContent, /Nodes 1–50 of 63/);
  app.get("details").children.find(child => child.textContent === "Next nodes")!.trigger("click");
  assert.match(app.get("details").textContent, /Nodes 51–63 of 63/);
  const open = app.get("details").children.find(child => child.textContent === "extra59.m · 2 hops")!; open.trigger("click");
  assert.equal(app.messages.at(-1).type, "openFile"); assert.equal(app.messages.at(-1).path, "/fixture/extra59.m");
  const text = app.get("details").textContent;
  app.send({ type: "analysisStatus", status: { kind: "failed", message: "Fixture limit", occurredAt: "now" } });
  assert.equal(app.get("details").textContent, text); assert.equal(app.get("analysis-status").hidden, false);
  const fresh = structuredClone(fixture); fresh.metadata.generatedAt = "new analysis"; app.load(fresh as any);
  assert.equal(app.get("entry-point-report").disabled, true); assert.ok(!app.get("details").textContent.includes("Entry-point dependency report"));
});

function cyclicFixture() {
  const value = groupedFixture();
  value.nodes.push(...["d", "e"].map((id) => ({ ...value.nodes[0], id, label: `${id}.m`, relativePath: `other/${id}.m`, path: `/fixture/other/${id}.m` })));
  value.edges = [["a", "b"], ["b", "c"], ["c", "a"], ["d", "d"], ["c", "d"], ["b", "isolated"]]
    .map(([source, target]) => ({ id: `${source}${target}`, source, target, kind: "dependency" }));
  return value;
}

/** Exercise the real host-derived report document, not a hand-built scope. */
function prepareReport(app: ReturnType<typeof webview>, value: any, id: string) {
  const report = buildEntryPointReport(value, id);
  // Existing selection may be an original member of a collapsed group.
  const original = app.nodes().find(node => node.attributes["data-node-id"] === id);
  if (original) original.trigger("click");
  app.get("entry-point-report").trigger("click");
  app.send({ type: "entryPointReport", graphKey: JSON.stringify(value.metadata), report });
  return report;
}

function showReportView(app: ReturnType<typeof webview>) {
  app.get("details").children.find(child => child.textContent === "Show report scope in graph")!.trigger("click"); app.flush();
}

function prepareImpactReport(app: ReturnType<typeof webview>, value: any, id: string) {
  app.nodes().find(node => node.attributes["data-node-id"] === id)!.trigger("click");
  app.get("impact-report").trigger("click");
  const report = buildImpactReport(value, id);
  app.send({ type: "impactReport", graphKey: JSON.stringify(value.metadata), report });
  return report;
}

test("comparison controls use original selected scope without changing graph positions, filters or visual exports", () => {
  const value = entryPointFixture(), app = webview(); app.load(value as any);
  app.nodes().find(node => node.attributes["data-node-id"] === "n0")!.trigger("click"); app.flush();
  const prior = app.state(); app.get("compare-analyses").trigger("click");
  const info = app.messages.at(-1); assert.equal(info.action, "info");
  app.send({ type: "comparisonState", graphKey: info.graphKey, requestId: info.requestId, baselinePath: "/exports/baseline.json" });
  app.get("details").children.find(child => child.textContent === "Compare selected dependency scope")!.trigger("click");
  const request = app.messages.at(-1); assert.equal(request.scope, "dependencies"); assert.equal(request.nodeId, "n0");
  const result = { id: "host-snapshot", report: compareAnalyses(createAnalysisBaseline(value), value, { mode: "dependencies", nodeId: "n0" }) };
  app.send({ type: "comparisonState", graphKey: request.graphKey, requestId: request.requestId, baselinePath: "/exports/baseline.json", result });
  assert.match(app.get("details").textContent, /Analysis comparison.*Nodes: 0 added.*Scope nodes: 3 → 3/);
  assert.deepEqual(app.state().positions, prior.positions); assert.deepEqual(app.state().transform, prior.transform);
  assert.deepEqual(app.state().controls, prior.controls); assert.equal(app.nodes().length, 6);
  app.get("details").children.find(child => child.textContent === "Export comparison (JSON)")!.trigger("click");
  assert.equal(app.messages.at(-1).comparisonId, result.id); assert.equal(app.messages.at(-1).action, "export");
  assert.equal(app.messages.at(-1).data, undefined, "webview must not supply authoritative report records");
});

test("comparison restoration requests a fresh host report; stale replies cannot replace selection or new analysis", () => {
  const value = entryPointFixture(), app = webview(); app.load(value as any);
  app.nodes().find(node => node.attributes["data-node-id"] === "n4")!.trigger("click");
  app.get("compare-analyses").trigger("click"); const info = app.messages.at(-1);
  app.send({ type: "comparisonState", graphKey: info.graphKey, requestId: info.requestId, baselinePath: "/exports/baseline.json" });
  app.get("details").children.find(child => child.textContent === "Compare selected impact scope")!.trigger("click");
  const request = app.messages.at(-1), result = { id: "snapshot", report: compareAnalyses(createAnalysisBaseline(value), value, { mode: "impact", nodeId: "n4" }) };
  app.send({ type: "comparisonState", graphKey: request.graphKey, requestId: request.requestId, baselinePath: "/exports/baseline.json", result });
  const restored = webview(app.state()); restored.load(value as any);
  const restoredRequest = restored.messages.find(message => message.type === "comparisonAction");
  assert.equal(restoredRequest.action, "compare"); assert.equal(restoredRequest.scope, "impact"); assert.equal(restoredRequest.nodeId, "n4");
  restored.send({ type: "comparisonState", graphKey: restoredRequest.graphKey, requestId: restoredRequest.requestId, error: "Baseline file missing" });
  assert.match(restored.get("details").textContent, /Baseline file missing/); assert.equal(restored.nodes().length, 6);
  restored.nodes()[0]!.trigger("click");
  restored.send({ type: "comparisonState", graphKey: restoredRequest.graphKey, requestId: restoredRequest.requestId, result });
  assert.ok(!restored.get("details").textContent.includes("Analysis comparison"));
  const fresh = structuredClone(value); fresh.metadata.generatedAt = "new comparison graph"; restored.load(fresh as any);
  assert.equal(restored.state().detailSelection, undefined);
});

test("comparison report caps panel lists, retains export capability and refuses symbol graph controls", () => {
  const value = entryPointFixture(), current = structuredClone(value);
  for (let i = 0; i < 120; i++) current.problems.push({ severity: "warning", message: `New notice ${i}<script>` });
  const app = webview(); app.load(current as any); app.get("compare-analyses").trigger("click"); let request = app.messages.at(-1);
  app.send({ type: "comparisonState", graphKey: request.graphKey, requestId: request.requestId, baselinePath: "/exports/baseline.json" });
  app.get("details").children.find(child => child.textContent === "Compare entire analysis")!.trigger("click"); request = app.messages.at(-1);
  app.send({ type: "comparisonState", graphKey: request.graphKey, requestId: request.requestId, baselinePath: "/exports/baseline.json",
    result: { id: "paged", report: compareAnalyses(createAnalysisBaseline(value), current) } });
  assert.match(app.get("details").textContent, /Notices newly reported \(120\).*First 100 shown/);
  assert.equal(app.state().comparisonData, undefined, "full authoritative report must not be serialized into view state");
  const symbols: any = structuredClone(value); symbols.metadata.graphType = "references"; app.load(symbols);
  assert.equal(app.get("compare-analyses").disabled, true);
});

test("impact report ignores display depth, exposes reverse scope and preserves original arrows/export meaning", () => {
  const value = entryPointFixture(), before = JSON.stringify(value), app = webview(); app.load(value as any);
  const report = prepareImpactReport(app, value, "n4");
  assert.match(app.get("details").textContent, /File impact report.*1 direct dependents.*2 total dependents/);
  const previous = app.state(); showReportView(app);
  assert.deepEqual(app.nodes().map(node => node.attributes["data-node-id"]), ["n0", "n1", "n4"]);
  assert.match(app.get("report-scope-text").textContent, /Impact report scope.*incoming dependents.*original arrow directions preserved/);
  app.nodes().find(node => node.attributes["data-node-id"] === "n0")!.trigger("click");
  app.get("details").children.find(child => child.textContent === "Show impact path")!.trigger("click");
  const request = app.messages.at(-1); assert.equal(request.type, "impactDependencyPath");
  app.send({ ...request, route: buildImpactDependencyPath(report, "n0") });
  assert.match(app.get("details").textContent, /Impact path.*from scopeEntry.m to MissingInput.mat/);
  assert.equal(app.get("clear-dependency-path").textContent, "Clear impact path");
  app.send({ type: "requestExport", format: "svg", scope: "graph", scale: 1 });
  assert.match(app.messages.at(-1).data, /Impact report scope.*original arrow directions preserved/);
  assert.match(app.messages.at(-1).data, /class="edge dependency-path"/);
  app.get("return-report-view").trigger("click"); app.flush();
  // Same report remains cached, so Return restores details immediately as well.
  assert.deepEqual(app.state(), previous); assert.equal(JSON.stringify(value), before);
});

test("dangling endpoints cannot form an invented impact bridge in the renderer scope", () => {
  const value = entryPointFixture();
  value.edges.push({ id: "missing-source", source: "absent", target: "n4", kind: "dependency" },
    { id: "bridge", source: "n2", target: "absent", kind: "dependency" });
  const app = webview(); app.load(value as any); const report = prepareImpactReport(app, value, "n4");
  showReportView(app);
  assert.deepEqual(app.nodes().map(node => node.attributes["data-node-id"]), ["n0", "n1", "n4"]);
  assert.equal(app.nodes().length, report.nodes.length);
  assert.match(app.get("summary").textContent, /2\/5 dependencies/);
});

test("switching report directions for the same seed uses one backup and rejects wrong-direction replies", () => {
  const value = entryPointFixture(), app = webview(); app.load(value as any); prepareReport(app, value, "n1");
  const previous = app.state(); showReportView(app); assert.equal(app.nodes().length, 2);
  prepareImpactReport(app, value, "n1"); showReportView(app);
  assert.deepEqual(app.nodes().map(node => node.attributes["data-node-id"]), ["n0", "n1"]);
  assert.deepEqual(app.state().reportScope.previousView, previous);
  app.send({ type: "entryPointReport", graphKey: JSON.stringify(value.metadata), report: buildEntryPointReport(value, "n1") });
  assert.match(app.get("details").textContent, /File impact report/);
  assert.equal(app.state().reportScope.mode, "impact");
  app.get("return-report-view").trigger("click"); app.flush();
  assert.deepEqual(app.state().positions, previous.positions); assert.equal(app.state().reportScope, undefined);
});

test("impact scope and path restore with incoming traversal, retain failure status and clear on new analysis", () => {
  const value = entryPointFixture(), app = webview(); app.load(value as any);
  const report = prepareImpactReport(app, value, "n4"); showReportView(app);
  app.nodes().find(node => node.attributes["data-node-id"] === "n0")!.trigger("click");
  app.get("details").children.find(child => child.textContent === "Show impact path")!.trigger("click");
  const first = app.messages.at(-1);
  app.send({ ...first, route: buildImpactDependencyPath(report, "n0") });
  const saved = app.state(); saved.reportScope.nodeIds = ["n4", "unknown"];
  const restored = webview(saved); restored.load(value as any);
  assert.equal(restored.nodes().length, 3, "membership must be recomputed in the incoming direction");
  const request = restored.messages.find(message => message.type === "impactDependencyPath");
  assert.equal(request.nodeId, "n0");
  // Same IDs in a dependency response cannot overwrite an impact path.
  restored.send({ ...request, type: "entryPointDependencyPath", route: buildImpactDependencyPath(report, "n0") });
  assert.ok(!restored.nodes().some(node => node.attributes.class!.includes("dependency-path")));
  restored.send({ ...request, route: buildImpactDependencyPath(report, "n0") });
  assert.match(restored.get("details").textContent, /Impact path/);
  restored.send({ type: "analysisStatus", status: { kind: "failed", message: "Test failure", occurredAt: "now" } });
  assert.equal(restored.state().reportScope.mode, "impact");
  restored.get("clear-dependency-path").trigger("click"); restored.flush();
  restored.send({ ...request, route: buildImpactDependencyPath(report, "n0") });
  assert.ok(!restored.nodes().some(node => node.attributes.class!.includes("dependency-path")));
  const fresh = structuredClone(value); fresh.metadata.generatedAt = "fresh-impact"; restored.load(fresh as any);
  assert.equal(restored.state().reportScope, undefined); assert.equal(restored.nodes().length, 6);
});

test("Show report scope displays all original nodes/links and Fit, pauses filters, and returns without overview drift", () => {
  const value = entryPointFixture(), before = JSON.stringify(value), app = webview(); value.nodes[1]!.external = true;
  app.load(value as any); prepareReport(app, value, "n0");
  app.get("external").checked = false; app.get("external").trigger("change");
  app.get("direction").value = "dependencies"; app.get("direction").trigger("change");
  app.get("depth").value = "1"; app.get("depth").trigger("change");
  app.get("search").value = "no-match"; app.get("search").trigger("input");
  app.get("graph").trigger("wheel", { deltaY: -250 }); app.flush();
  const overview = app.state();
  for (let i = 0; i < 4; i++) {
    showReportView(app);
    assert.deepEqual(app.nodes().map(node => node.attributes["data-node-id"]), ["n0", "n1", "n4"]);
    assert.match(app.get("summary").textContent, /3\/6 files.*2\/3 dependencies.*report scope/);
    assert.equal(app.get("direction").value, "report"); assert.equal(app.get("report-scope-status").hidden, false);
    assert.equal(app.get("search").value, "");
    for (const id of ["depth", "direction", "grouping", "external", "isolated", "cycle-mode", "cycle-component", "cycles"]) assert.equal(app.get(id).disabled, true, id);
    const points = app.state().positions;
    app.get("details").children.find(child => child.textContent === "Fit report scope")!.trigger("click"); app.flush();
    assert.deepEqual(app.state().positions, points, "Fit relaid out scoped nodes");
    app.get("layout").value = "circle"; app.get("layout").trigger("change");
    app.get("return-report-view").trigger("click"); app.flush();
    assert.equal(app.get("report-scope-status").hidden, true);
    assert.deepEqual(app.state(), overview, "return changed prior filters, positions, details or custom viewport");
  }
  value.nodes[1]!.external = false; assert.equal(JSON.stringify(value), before);
});

test("report scope temporarily reveals original grouped/cycle-hidden members then restores every coordinate bank", () => {
  const value = cyclicFixture(), app = webview(); app.load(value); prepareReport(app, value, "a");
  app.get("grouping").value = "folder"; app.get("grouping").trigger("change");
  app.get("cycle-mode").value = "isolate"; app.get("cycle-mode").trigger("change");
  app.get("entry-point-report").trigger("click"); app.flush();
  const previous = app.state(); assert.equal(app.nodes().length, 4);
  showReportView(app); assert.equal(app.nodes().length, 5);
  assert.equal(app.get("cycle-mode").value, "off"); assert.equal(app.get("grouping").value, "none");
  assert.ok(!app.nodes().some(node => node.attributes["data-group-id"]));
  assert.deepEqual(app.state().reportScope.previousView, previous);
  app.get("return-report-view").trigger("click"); app.flush(); assert.deepEqual(app.state(), previous);
});

test("active report scope and its one-level undo survive cached-state restoration without trusting saved membership", () => {
  const value = entryPointFixture(), app = webview(); app.load(value as any); prepareReport(app, value, "n0");
  const previous = app.state(); showReportView(app);
  app.get("graph").trigger("wheel", { deltaY: -150 }); app.flush(); const saved = app.state();
  saved.reportScope.nodeIds = ["unknown", "n3"]; // Never authoritative.
  const restored = webview(saved); restored.load(value as any);
  restored.send({ type: "entryPointReport", graphKey: JSON.stringify(value.metadata), report: buildEntryPointReport(value, "n0") });
  assert.equal(restored.get("direction").value, "report"); assert.equal(restored.nodes().length, 3);
  assert.deepEqual(restored.state().transform, saved.transform); assert.deepEqual(restored.state().positions, saved.positions);
  assert.equal(restored.state().reportScope.nodeIds, undefined);
  restored.get("return-report-view").trigger("click"); restored.flush(); assert.deepEqual(restored.state(), previous);
});

test("dependency path highlights exact original route without filtering, moving, or changing export data", () => {
  const value = entryPointFixture(), app = webview(); app.load(value as any); prepareReport(app, value, "n0");
  const prior = app.state(); showReportView(app); const scopedPoints = app.state().positions;
  app.nodes().find(node => node.attributes["data-node-id"] === "n4")!.trigger("click");
  app.get("details").children.find(child => child.textContent === "Show dependency path")!.trigger("click");
  const request = app.messages.at(-1); assert.equal(request.type, "entryPointDependencyPath");
  const route = buildEntryPointDependencyPath(buildEntryPointReport(value, "n0"), "n4")!;
  app.send({ ...request, type: "entryPointDependencyPath", route });
  assert.equal(app.nodes().length, 3); assert.deepEqual(app.state().positions, scopedPoints);
  assert.deepEqual(app.nodes().filter(node => node.attributes.class!.includes("dependency-path"))
    .map(node => node.attributes["data-node-id"]), ["n0", "n1", "n4"]);
  assert.match(app.get("details").textContent, /2 analyzed links.*Via function.*Via data/);
  assert.equal(app.get("clear-dependency-path").hidden, false);
  app.get("graph").trigger("click"); app.flush();
  assert.equal(app.get("clear-dependency-path").hidden, false, "background selection should not clear a pinned path");
  app.send({ type: "requestExport", format: "svg", scope: "graph", scale: 1 });
  assert.match(app.messages.at(-1).data, /class="edge dependency-path"/);
  assert.match(app.messages.at(-1).data, /not the only route or a runtime execution trace/);
  app.get("clear-dependency-path").trigger("click"); app.flush();
  assert.equal(app.get("clear-dependency-path").hidden, true);
  assert.ok(!app.nodes().some(node => node.attributes.class!.includes("dependency-path")));
  assert.deepEqual(app.state().positions, scopedPoints);
  app.get("return-report-view").trigger("click"); app.flush(); assert.deepEqual(app.state(), prior);
});

test("path restoration recomputes evidence and stale responses cannot resurrect cleared or replaced routes", () => {
  const value = entryPointFixture(), key = JSON.stringify(value.metadata), app = webview();
  app.load(value as any); prepareReport(app, value, "n0"); showReportView(app);
  app.nodes().find(node => node.attributes["data-node-id"] === "n1")!.trigger("click");
  app.get("details").children.find(child => child.textContent === "Show dependency path")!.trigger("click");
  app.flush(); const first = app.messages.at(-1), saved = app.state();
  app.get("clear-dependency-path").trigger("click"); app.flush();
  app.send({ ...first, type: "entryPointDependencyPath", route: buildEntryPointDependencyPath(buildEntryPointReport(value, "n0"), "n1") });
  assert.equal(app.get("clear-dependency-path").hidden, true);
  // Only target ID is serialized; never trust a webview-saved list of links.
  assert.equal(saved.reportScope.pathTargetId, "n1"); assert.equal(saved.reportScope.pathEdges, undefined);
  const restored = webview(saved); restored.load(value as any);
  const request = restored.messages.find(message => message.type === "entryPointDependencyPath");
  assert.equal(request.seedId, "n0"); assert.equal(request.nodeId, "n1"); assert.equal(request.graphKey, key);
  restored.send({ ...request, type: "entryPointDependencyPath", route: buildEntryPointDependencyPath(buildEntryPointReport(value, "n0"), "n1") });
  assert.match(restored.get("details").textContent, /1 analyzed link/);
  assert.equal(restored.get("clear-dependency-path").hidden, false);
});

test("background click and ordinary node selection cannot lose the active scope or its persistent return control", () => {
  const value = entryPointFixture(), app = webview(); app.load(value as any); prepareReport(app, value, "n0"); showReportView(app);
  const svg = app.get("graph"), moved = app.nodes()[0]!;
  moved.trigger("pointerdown", { clientX: 100, clientY: 100 });
  svg.trigger("pointermove", { clientX: 250, clientY: 150 }); svg.trigger("pointerup", { clientX: 250, clientY: 150 });
  svg.trigger("click"); app.flush(); const dragged = app.state().positions;
  app.nodes().find(node => node.attributes["data-node-id"] === "n1")!.trigger("click");
  app.get("graph").trigger("click"); app.flush();
  assert.deepEqual(app.state().positions, dragged, "selection/deselection relaid out dragged report nodes");
  assert.equal(app.get("direction").value, "report"); assert.equal(app.nodes().length, 3);
  assert.equal(app.get("report-scope-status").hidden, false);
  app.get("return-report-view").trigger("click"); app.flush(); assert.equal(app.nodes().length, 6);
});

test("switching report seeds preserves one original-view backup, and deep scope is never capped at display depth", () => {
  const value = entryPointFixture();
  let source = "n1";
  for (let i = 0; i < 30; i++) {
    const id = `deep${i}`; value.nodes.push({ ...value.nodes[1]!, id, path: `/fixture/${id}.m`, relativePath: `${id}.m` });
    value.edges.push({ id: `chain${i}`, source, target: id, kind: "dependency" }); source = id;
  }
  const app = webview(); app.load(value as any); prepareReport(app, value, "n0");
  const previous = app.state(); showReportView(app); assert.equal(app.nodes().length, 33);
  prepareReport(app, value, "n1"); showReportView(app); assert.equal(app.nodes().length, 32);
  assert.equal(app.state().reportScope.seedId, "n1"); assert.deepEqual(app.state().reportScope.previousView, previous);
  assert.equal(app.state().reportScope.previousView.reportScope, undefined);
  app.get("return-report-view").trigger("click"); app.flush();
  // The original report's seed is restored immediately; the host can rebuild
  // its document asynchronously without delaying coordinate restoration.
  assert.deepEqual(app.state().controls, previous.controls); assert.deepEqual(app.state().positions, previous.positions);
  assert.deepEqual(app.state().transform, previous.transform); assert.equal(app.state().selectedId, "n0");
});

test("scope SVG uses only scoped originals, while report JSON requests retain their established full evidence semantics", () => {
  const value = entryPointFixture(), before = JSON.stringify(value), app = webview(); app.load(value as any); prepareReport(app, value, "n0"); showReportView(app);
  app.send({ type: "requestExport", format: "svg", scope: "graph", scale: 1 });
  const visual = app.messages.at(-1); assert.equal(visual.type, "saveVisual"); assert.equal(visual.nodes, 3); assert.equal(visual.edges, 2);
  assert.match(visual.data, /Entry-point report scope/); assert.ok(!visual.data.includes("scopeOther.m"));
  app.get("details").children.find(child => child.textContent === "Export report (JSON)")!.trigger("click");
  assert.equal(app.messages.at(-1).type, "exportEntryPointReport"); assert.equal(app.messages.at(-1).nodeId, "n0");
  assert.equal(JSON.stringify(value), before);
});

test("latest failure survives scope return and new successful analysis clears both scope and backup", () => {
  const value = entryPointFixture(), app = webview(); app.load(value as any); prepareReport(app, value, "n0"); showReportView(app);
  app.send({ type: "analysisStatus", status: { kind: "cancelled", message: "New cancellation", occurredAt: "now" } });
  app.get("return-report-view").trigger("click"); app.flush();
  assert.equal(app.get("analysis-status").hidden, false); assert.match(app.get("analysis-status-text").textContent, /New cancellation/);
  showReportView(app); const fresh = structuredClone(value); fresh.metadata.generatedAt = "fresh"; app.load(fresh as any);
  assert.equal(app.get("report-scope-status").hidden, true); assert.equal(app.state().reportScope, undefined);
  assert.equal(app.get("direction").disabled, false); assert.equal(app.nodes().length, 6);
});

test("invalid/stale/nested report backups cannot activate a scope", () => {
  const value = entryPointFixture(), app = webview(); app.load(value as any); const saved = app.state();
  for (const scope of [
    { seedId: "unknown", previousView: saved },
    { seedId: "n0", previousView: { ...saved, graphKey: "other" } },
    { seedId: "n0", previousView: { ...saved, reportScope: {} } },
    { seedId: "n0", previousView: { version: 1, graphKey: saved.graphKey } }
  ]) {
    const restored = webview({ ...saved, reportScope: scope }); restored.load(value as any);
    assert.equal(restored.get("report-scope-status").hidden, true); assert.equal(restored.nodes().length, 6);
  }
});

test("cycle browser reports components rather than simple cycles and highlighting preserves graph data/viewport", () => {
  const view = webview(), value = cyclicFixture(), saved = JSON.stringify(value); view.load(value);
  assert.equal(view.get("cycles").textContent, "Cycles (2)");
  assert.equal(view.get("cycle-mode").disabled, false); assert.equal(view.get("cycle-mode").value, "off");
  view.get("graph").trigger("wheel", { deltaY: -100 }); view.flush(); const transform = view.state().transform;
  view.get("cycles").trigger("click"); assert.match(view.get("details").textContent, /component can contain several loops/);
  view.get("cycle-mode").value = "highlight"; view.get("cycle-mode").trigger("change"); view.flush();
  assert.equal(view.nodes().length, 6);
  assert.deepEqual(view.nodes().filter((node) => node.attributes.class!.includes("cyclic")).map((node) => node.attributes["data-node-id"]), ["a", "b", "c", "d"]);
  assert.equal(view.get("graph").children[1]!.children.filter((node) => node.attributes["data-cyclic-links"]).length, 4);
  assert.deepEqual(view.state().transform, transform); assert.equal(JSON.stringify(value), saved);
});

test("isolate one/all components retains internal original links but excludes bridges and tails", () => {
  const view = webview(); view.load(cyclicFixture());
  view.get("cycle-component").value = 'component:"a"'; view.get("cycle-component").trigger("change");
  view.get("cycle-mode").value = "isolate"; view.get("cycle-mode").trigger("change"); view.flush();
  assert.equal(view.nodes().length, 3); assert.match(view.get("summary").textContent, /3\/6 files.*3\/6 dependencies/);
  assert.equal(view.get("direction").disabled, true); assert.equal(view.get("depth").disabled, true);
  assert.match(view.get("depth-label").title, /Cycle isolation.*Highlight cycles/);
  view.get("cycle-component").value = "all"; view.get("cycle-component").trigger("change"); view.flush();
  assert.equal(view.nodes().length, 4); assert.match(view.get("summary").textContent, /4\/6 files.*4\/6 dependencies/);
  view.get("cycle-mode").value = "off"; view.get("cycle-mode").trigger("change"); view.flush();
  assert.equal(view.nodes().length, 6); assert.equal(view.get("direction").disabled, false);
});

test("cycle markings on grouped arrows count only actual cyclic originals and isolation reveals original members", () => {
  const view = webview(); view.load(cyclicFixture());
  view.get("grouping").value = "folder"; view.get("grouping").trigger("change");
  view.get("cycle-mode").value = "highlight"; view.get("cycle-mode").trigger("change"); view.flush();
  const partial = view.get("graph").children[1]!.children.find((node) => node.attributes["data-link-count"] === "2")!;
  assert.equal(partial.attributes["data-cyclic-links"], "1");
  view.get("cycle-component").value = 'component:"a"'; view.get("cycle-component").trigger("change");
  view.get("cycle-mode").value = "isolate"; view.get("cycle-mode").trigger("change"); view.flush();
  assert.deepEqual(view.nodes().map((node) => node.attributes["data-node-id"]), ["a", "b", "c"]);
  view.get("grouping").value = "package"; view.get("grouping").trigger("change"); view.flush();
  assert.equal(view.nodes().length, 3); assert.ok(!view.nodes().some((node) => node.attributes["data-group-id"]));
});

test("cycle isolation compacts far-apart islands, Fit is readable, and the overview never drifts", () => {
  const value = cyclicFixture(), original = JSON.stringify(value), seed = webview(); seed.load(value);
  const saved = seed.state();
  saved.controls.layout = "force";
  // Reproduce a tiny cyclic subset taken from a very tall repository layout.
  saved.positions = value.nodes.map((node: any, i: number) => [node.id, { x: i * 10000, y: i * 40000 }]);
  saved.groupPositions = [["none", saved.positions]];
  const view = webview(saved); view.load(value); const overview = view.state().positions;
  const isolate = () => { view.get("cycle-mode").value = "isolate"; view.get("cycle-mode").trigger("change"); view.flush(); };
  isolate(); const compact = view.state();
  assert.equal(view.nodes().length, 4); assert.ok(compact.transform.k >= 1, "Fit still shrinks a four-node isolated graph");
  assert.deepEqual(compact.groupPositions, [["none", overview]], "isolation overwrote overview coordinates");
  const points = new Map<string, any>(compact.positions);
  assert.ok(Math.max(...[...points.values()].map(point => point.y)) - Math.min(...[...points.values()].map(point => point.y)) < 1500);
  view.get("fit").trigger("click"); view.flush(); assert.deepEqual(view.state().positions, compact.positions);
  const restored = webview(view.state()); restored.load(value); assert.deepEqual(restored.state(), view.state());
  for (let i = 0; i < 3; i++) {
    view.get("cycle-mode").value = "off"; view.get("cycle-mode").trigger("change"); view.flush();
    assert.deepEqual(view.state().positions, overview);
    isolate(); assert.deepEqual(view.state().positions, compact.positions, "repeated isolation drifted");
  }
  view.get("cycle-component").value = 'component:"d"'; view.get("cycle-component").trigger("change"); view.flush();
  assert.equal(view.nodes().length, 1); assert.ok(view.state().transform.k >= 1);
  view.get("cycle-component").value = "all"; view.get("cycle-component").trigger("change"); view.flush();
  assert.deepEqual(view.state().positions, compact.positions);
  for (const kind of ["grid", "hierarchical", "circle", "force"]) {
    view.get("layout").value = kind; view.get("layout").trigger("change"); view.flush();
    assert.ok(view.state().transform.k >= .7, `${kind} retained repository-sized gaps`);
    assert.deepEqual(view.state().groupPositions, [["none", overview]]);
  }
  assert.equal(JSON.stringify(value), original);
});

test("legacy isolated view state is compacted once without discarding overview coordinates", () => {
  const value = cyclicFixture(), seed = webview(); seed.load(value);
  const legacy = seed.state(); legacy.controls.cycleMode = "isolate";
  delete legacy.cyclePositionVersion; delete legacy.cyclePositions;
  legacy.positions = value.nodes.map((node: any, i: number) => [node.id, { x: 0, y: i * 50000 }]);
  legacy.groupPositions = [["none", legacy.positions]]; legacy.viewportCustomized = true;
  const view = webview(legacy); view.load(value);
  assert.ok(view.state().transform.k >= 1); assert.equal(view.state().viewportCustomized, false);
  assert.deepEqual(view.state().groupPositions, legacy.groupPositions);
  assert.equal(view.state().cyclePositionVersion, 1);
});

test("isolated grouping expansion never repositions known overview nodes when cycles are turned off", () => {
  const value = cyclicFixture(), view = webview(); view.load(value);
  view.get("grouping").value = "folder"; view.get("grouping").trigger("change"); view.flush();
  const before = new Map<string, any>(view.state().positions);
  view.get("cycle-mode").value = "isolate"; view.get("cycle-mode").trigger("change"); view.flush();
  view.get("cycle-mode").value = "off"; view.get("cycle-mode").trigger("change"); view.flush();
  const after = new Map<string, any>(view.state().positions);
  for (const [id, point] of before) assert.deepEqual(after.get(id), point);
  assert.equal(view.nodes().length, value.nodes.length);
  const saved = view.state(), restored = webview(saved); restored.load(value); assert.deepEqual(restored.state(), saved);
});

test("opposite grouped arrows do not invent cycles and the no-cycle view describes coverage limits", () => {
  const view = webview(), value = groupedFixture(); value.edges = [{ id: "ac", source: "a", target: "c", kind: "dependency" }, { id: "ib", source: "isolated", target: "b", kind: "dependency" }];
  view.load(value); view.get("grouping").value = "folder"; view.get("grouping").trigger("change"); view.flush();
  assert.equal(view.get("cycles").textContent, "Cycles (0)"); assert.equal(view.get("cycle-mode").disabled, true);
  view.get("cycles").trigger("click"); assert.match(view.get("details").textContent, /No directed cycles.*not proof/);
  assert.equal(view.get("graph").children[1]!.children.filter((node) => node.attributes["data-edge-id"]).length, 2);
});

test("visibility filters report partial cycles without reclassifying the original graph", () => {
  const view = webview(), value = cyclicFixture(); value.nodes[2].external = true; view.load(value);
  view.get("cycle-component").value = 'component:"a"'; view.get("cycle-component").trigger("change");
  view.get("cycle-mode").value = "isolate"; view.get("cycle-mode").trigger("change");
  view.get("external").checked = false; view.get("external").trigger("change"); view.flush();
  assert.equal(view.nodes().length, 2); assert.equal(view.get("cycles").textContent, "Cycles (2)");
  assert.match(view.get("details").textContent, /2\/3 selected component members and 1\/3 internal links currently visible/);
  assert.match(view.get("details").textContent, /Filters\/tracing may hide part of a loop/);
});

test("cycle selection/isolation/details/viewport restore with the same graph; failure retains them and new analysis resets them", () => {
  const first = webview(), value = cyclicFixture(); first.load(value);
  first.get("grouping").value = "folder"; first.get("grouping").trigger("change");
  first.get("cycle-component").value = 'component:"a"'; first.get("cycle-component").trigger("change");
  first.get("cycle-mode").value = "isolate"; first.get("cycle-mode").trigger("change");
  first.get("graph").trigger("wheel", { deltaY: -100 }); first.flush();
  const second = webview(first.state()); second.load(value); assert.deepEqual(second.state(), first.state());
  second.send({ type: "analysisStatus", status: { kind: "failed", message: "test", occurredAt: "now" } });
  assert.equal(second.state().controls.cycleMode, "isolate"); assert.equal(second.nodes().length, 3);
  second.load({ ...value, metadata: { ...value.metadata, generatedAt: "new analysis" }, edges: [] });
  assert.equal(second.get("cycle-mode").value, "off"); assert.equal(second.get("cycles").textContent, "Cycles (0)");
  const malformed = first.state(); malformed.controls.cycleComponent = "absent";
  const safe = webview(malformed); safe.load(value); assert.equal(safe.get("cycle-mode").value, "off");
});

test("cycle SVG exports the isolated vector view and markings while leaving original analysis unchanged", () => {
  const view = webview(), value = cyclicFixture(), saved = JSON.stringify(value); view.load(value);
  view.get("cycle-component").value = 'component:"a"'; view.get("cycle-component").trigger("change");
  view.get("cycle-mode").value = "isolate"; view.get("cycle-mode").trigger("change"); view.flush();
  view.send({ type: "requestExport", format: "svg", scope: "graph" });
  const output = view.messages.find((message) => message.type === "saveVisual");
  assert.equal(output.nodes, 3); assert.equal(output.edges, 3);
  assert.equal((output.data.match(/class="node cyclic"/g) || []).length, 3);
  assert.equal((output.data.match(/data-cyclic-links="1"/g) || []).length, 3);
  assert.match(output.data, /Cycle view: isolate/); assert.doesNotMatch(output.data, /<image/);
  assert.equal(JSON.stringify(value), saved);
});

test("cycle member pagination restores and source navigation sends exact readonly positions", () => {
  const view = webview(), value = cyclicFixture();
  value.nodes = Array.from({ length: 205 }, (_, i) => ({ ...value.nodes[0], id: `r${i}`, label: `r${i}`, relativePath: `r${i}.m`, path: `/fixture/r${i}.m`, line: i, character: 2 }));
  value.edges = value.nodes.map((node: any, i: number) => ({ id: `e${i}`, source: node.id, target: value.nodes[(i + 1) % 205].id, kind: "dependency" }));
  view.load(value); view.get("cycles").trigger("click");
  assert.equal(view.get("details").children.filter((node) => node.textContent.startsWith("Open:")).length, 100);
  view.get("details").children.find((node) => node.textContent === "Next 100 members")!.trigger("click"); view.flush();
  assert.equal(view.state().cycleMemberPage, 1); assert.match(view.get("details").textContent, /Members 101–200 of 205/);
  const restored = webview(view.state()); restored.load(value); assert.equal(restored.state().cycleMemberPage, 1);
  restored.get("details").children.find((node) => node.textContent.startsWith("Open:"))!.trigger("click");
  assert.equal(restored.messages.at(-1).type, "openFile"); assert.equal(restored.messages.at(-1).character, 2);
  assert.equal(typeof restored.messages.at(-1).line, "number");
});

test("function self-links describe direct recursion while reference cycles do not claim runtime behavior", () => {
  for (const type of ["call-hierarchy", "references"]) {
    const view = webview(), value = cyclicFixture(); value.metadata.graphType = type; view.load(value);
    view.get("cycle-component").value = 'component:"d"'; view.get("cycle-component").trigger("change");
    view.get("cycle-mode").value = "isolate"; view.get("cycle-mode").trigger("change"); view.flush();
    assert.equal(view.nodes().length, 1); assert.match(view.get("details").textContent, /1 symbols; 1 internal/);
    if (type === "call-hierarchy") { assert.match(view.get("details").textContent, /\(direct recursion\)/); assert.equal(view.get("depth").disabled, false); }
    else assert.doesNotMatch(view.get("details").textContent, /\(direct recursion\)/);
  }
});

test("repeated Collapse all and Expand all are exact no-ops even for disconnected Force groups", () => {
  const view = webview(), value = groupedFixture(); value.edges = [];
  view.load(value); view.get("grouping").value = "folder"; view.get("grouping").trigger("change");
  view.get("layout").value = "force"; view.get("layout").trigger("change"); view.flush();
  for (const action of ["collapse", "expand"]) {
    view.get(`${action}-groups`).trigger("click"); view.flush();
    const expected = view.state(), elements = view.nodes();
    for (let i = 0; i < 20; i++) { view.get(`${action}-groups`).trigger("click"); view.flush(); }
    assert.deepEqual(view.state(), expected, `${action} reran layout or changed the viewport`);
    assert.deepEqual(view.nodes(), elements, `${action} rebuilt unchanged nodes`);
  }
});

test("isolated expansion keeps unrelated nodes fixed and focuses a compact visible member block in every layout", () => {
  for (const layout of ["force", "grid", "hierarchical", "circle"]) {
    const view = webview(), value = groupedFixture(); value.edges = [];
    view.load(value); view.get("grouping").value = "folder"; view.get("grouping").trigger("change");
    view.get("layout").value = layout; view.get("layout").trigger("change"); view.flush();
    const before = new Map<string, any>(view.state().positions), target = view.nodes().find((node) => node.textContent.includes("src"))!;
    const id = target.attributes["data-node-id"]!, anchor = before.get(id);
    target.trigger("dblclick"); view.flush();
    const after = new Map<string, any>(view.state().positions), transform = view.state().transform;
    for (const [other, point] of before) if (other !== id) assert.deepEqual(after.get(other), point, `${layout}: unrelated node moved`);
    const a = after.get("a"), b = after.get("b");
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1000, `${layout}: disconnected members scattered`);
    assert.ok(Math.hypot((a.x + b.x) / 2 - anchor.x, (a.y + b.y) / 2 - anchor.y) < 1000, `${layout}: expansion teleported`);
    for (const member of view.nodes().filter((node) => ["a", "b"].includes(node.attributes["data-node-id"]!))) {
      const point = after.get(member.attributes["data-node-id"]!), rect = member.children[0]!;
      const x = point.x * transform.k + transform.x, y = point.y * transform.k + transform.y;
      const width = Number(rect.attributes.width) * transform.k, height = Number(rect.attributes.height) * transform.k;
      assert.ok(x - width / 2 >= 0 && x + width / 2 <= view.get("graph").clientWidth, `${layout}: member outside horizontal viewport`);
      assert.ok(y - height / 2 >= 0 && y + height / 2 <= view.get("graph").clientHeight, `${layout}: member outside vertical viewport`);
    }
    assert.equal(view.state().viewportCustomized, true);
  }
});

test("twenty isolated expand/collapse cycles preserve summary anchors without cumulative drift", () => {
  const view = webview(), value = groupedFixture(); value.edges = [];
  view.load(value); view.get("grouping").value = "folder"; view.get("grouping").trigger("change"); view.flush();
  const before = new Map<string, any>(view.state().positions), target = view.nodes().find((node) => node.textContent.includes("src"))!.attributes["data-node-id"]!;
  for (let i = 0; i < 20; i++) {
    view.nodes().find((node) => node.attributes["data-node-id"] === target)!.trigger("dblclick"); view.flush();
    view.get("collapse-groups").trigger("click"); view.flush();
    const after = new Map<string, any>(view.state().positions);
    for (const [id, point] of before) assert.deepEqual(after.get(id), point, `cycle ${i}: summary drift`);
  }
});

test("individual collapse and member inspection preserve unrelated manually positioned groups", () => {
  const view = webview(); view.load(groupedFixture());
  view.get("grouping").value = "folder"; view.get("grouping").trigger("change"); view.flush();
  const group = view.nodes().find((node) => node.textContent.includes("src"))!, id = group.attributes["data-node-id"]!;
  const before = new Map<string, any>(view.state().positions);
  group.trigger("click"); view.get("details").children.find((node) => node.textContent === "Inspect: src/a.m")!.trigger("click"); view.flush();
  assert.equal(view.state().selectedId, "a");
  view.get("groups").trigger("click"); view.get("details").children.find((node) => node.textContent.startsWith("Collapse: src"))!.trigger("click"); view.flush();
  const after = new Map<string, any>(view.state().positions);
  for (const [other, point] of before) assert.deepEqual(after.get(other), point, `inspection/collapse moved ${other}`);
  assert.ok(view.nodes().some((node) => node.attributes["data-node-id"] === id));
});

test("group controls collapse/expand individually, inspect original nodes, and preserve ungrouped positions", () => {
  const view = webview(); view.load(groupedFixture());
  const ungrouped = view.state().positions;
  view.get("grouping").value = "folder"; view.get("grouping").trigger("change"); view.flush();
  assert.equal(view.nodes().length, 2); assert.match(view.get("summary").textContent, /4\/4 files.*2\/2 dependencies.*2 collapsed groups.*1 internal/);
  const src = view.nodes().find((node) => node.textContent.includes("src"))!;
  src.trigger("click"); view.flush(); assert.match(view.get("details").textContent, /2\/2 files.*1 internal dependencies/);
  view.get("details").children.find((node) => node.textContent === "Expand group")!.trigger("click"); view.flush();
  assert.equal(view.nodes().length, 3);
  view.get("groups").trigger("click"); view.flush();
  view.get("details").children.find((node) => node.textContent.startsWith("Collapse: src"))!.trigger("click"); view.flush();
  assert.equal(view.nodes().length, 2);
  view.get("expand-groups").trigger("click"); view.flush(); assert.equal(view.nodes().length, 4);
  view.get("collapse-groups").trigger("click"); view.flush(); assert.equal(view.nodes().length, 2);
  view.nodes().find((node) => node.textContent.includes("src"))!.trigger("click"); view.flush();
  view.get("details").children.find((node) => node.textContent === "Inspect: src/a.m")!.trigger("click"); view.flush();
  assert.equal(view.state().selectedId, "a"); assert.equal(view.nodes().length, 3); assert.equal(view.get("details").children[0]?.textContent, "a.m");
  view.get("grouping").value = "none"; view.get("grouping").trigger("change"); view.flush();
  assert.deepEqual(view.state().positions, ungrouped);
  assert.equal(view.get("groups").disabled, true); assert.equal(view.nodes().length, 4);
});

test("group tracing uses original file hops instead of aggregate shortcuts in both directions", () => {
  const view = webview(), value = groupedFixture(); view.load(value);
  // Keep an individual seed while collapsing its owner: a -> b (same group)
  // -> c (other group). One original hop must not reveal c through the group.
  view.nodes().find((node) => node.attributes["data-node-id"] === "a")!.trigger("click");
  view.get("grouping").value = "folder"; view.get("grouping").trigger("change");
  view.get("direction").value = "dependencies"; view.get("depth").value = "1"; view.get("direction").trigger("change"); view.flush();
  assert.equal(view.nodes().length, 1); assert.match(view.get("summary").textContent, /2\/4 files.*1\/2 dependencies/);
  assert.match(view.nodes()[0]!.textContent, /src/);
  view.get("depth").value = "2"; view.get("depth").trigger("change"); view.flush();
  assert.equal(view.nodes().length, 2); assert.match(view.get("summary").textContent, /3\/4 files.*2\/2 dependencies/);
  // Selecting the collapsed lib group seeds c and the isolated member. Incoming
  // depth one includes b but not a, rather than tracing two hops at once.
  view.nodes().find((node) => node.textContent.includes("lib"))!.trigger("click");
  view.get("direction").value = "impact"; view.get("depth").value = "1"; view.get("direction").trigger("change"); view.flush();
  assert.match(view.get("summary").textContent, /3\/4 files.*1\/2 dependencies/);
  assert.match(view.nodes().find((node) => node.textContent.includes("src"))!.textContent, /1\/2 files/);
});

test("grouped state restores selection, edge details, mixed expansion, positions, custom zoom and Refresh grouping", () => {
  const first = webview(), value = groupedFixture(); first.load(value);
  first.get("grouping").value = "folder"; first.get("grouping").trigger("change"); first.flush();
  first.get("layout").value = "circle"; first.get("layout").trigger("change"); first.flush();
  first.nodes().find((node) => node.textContent.includes("src"))!.trigger("dblclick"); first.flush();
  first.get("graph").children[1]!.children.find((node) => node.attributes["data-link-count"])!.trigger("click"); first.flush();
  first.get("graph").trigger("wheel", { deltaY: -100 }); first.flush();
  const saved = first.state(), second = webview(saved); second.load(value);
  assert.deepEqual(second.state(), saved); assert.match(second.get("details").textContent, /Grouped dependencies \(1\).*src\/b.m.*lib\/c.m/);
  second.load({ ...value, metadata: { ...value.metadata, generatedAt: "refreshed" } });
  assert.equal(second.get("grouping").value, "folder"); assert.equal(second.nodes().length, 3);
  assert.equal(second.get("layout").value, "circle");
  assert.deepEqual(second.state().expandedGroups, saved.expandedGroups);
  assert.deepEqual(second.state().positions, saved.positions);
  const third = webview(); third.load(value); third.get("grouping").value = "folder"; third.get("grouping").trigger("change");
  third.nodes()[0]!.trigger("click"); third.flush();
  const restored = webview(third.state()); restored.load(value);
  assert.deepEqual(restored.state(), third.state()); assert.match(restored.get("details").textContent, /Tracing this group/);
});

test("groups search matches contained paths, keyboard expands, double click never opens a synthetic file", () => {
  const view = webview(); view.load(groupedFixture());
  view.get("grouping").value = "folder"; view.get("grouping").trigger("change");
  view.get("search").value = "src/b.m"; view.get("search").trigger("input"); view.flush();
  const src = view.nodes().find((node) => node.textContent.includes("src"))!;
  assert.ok(!src.attributes.class!.includes("dim")); assert.ok(view.nodes().find((node) => node.textContent.includes("lib"))!.attributes.class!.includes("dim"));
  assert.match(src.attributes["aria-label"]!, /Enter to expand/);
  src.trigger("keydown", { key: "Enter" }); view.flush(); assert.equal(view.nodes().length, 3);
  view.get("collapse-groups").trigger("click"); view.nodes()[0]!.trigger("dblclick"); view.flush();
  assert.ok(!view.messages.some((message) => message.type === "openFile"));
});

test("grouped pointer capture drag retains DOM and updates aggregate arrows and counts without lag", () => {
  const view = webview(); view.load(groupedFixture());
  view.get("grouping").value = "folder"; view.get("grouping").trigger("change"); view.flush();
  const node = view.nodes()[0]!, svg = view.get("graph"), world = svg.children[1]!;
  const edge = world.children.find((node) => node.attributes["data-link-count"])!, before = edge.attributes.x1;
  const label = world.children.find((node) => node.attributes.class === "link-count")!, oldX = label.attributes.x;
  node.trigger("pointerdown", { clientX: 100, clientY: 100 });
  for (let i = 0; i < 30; i++) svg.trigger("pointermove", { clientX: 200 + i * 20, clientY: 120 });
  view.flush(); svg.trigger("pointerup"); view.flush();
  assert.equal(view.nodes()[0], node); assert.notEqual(edge.attributes.x1, before); assert.notEqual(label.attributes.x, oldX);
});

test("stale/malformed group state cannot hide new files, inject positions or apply to another root", () => {
  const first = webview(), value = groupedFixture(); first.load(value);
  first.get("grouping").value = "folder"; first.get("grouping").trigger("change"); first.flush();
  const state = first.state(); state.expandedGroups = ["absent", null]; state.groupPositions = [["folder", [["bad", { x: 1, y: 2 }], [state.positions[0][0], { x: Infinity, y: 2 }]]], null, "junk"];
  const next = webview(state); next.load(value); assert.equal(next.nodes().length, 2);
  assert.deepEqual(next.state().expandedGroups, []); assert.ok(!next.state().groupPositions.some((entry: any) => entry[1].some((point: any) => point[0] === "bad")));
  next.load({ ...value, metadata: { ...value.metadata, root: "/other" } }); assert.equal(next.get("grouping").value, "none");
  assert.equal(next.nodes().length, 4);
});

test("grouped call/reference graphs retain symbol terminology and real original relationship evidence", () => {
  for (const [type, terms] of [["call-hierarchy", "calls"], ["references", "reference links"]]) {
    const view = webview(), value = groupedFixture(); value.metadata.graphType = type;
    value.edges[1].details = "lines 9, 10, 14, 16";
    view.load(value); view.get("grouping").value = "folder"; view.get("grouping").trigger("change"); view.flush();
    assert.match(view.get("summary").textContent, new RegExp(`4/4 symbols.*2/2 ${terms}`));
    view.nodes()[0]!.trigger("click"); assert.match(view.get("details").textContent, /2\/2 symbols/);
    view.get("graph").children[1]!.children.find((node) => node.attributes["data-link-count"])!.trigger("click");
    assert.match(view.get("details").textContent, new RegExp(`Grouped ${terms}.*lines 9, 10, 14, 16`));
  }
});

test("collapsed missing/external flags and visibility filters summarize the included original members", () => {
  const view = webview(), value = groupedFixture(); value.nodes[0].missing = true;
  value.nodes[2].external = true; value.nodes[3].external = true;
  view.load(value); view.get("grouping").value = "folder"; view.get("grouping").trigger("change"); view.flush();
  assert.match(view.nodes().find((node) => node.textContent.includes("src"))!.attributes.class!, /missing/);
  assert.match(view.nodes().find((node) => node.textContent.includes("lib"))!.attributes.class!, /external/);
  view.get("external").checked = false; view.get("external").trigger("change"); view.flush();
  assert.equal(view.nodes().length, 1); assert.match(view.get("summary").textContent, /2\/4 files.*1\/2 dependencies/);
  view.get("external").checked = true; view.get("isolated").checked = false; view.get("isolated").trigger("change"); view.flush();
  assert.equal(view.nodes().length, 2); assert.match(view.nodes().find((node) => node.textContent.includes("lib"))!.textContent, /1\/2 files/);
});

test("webview SVG export uses the grouped filtered projection and original-member search highlights", () => {
  const view = webview(); view.load(groupedFixture());
  view.get("grouping").value = "folder"; view.get("grouping").trigger("change");
  view.get("search").value = "src/a.m"; view.get("search").trigger("input"); view.flush();
  view.send({ type: "requestExport", format: "svg", scope: "graph" });
  const exported = view.messages.find((message) => message.type === "saveVisual");
  assert.ok(exported); assert.equal(exported.nodes, 2); assert.equal(exported.edges, 1);
  assert.match(exported.data, /2 original links; 1 links are internal/);
  assert.match(exported.data, /class="link-count"/); assert.equal((exported.data.match(/opacity="0.15"/g) || []).length, 1);
});

test("serializer-supplied view state restores a selected edge and its details", () => {
  const first = webview(); first.load();
  const world = first.get("graph").children[1]!;
  world.children.find((node) => node.attributes.class?.startsWith("edge"))!.trigger("click"); first.flush();
  const expected = first.state(); assert.equal(expected.detailSelection.kind, "edge");
  const second = webview(); second.load(graph, expected);
  assert.equal(second.state().detailSelection.id, "ab");
  assert.ok(second.get("details").children.some((child) => child.textContent.includes("a.m")));
});

test("stale or malformed webview state cannot apply invalid positions or transforms", () => {
  const first = webview(); first.load();
  const snapshot = first.state();
  snapshot.selectedId = "absent";
  snapshot.controls.direction = "dependencies";
  snapshot.positions = [["a", { x: Infinity, y: 0 }], ["absent", { x: 1, y: 1 }]];
  snapshot.transform = { x: NaN, y: 0, k: -5 };
  const second = webview(snapshot); second.load();
  assert.equal(second.get("direction").value, "all");
  assert.equal(second.get("depth").disabled, true);
  assert.ok(Number.isFinite(second.state().transform.x));
  assert.ok(second.state().transform.k > 0);
  const stale = webview({ ...snapshot, graphKey: "another graph" }); stale.load();
  assert.equal(stale.get("search").value, "");
  assert.equal(stale.nodes().length, 4);
  const oldGeometry = first.state(); delete oldGeometry.geometryVersion;
  oldGeometry.controls.search = "a.m";
  oldGeometry.positions = graph.nodes.map((node) => [node.id, { x: 0, y: 0 }]);
  oldGeometry.transform = { x: 0, y: 0, k: 8 };
  const migrated = webview(oldGeometry); migrated.load();
  assert.equal(migrated.get("search").value, "a.m", "migration lost controls");
  assert.equal(migrated.state().geometryVersion, 1);
  assert.ok(migrated.state().positions.some(([, point]: [string, { x: number; y: number }]) => point.x !== 0 || point.y !== 0), "old overlapping positions survived the geometry migration");
});

test("background panning retains selection and trace direction; a real background click clears them", () => {
  const view = webview(); view.load();
  view.nodes().find((node) => node.attributes["data-node-id"] === "b")!.trigger("click");
  view.get("direction").value = "dependencies"; view.get("direction").trigger("change");
  const svg = view.get("graph");
  svg.trigger("pointerdown", { clientX: 20, clientY: 20 });
  svg.trigger("lostpointercapture", { buttons: 1 });
  svg.trigger("pointermove", { clientX: 220, clientY: 180 });
  svg.trigger("pointerup"); svg.trigger("click"); view.flush();
  assert.equal(view.state().selectedId, "b");
  assert.equal(view.get("direction").value, "dependencies");
  assert.equal(view.get("depth").disabled, false);
  svg.trigger("pointerdown"); svg.trigger("pointerup"); svg.trigger("click"); view.flush();
  assert.equal(view.state().selectedId, undefined);
  assert.equal(view.get("direction").value, "all");
  assert.equal(view.get("depth").disabled, true);
});

test("fast node dragging keeps capture on the stable SVG and never rebuilds the node DOM", () => {
  const view = webview(); view.load();
  const node = view.nodes().find((item) => item.attributes["data-node-id"] === "b")!;
  const svg = view.get("graph"), before = node.attributes.transform;
  node.trigger("pointerdown", { clientX: 100, clientY: 100 });
  assert.equal(svg.hasPointerCapture(1), true);
  for (let index = 1; index <= 20; index++) svg.trigger("pointermove", { clientX: 100 + index * 40, clientY: 100 + index * 10 });
  view.flush(); svg.trigger("pointerup"); view.flush();
  assert.equal(view.nodes().find((item) => item === node), node);
  assert.notEqual(node.attributes.transform, before);
  assert.equal(svg.hasPointerCapture(1), false);
  assert.ok(view.state().positions.some(([id, point]: [string, { x: number }]) => id === "b" && Number.isFinite(point.x)));
});

test("a click retargeted to the SVG capture owner still selects the pressed node", () => {
  const view = webview(); view.load();
  const node = view.nodes().find((item) => item.attributes["data-node-id"] === "b")!;
  node.trigger("pointerdown", { clientX: 100, clientY: 100 });
  view.get("graph").trigger("pointerup");
  view.get("graph").trigger("click"); view.flush();
  assert.equal(view.state().selectedId, "b");
  view.get("graph").trigger("dblclick");
  assert.ok(view.messages.some((message) => message.type === "openFile" && message.path === "/fixture/b.m"));
});

test("extreme wheel input keeps finite transforms and Fit recovers the complete graph", () => {
  const view = webview();
  view.send({ type: "setGraph", graph, defaultLayout: "grid" }, false);
  view.get("graph").trigger("wheel", { clientX: 500, clientY: 300, deltaY: -100 }); view.flush();
  assert.equal(view.state().viewportCustomized, true, "a queued initial Fit overwrote an early wheel gesture");
  for (let index = 0; index < 30; index++) view.get("graph").trigger("wheel", { clientX: 500, clientY: 300, deltaY: 1e9 });
  view.flush();
  assert.ok(Number.isFinite(view.state().transform.x)); assert.ok(view.state().transform.k > 0);
  view.get("fit").trigger("click"); view.flush();
  assert.ok(view.state().transform.k > 1e-6);
});

test("details divider handles rapid captured dragging without rebuilding nodes or losing the trace", () => {
  const view = webview(); view.load();
  const node = view.nodes().find((item) => item.attributes["data-node-id"] === "b")!;
  node.trigger("click"); view.get("direction").value = "dependencies"; view.get("direction").trigger("change");
  view.get("graph").trigger("wheel", { deltaY: -100 }); view.flush();
  const before = view.state(), nodes = view.nodes(), divider = view.get("details-resizer");
  divider.trigger("pointerdown", { clientX: 1000 });
  assert.ok(divider.focused); assert.ok(divider.hasPointerCapture(1));
  for (let index = 1; index <= 20; index++) divider.trigger("pointermove", { clientX: 1000 - index * 10, buttons: 1 });
  divider.trigger("pointerup"); view.flush();
  assert.equal(view.state().detailsWidth, 480);
  assert.equal(divider.attributes["aria-valuenow"], "480");
  assert.equal(divider.hasPointerCapture(1), false);
  assert.deepEqual(view.state().positions, before.positions);
  assert.deepEqual(view.state().transform, before.transform);
  assert.equal(view.state().selectedId, "b"); assert.equal(view.get("direction").value, "dependencies");
  assert.deepEqual(view.nodes(), nodes, "resize replaced the rendered graph DOM");
});

test("details keyboard resizing exposes limits and supports fine/coarse steps and reset", () => {
  const view = webview(); view.load(); const divider = view.get("details-resizer");
  for (const [key, shiftKey, expected] of [["ArrowLeft", false, 290], ["ArrowLeft", true, 340], ["ArrowRight", false, 330],
    ["Home", false, 220], ["End", false, 960], ["Enter", false, 280]] as const) {
    divider.trigger("keydown", { key, shiftKey }); view.flush();
    assert.equal(view.state().detailsWidth, expected); assert.equal(divider.attributes["aria-valuenow"], String(expected));
  }
  assert.equal(divider.attributes["aria-valuemin"], "220"); assert.equal(divider.attributes["aria-valuemax"], "960");
  divider.trigger("keydown", { key: "Tab" }); view.flush(); assert.equal(view.state().detailsWidth, 280);
  divider.trigger("keydown", { key: "End" }); divider.trigger("dblclick"); view.flush(); assert.equal(view.state().detailsWidth, 280);
});

test("details pointer limits, cancellation, secondary pointers, and capture recovery leave no stuck gesture", () => {
  const view = webview(); view.load(); const divider = view.get("details-resizer");
  divider.trigger("pointerdown", { clientX: 1000, button: 2 }); divider.trigger("pointermove", { clientX: 0, buttons: 1 }); view.flush();
  assert.equal(view.state().detailsWidth, 280);
  divider.trigger("pointerdown", { clientX: 1000 });
  divider.trigger("pointermove", { clientX: 0, buttons: 1, pointerId: 2 }); view.flush(); assert.equal(view.state().detailsWidth, 280);
  divider.trigger("lostpointercapture", { buttons: 1 }); assert.ok(divider.hasPointerCapture(1));
  divider.trigger("pointermove", { clientX: -1e6, buttons: 1 }); view.flush(); assert.equal(view.state().detailsWidth, 960);
  divider.trigger("pointermove", { clientX: 1e6, buttons: 1 }); view.flush(); assert.equal(view.state().detailsWidth, 220);
  divider.trigger("pointercancel"); divider.trigger("pointermove", { clientX: 500, buttons: 1 }); view.flush();
  assert.equal(view.state().detailsWidth, 220); assert.equal(view.get("graph-main").attributes["data-resizing"], "false");
  divider.trigger("pointerdown"); divider.trigger("pointermove", { buttons: 0 }); view.flush(); assert.equal(divider.hasPointerCapture(1), false);
  // Reproduce the native renderer's missing-capture notification path: moves
  // and release arrive over another element, not on the requested handle.
  divider.trigger("pointerdown", { clientX: 1000 }); divider.releasePointerCapture(1);
  view.documentEvents.get("pointermove")?.({ pointerId: 1, clientX: 900, buttons: 1, stopPropagation() {} });
  view.documentEvents.get("pointerup")?.({ pointerId: 1, type: "pointerup", stopPropagation() {} }); view.flush();
  assert.equal(view.state().detailsWidth, 320);
  let stopped = false;
  view.documentEvents.get("click")?.({ stopPropagation() { stopped = true; }, preventDefault() {} }); assert.ok(stopped);
  divider.trigger("pointerdown"); view.events.get("blur")?.({}); view.flush(); assert.equal(divider.hasPointerCapture(1), false);
});

test("details width survives Refresh, a new graph, serializer state, and old caches", () => {
  const first = webview(); first.load(); first.get("details-resizer").trigger("keydown", { key: "End" }); first.flush();
  const saved = first.state(); const second = webview(saved); second.load(); assert.equal(second.state().detailsWidth, 960);
  second.load({ ...graph, metadata: { ...graph.metadata, generatedAt: "new" } }); assert.equal(second.state().detailsWidth, 960);
  const serializer = webview(); serializer.load(graph, saved); assert.equal(serializer.state().detailsWidth, 960);
  const legacy = { ...saved }; delete legacy.detailsWidth;
  const old = webview(legacy); old.load(); assert.equal(old.state().detailsWidth, 280);
  const mismatched = webview({ ...saved, graphKey: "old result" }); mismatched.load();
  assert.equal(mismatched.state().detailsWidth, 960, "view width must not depend on a graph's identity");
});

test("temporary narrow windows clamp the displayed panel without erasing preferred width", () => {
  const view = webview(); view.load(); const divider = view.get("details-resizer");
  divider.trigger("keydown", { key: "End" }); view.flush();
  view.get("graph-main").clientWidth = 900; view.events.get("resize")?.({}); view.flush();
  assert.equal(divider.attributes["aria-valuenow"], "654"); assert.equal(view.get("graph").clientWidth, 240);
  assert.equal(view.state().detailsWidth, 960);
  view.get("graph-main").clientWidth = 700; view.events.get("resize")?.({});
  divider.trigger("pointerdown"); divider.trigger("keydown", { key: "Home" }); view.flush(); assert.equal(view.state().detailsWidth, 960);
  view.get("graph-main").clientWidth = 1600; view.events.get("resize")?.({}); view.flush(); assert.equal(divider.attributes["aria-valuenow"], "960");
});

test("malformed saved widths are ignored and finite widths are bounded", () => {
  for (const [width, expected] of [[undefined, 280], ["500", 280], [NaN, 280], [Infinity, 280], [-1, 220], [1e9, 960], [341.7, 342]] as const) {
    const view = webview({ version: 1, detailsWidth: width }); view.load(); assert.equal(view.state().detailsWidth, expected);
  }
});

test("canvas-only resize refits fitted views and preserves custom zoom without changing graph positions", () => {
  const view = webview(); view.load(); const before = view.state();
  view.get("details-resizer").trigger("keydown", { key: "End" }); view.flush();
  assert.notDeepEqual(view.state().transform, before.transform); assert.deepEqual(view.state().positions, before.positions);
  view.get("graph").trigger("wheel", { deltaY: -100 }); view.flush(); const customized = view.state().transform;
  view.get("graph").clientWidth = 500; for (const callback of view.resizeObservers) callback(); view.flush();
  assert.deepEqual(view.state().transform, customized);
});

test("failure banner retains graph state and treats error text as plain text", () => {
  const view = webview(); view.load();
  view.nodes()[0]!.trigger("click"); view.get("graph").trigger("wheel", { deltaY: -100 }); view.flush();
  const before = view.state(), nodes = view.nodes();
  view.send({ type: "analysisStatus", status: { kind: "failed", message: '<img src=x onerror="bad()">', occurredAt: "now" } });
  assert.equal(view.get("analysis-status").hidden, false);
  assert.match(view.get("analysis-status-text").textContent, /Showing the previous graph/);
  assert.ok(view.get("analysis-status-text").textContent.includes('<img src=x onerror="bad()">'));
  assert.equal(view.get("analysis-status-text").children.length, 0);
  for (const key of ["graphKey", "positions", "transform", "selectedId", "controls", "detailsWidth"]) assert.deepEqual(view.state()[key], before[key]);
  assert.deepEqual(view.nodes(), nodes, "status rebuilt graph nodes");
  view.get("status-logs").click(); assert.equal(view.messages.at(-1).type, "openLogs");
  view.get("status-refresh").click(); assert.equal(view.messages.at(-1).type, "refresh");
});

test("failure/cancellation notices restore only for the same graph and clear after a successful result", () => {
  const view = webview(); view.load();
  view.send({ type: "analysisStatus", status: { kind: "cancelled", message: "Stopped", occurredAt: "now" } });
  const saved = view.state(), restored = webview(saved); restored.load();
  assert.equal(restored.get("analysis-status").hidden, false); assert.match(restored.get("analysis-status-text").textContent, /cancelled/);
  const serializer = webview(); serializer.load(graph, saved); assert.equal(serializer.get("analysis-status").hidden, false);
  restored.send({ type: "setGraph", graph, analysisStatus: null }); assert.equal(restored.get("analysis-status").hidden, true);
  const stale = webview(saved); stale.load({ ...graph, metadata: { ...graph.metadata, generatedAt: "new result" } }); assert.equal(stale.get("analysis-status").hidden, true);
  for (const malformed of [true, { kind: "failed", message: 42 }, { kind: "success", message: "wrong", occurredAt: "now" }]) {
    stale.send({ type: "analysisStatus", status: malformed }); assert.equal(stale.get("analysis-status").hidden, true);
  }
});

test("graph-specific node counts, edge headings, and traversal labels use relationship semantics", () => {
  for (const [type, heading, forward, backward, counts] of [
    ["files", "File dependency", "Dependencies", "Impact", "1 dependency · 1 impacted file"],
    ["call-hierarchy", "Function call", "Callees", "Callers", "1 callee · 1 caller"],
    ["references", "Symbol reference", "Referenced symbols", "Referencing containers", "1 referenced symbol · 1 referencing container"]
  ]) {
    const view = webview(), fixture = { ...graph, metadata: { ...graph.metadata, graphType: type! } }; view.load(fixture);
    view.nodes().find((node) => node.attributes["data-node-id"] === "b")!.trigger("click"); view.flush();
    assert.ok(view.get("details").textContent.includes(counts!));
    assert.equal(view.get("direction").options[1]?.textContent, forward); assert.equal(view.get("direction").options[2]?.textContent, backward);
    const edge = view.get("graph").children[1]!.children.find((node) => node.attributes["data-edge-id"] === "ab")!;
    edge.trigger("click"); view.flush(); assert.equal(view.get("details").children[0]?.textContent, heading);
    if (type === "references") { assert.match(view.get("summary").textContent, /reference links/); assert.match(view.get("details").textContent, /group multiple source occurrences/); }
  }
});

test("external policy describes generated data while visibility and settings actions stay independent", () => {
  for (const [policy, label] of [[true, "enabled"], [false, "disabled"], [undefined, "not recorded"]] as const) {
    const view = webview(), fixture = { ...graph, metadata: { ...graph.metadata, analysisIncludeExternal: policy } }; view.load(fixture);
    assert.ok(view.get("external-policy").textContent.includes(label));
    view.get("external").checked = false; view.get("external").trigger("change"); view.flush();
    assert.ok(view.get("external-policy").textContent.includes(label));
    assert.ok(!view.messages.some((message) => message.type === "refresh"));
    view.get("external-settings").click(); assert.equal(view.messages.at(-1).type, "externalSettings");
    assert.equal(view.get("external").checked, false);
  }
});
