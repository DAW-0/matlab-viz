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
  public textContent = "";
  public checked = true;
  public disabled = false;
  public hidden = false;
  public title = "";
  public className = "";
  public style: Record<string, string> = {};
  public options = [{ textContent: "" }, { textContent: "" }, { textContent: "" }];
  public clientWidth = 1000;
  public clientHeight = 600;
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
    const event = { target: this, stopPropagation() {}, preventDefault() {}, ...values };
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
  vm.runInNewContext(readFileSync(path.resolve(__dirname, "../../media/graph.js"), "utf8"), context);
  function flush() { for (let count = 0; frames.length && count < 20; count++) frames.shift()!(); assert.equal(frames.length, 0); }
  function send(value: unknown) { events.get("message")?.({ data: value }); flush(); }
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
});
