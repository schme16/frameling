import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// The Electron harnesses (scripts/shoot.cjs, a11y.cjs, e2e/*, docs/*) answer the main process's channels from one shared
// list, scripts/ipc-stubs.cjs. A channel added to src/main or src/preload without a stub there would log
// "No handler registered" in every harness, so this keeps the lists in step.
const root = path.join(__dirname, '../..');
const stubs = createRequire(import.meta.url)(path.join(root, 'scripts/ipc-stubs.cjs')) as { STUBBED_INVOKE: string[]; STUBBED_SEND: string[] };

const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const channels = (src: string, re: RegExp) => [...src.matchAll(re)].map((m) => m[1]);

const mainSrc = fs.readdirSync(path.join(root, 'src/main')).filter((f) => f.endsWith('.ts')).map((f) => read(`src/main/${f}`)).join('\n');
const preload = read('src/preload/preload.ts');

const handled = new Set(channels(mainSrc, /\bhandle\(\s*'([\w:]+)'/g));
const received = new Set(channels(mainSrc, /ipcMain\.on\(\s*'([\w:]+)'/g));
const invoked = new Set(channels(preload, /\bcall\(\s*'([\w:]+)'/g));
const sent = new Set(channels(preload, /ipcRenderer\.send\(\s*'([\w:]+)'/g));

describe('harness IPC stubs', () => {
  it('finds the channels at all', () => {
    expect(handled.size).toBeGreaterThan(30);
    expect(invoked.size).toBeGreaterThan(30);
    expect(received.size).toBeGreaterThan(0);
    expect(sent.size).toBeGreaterThan(0);
  });

  it('stubs every invoke channel the main process handles', () => {
    expect([...handled].filter((c) => !stubs.STUBBED_INVOKE.includes(c))).toEqual([]);
  });

  it('stubs every invoke channel the preload calls', () => {
    expect([...invoked].filter((c) => !stubs.STUBBED_INVOKE.includes(c))).toEqual([]);
  });

  it('stubs every send channel', () => {
    expect([...received, ...sent].filter((c) => !stubs.STUBBED_SEND.includes(c))).toEqual([]);
  });

  it('has no stub for a channel that no longer exists', () => {
    expect(stubs.STUBBED_INVOKE.filter((c) => !handled.has(c) && !invoked.has(c))).toEqual([]);
    expect(stubs.STUBBED_SEND.filter((c) => !received.has(c) && !sent.has(c))).toEqual([]);
  });
});
