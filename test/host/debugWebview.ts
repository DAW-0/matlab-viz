interface Context { id: number; sessionId?: string }
interface Target { id: string; type: string; url: string; webSocketDebuggerUrl?: string }

/** Test-only Chromium protocol adapter, bound to the isolated host's loopback port. */
class Connection {
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  public readonly contexts: Context[] = [];
  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id); clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
      } else if (message.method === "Target.attachedToTarget") {
        void this.request("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, message.params.sessionId).catch(() => undefined);
        void this.request("Runtime.enable", {}, message.params.sessionId).catch(() => undefined);
      } else if (message.method === "Runtime.executionContextCreated") {
        if (message.params.context.auxData?.isDefault) this.contexts.push({ id: message.params.context.id, sessionId: message.sessionId });
      } else if (message.method === "Runtime.executionContextDestroyed") {
        const index = this.contexts.findIndex((context) => context.id === message.params.executionContextId && context.sessionId === message.sessionId);
        if (index >= 0) this.contexts.splice(index, 1);
      } else if (message.method === "Runtime.executionContextsCleared") {
        for (let index = this.contexts.length - 1; index >= 0; index--) if (this.contexts[index]!.sessionId === message.sessionId) this.contexts.splice(index, 1);
      }
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("Debugger connection closed")); }
      this.pending.clear();
    });
  }
  public static async open(url: string): Promise<Connection> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("Cannot connect to isolated editor debugger")), { once: true });
    });
    const connection = new Connection(socket);
    await connection.request("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    await connection.request("Runtime.enable");
    return connection;
  }
  public request(method: string, params: unknown = {}, sessionId?: string): Promise<any> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Debugger command timed out: ${method}`)); }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  public async evaluate(context: Context, body: string): Promise<any> {
    const result = await this.request("Runtime.evaluate", { expression: `(function(){${body}})()`, contextId: context.id, returnByValue: true, awaitPromise: true }, context.sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  public close(): void { this.socket.close(); }
  public get isOpen(): boolean { return this.socket.readyState === WebSocket.OPEN; }
}

export class DebugWebview {
  private connections = new Map<string, { target: Target; connection: Connection }>();
  public constructor(private readonly endpoint: string) {}

  public async workbench(): Promise<{ evaluate: (body: string) => Promise<any>; request: (method: string, params?: unknown) => Promise<any> }> {
    const targets = await (await fetch(`${this.endpoint}/json/list`)).json() as Target[];
    const target = targets.find((item) => item.type === "page" && /workbench\.html/.test(item.url));
    if (!target?.webSocketDebuggerUrl) throw new Error("Isolated editor workbench target missing");
    if (!this.connections.has(target.id)) this.connections.set(target.id, { target, connection: await Connection.open(target.webSocketDebuggerUrl) });
    const connection = this.connections.get(target.id)!.connection;
    for (const context of connection.contexts) {
      if (await connection.evaluate(context, "return !!document.querySelector('.monaco-workbench');").catch(() => false)) {
        return { evaluate: (body) => connection.evaluate(context, body), request: (method, params) => connection.request(method, params) };
      }
    }
    throw new Error("Isolated editor workbench context missing");
  }

  public async graph(timeout = 20_000, auxiliaryOnly = false): Promise<{ pageUrl: string; evaluate: (body: string) => Promise<any> }> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const response = await fetch(`${this.endpoint}/json/list`);
      const targets = await response.json() as Target[];
      for (const target of targets.filter((item) => item.type === "page" && item.webSocketDebuggerUrl)) {
        if (auxiliaryOnly && target.url !== "about:blank" && !/auxiliary/i.test(target.url)) continue;
        if (!this.connections.get(target.id)?.connection.isOpen) {
          try { this.connections.set(target.id, { target, connection: await Connection.open(target.webSocketDebuggerUrl!) }); } catch { continue; }
        }
        const connection = this.connections.get(target.id)!.connection;
        for (const context of [...connection.contexts]) {
          try {
            const found = await connection.evaluate(context, "const graph=document.getElementById('graph');return !!(graph && document.getElementById('summary') && graph.getBoundingClientRect().width>0 && graph.querySelector('g.node'));");
            if (found) {
              await connection.evaluate(context, "return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))));");
              return { pageUrl: target.url, evaluate: (body: string) => connection.evaluate(context, body) };
            }
          } catch { /* Other contexts belong to the editor, not the graph. */ }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const targets = await (await fetch(`${this.endpoint}/json/list`)).json() as Target[];
    throw new Error(`No rendered graph found in the isolated editor's debugger contexts; targets: ${JSON.stringify(targets.map(({ id, type, url }) => ({ id, type, url })))}`);
  }
  public close(): void { for (const value of this.connections.values()) value.connection.close(); this.connections.clear(); }
}

export const snapshotBody = `
  const svg=document.getElementById('graph');
  return {
    layout:document.getElementById('layout').value,
    direction:document.getElementById('direction').value,
    depth:document.getElementById('depth').value,
    search:document.getElementById('search').value,
    external:document.getElementById('external').checked,
    isolated:document.getElementById('isolated').checked,
    selected:svg.querySelector('g.node.selected')?.textContent,
    labels:[...svg.querySelectorAll('g.node')].map(node=>node.textContent).sort(),
    transform:svg.querySelector(':scope > g')?.getAttribute('transform'),
    details:document.getElementById('details').textContent,
    detailsWidth:document.getElementById('graph-main').style.getPropertyValue('--details-width')
  };`;
