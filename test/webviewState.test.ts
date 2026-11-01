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
    requestAnimationFrame: (callback: () => void) => { frames.push(callback); return frames.length; }
  };
  const realm = vm.createContext(context);
  vm.runInContext(readFileSync(path.resolve(__dirname, "../../media/graphGeometry.js"), "utf8"), realm);
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
