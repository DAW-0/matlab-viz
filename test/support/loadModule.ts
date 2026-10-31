import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import * as vm from "node:vm";

/** Run the compiled extension against bounded VS Code/process adapters. */
export function loadExtensionModule<T>(name: string, adapters: Record<string, unknown>): T {
  const filename = path.resolve(__dirname, "../../src", name);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(filename, "utf8"), {
    module,
    exports: module.exports,
    require: (id: string) => id in adapters ? adapters[id] : localRequire(id),
    __dirname: path.dirname(filename),
    __filename: filename,
    Buffer,
    process,
    console,
    Error,
    setTimeout,
    clearTimeout,
    setImmediate,
    queueMicrotask
  }, { filename });
  return module.exports as T;
}

export class TestCancellationError extends Error {}

export function cancellationToken() {
  const listeners = new Set<() => void>();
  return {
    isCancellationRequested: false,
    onCancellationRequested(listener: () => void) {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    cancel() {
      this.isCancellationRequested = true;
      for (const listener of listeners) listener();
    }
  };
}
