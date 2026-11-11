// Runs a plugin the way the sandbox does (the real prelude, a real MessagePort), but in Node: a stand-in worker scope,
// and the plugin's script evaluated with the `frameling` object. What crosses the port is real structured cloning.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PRELUDE_BODY } from '../../src/plugins/prelude';
import type { Transport } from '../../src/plugins/runtime';

export const EXAMPLES = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../plugins/examples');

export function exampleFiles(name: string): Record<string, Uint8Array> {
  const dir = path.join(EXAMPLES, name);
  return { 'manifest.json': new Uint8Array(readFileSync(path.join(dir, 'manifest.json'))), 'main.js': new Uint8Array(readFileSync(path.join(dir, 'main.js'))) };
}

export interface FakeWorker {
  transport: Transport;
  self: Record<string, any>;
  close(): void;
}

const open: MessagePort[] = [];

export function closeAll(): void {
  for (const p of open.splice(0)) p.close();
}

export function runPlugin(code: string, opts: { id?: string; network?: boolean } = {}): FakeWorker {
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const self: Record<string, any> = {
    addEventListener: (t: string, f: (e: unknown) => void) => (listeners[t] ??= []).push(f),
    __framelingLoad: (src: string, api: unknown) => new Function('frameling', 'self', src)(api, self),
    fetch: () => 'reached the network',
  };
  new Function('self', PRELUDE_BODY)(self);
  const ch = new MessageChannel();
  open.push(ch.port1, ch.port2);
  let handler: ((m: unknown) => void) | null = null;
  ch.port1.onmessage = (e) => handler?.(e.data);
  const transport: Transport = {
    post: (m, t) => ch.port1.postMessage(m, (t ?? []) as Transferable[]),
    onMessage: (fn) => void (handler = fn),
    close: () => {
      ch.port1.close();
      ch.port2.close();
    },
  };
  self.onmessage({ data: { t: 'boot', code, plugin: { id: opts.id ?? 'test', name: 'Test', version: '1' }, network: !!opts.network }, ports: [ch.port2] });
  return { transport, self, close: transport.close };
}

/** Lets messages cross the port (a few turns of the event loop). */
export const settle = (n = 6): Promise<void> => new Promise((r) => {
  let i = 0;
  const step = () => (++i >= n ? r() : setTimeout(step, 0));
  setTimeout(step, 0);
});
