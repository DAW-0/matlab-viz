import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import test from "node:test";
import * as vm from "node:vm";

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
  vm.runInContext(readFileSync(path.resolve(__dirname, "../../media/graph.js"), "utf8"), realm);
  function flush() { for (let count = 0; frames.length && count < 20; count++) frames.shift()!(); assert.equal(frames.length, 0); }
  function send(value: unknown, finish = true) { events.get("message")?.({ data: value }); if (finish) flush(); }
  function load(value = graph, viewState?: unknown) { send({ type: "setGraph", graph: value, defaultLayout: "grid", viewState }); }
  function nodes() { return (get("graph").children[1]?.children ?? []).filter((node) => node.attributes.class?.startsWith("node")); }
  return { get, flush, send, load, nodes, state: () => snapshot, events, messages, resizeObservers, documentEvents };
}

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
