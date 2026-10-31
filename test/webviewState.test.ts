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
  public style: Record<string, string> = {};
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
  let snapshot: any;
  const get = (id: string): Element => {
    if (!controls.has(id)) controls.set(id, new Element());
    return controls.get(id)!;
  };
  get("depth").value = "3"; get("direction").value = "all"; get("layout").value = "force";
  const context = {
    acquireVsCodeApi: () => ({ getState: () => initialState, setState: (value: unknown) => { snapshot = JSON.parse(JSON.stringify(value)); }, postMessage: (message: unknown) => messages.push(message) }),
    document: { getElementById: get, createElement: () => new Element(), createElementNS: () => new Element() },
    window: { addEventListener: (name: string, listener: (event: any) => void) => events.set(name, listener) },
    requestAnimationFrame: (callback: () => void) => { frames.push(callback); return frames.length; }
  };
  const realm = vm.createContext(context);
  vm.runInContext(readFileSync(path.resolve(__dirname, "../../media/graphGeometry.js"), "utf8"), realm);
  vm.runInContext(readFileSync(path.resolve(__dirname, "../../media/graph.js"), "utf8"), realm);
  function flush() { for (let count = 0; frames.length && count < 20; count++) frames.shift()!(); assert.equal(frames.length, 0); }
  function send(value: unknown, finish = true) { events.get("message")?.({ data: value }); if (finish) flush(); }
  function load(value = graph, viewState?: unknown) { send({ type: "setGraph", graph: value, defaultLayout: "grid", viewState }); }
  function nodes() { return (get("graph").children[1]?.children ?? []).filter((node) => node.attributes.class?.startsWith("node")); }
  return { get, flush, send, load, nodes, state: () => snapshot, events, messages };
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
