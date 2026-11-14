// Second review, host side: limits on what a plugin with no power at all (or one small power) can do to the person's attention.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { parseManifest, type Permission } from '../../src/plugins/manifest';
import { PluginRuntime, type HostHooks } from '../../src/plugins/runtime';
import { closeAll, runPlugin, settle } from './harness';

afterEach(() => {
  vi.useRealTimers();
  closeAll();
});

function hooks(over: Partial<HostHooks> = {}): HostHooks & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    getDoc: () => newDoc({ name: 'Doc' }),
    getState: () => ({ frame: 0, activeLayerId: null, selection: [], drawingId: null }),
    edit: () => undefined,
    notify: (m, k) => void log.push(`notify:${k}:${m}`),
    addCommand: () => undefined,
    addExporter: () => undefined,
    addPanel: () => undefined,
    updatePanel: () => undefined,
    problem: (m) => void log.push(`problem:${m}`),
    ...over,
  };
}

function start(code: string, permissions: Permission[], h: ReturnType<typeof hooks>) {
  const w = runPlugin(code);
  const rt = new PluginRuntime(parseManifest({ id: 'tst', name: 'T', version: '1', apiVersion: 2, permissions }), permissions, w.transport, h);
  return { rt, w };
}

describe('toasts', () => {
  it('a plugin cannot flood the person with messages (and error sounds)', async () => {
    const h = hooks();
    const { rt } = start(`frameling.commands.register({ id: 'spam', label: 'Spam' }, async () => { for (let i = 0; i < 100; i++) await frameling.ui.notify('hi ' + i, 'error'); });`, [], h);
    await settle();
    await rt.runCommand('spam');
    await settle();
    const shown = h.log.filter((l) => l.startsWith('notify:'));
    expect(shown.length).toBe(10);
    expect(shown[0]).toBe('notify:error:hi 0');
  });

  it('gets messages through again once the quiet time has passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const h = hooks();
    const { rt } = start(`frameling.commands.register({ id: 'say', label: 'Say' }, async () => { for (let i = 0; i < 12; i++) await frameling.ui.notify('m' + i); });`, [], h);
    await rt.runCommand('say');
    await vi.waitFor(() => expect(h.log.filter((l) => l.startsWith('notify:')).length).toBe(10));
    vi.setSystemTime(Date.now() + 11_000);
    await rt.runCommand('say');
    await vi.waitFor(() => expect(h.log.filter((l) => l.startsWith('notify:')).length).toBe(20));
  });
});

describe('the file picker', () => {
  const code = `frameling.commands.register({ id: 'pick', label: 'Pick' }, async () => {
    try { const f = await frameling.files.pick({ extensions: ['svg'] }); await frameling.ui.notify(f ? 'got ' + f.name : 'none'); } catch (e) { await frameling.ui.notify('err ' + e.message); }
  });`;

  it('opens one window at a time, however many times it asks', async () => {
    let open = 0;
    let most = 0;
    const h = hooks({
      pickFile: async () => {
        most = Math.max(most, ++open);
        await new Promise((r) => setTimeout(r, 20));
        open--;
        return { name: 'a.svg', bytes: new Uint8Array(1) };
      },
    });
    const { rt } = start(code, ['files.read'], h);
    await settle();
    await Promise.all([rt.runCommand('pick'), rt.runCommand('pick'), rt.runCommand('pick')]);
    await settle();
    expect(most).toBe(1);
    expect(h.log.filter((l) => l.includes('already asking')).length).toBe(2);
  });

  it('makes a plugin wait after the person cancels, a little longer each time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    let windows = 0;
    const h = hooks({ pickFile: async () => (windows++, null) });
    const { rt } = start(code, ['files.read'], h);
    const press = async (n: number) => {
      await rt.runCommand('pick');
      await vi.waitFor(() => expect(h.log.filter((l) => l.startsWith('notify:')).length).toBe(n));
    };
    await press(1);
    expect(h.log.at(-1)).toBe('notify:info:none');
    await press(2);
    expect(windows).toBe(1);
    expect(h.log.at(-1)).toMatch(/Wait a while/);
    vi.setSystemTime(Date.now() + 10_500);
    await press(3);
    expect(windows).toBe(2);
    // The second cancel in a row doubles the wait.
    vi.setSystemTime(Date.now() + 10_500);
    await press(4);
    expect(windows).toBe(2);
    vi.setSystemTime(Date.now() + 10_000);
    await press(5);
    expect(windows).toBe(3);
  });
});

// A plugin can put anything it likes on its port. With no power granted, none of it may reach a hook that acts.
describe('raw messages from a plugin with nothing granted (seeded)', () => {
  const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const TYPES = ['register', 'panel', 'call', 'reply', 'error', 'loaded', 'subscribe', 'unsubscribe', 'pong', 'evAck', 'overlay', 'progress', 'event', '__proto__', 'constructor'];
  const METHODS = ['document.get', 'ui.state', 'document.edit', 'ui.notify', 'files.pick', 'shapes.place', 'shapes.update', 'permissions', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', 'nope'];
  const KINDS = ['command', 'exporter', 'panel', 'tool', 'shape', '__proto__', 'x'];
  const EVENTS = ['document.changed', 'selection.changed', 'frame.changed', 'export.started', 'export.finished', '__proto__', 'x'];

  it('never reaches an acting hook, never throws, over 3000 random messages', async () => {
    const r = rng(20260501);
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    const junk = (d = 0): unknown => {
      const k = Math.floor(r() * 9);
      if (d > 3 || k < 3) return pick([null, undefined, 0, -1, 1e308, NaN, Infinity, '', 'x', 'a'.repeat(500), true, false, '__proto__', '../../x']);
      if (k < 5) return Array.from({ length: Math.floor(r() * 4) }, () => junk(d + 1));
      return Object.fromEntries(Array.from({ length: Math.floor(r() * 5) }, () => [pick(['id', 'label', 'title', 'kind', 'name', 'x', 'y', 'ops', 'list', 'props', 'drawingId', 'inst', 'extensions', 'def', 'ui', 'type', 'message', 'event', '__proto__', 'constructor']), junk(d + 1)]));
    };
    const acted: string[] = [];
    let handler: (m: unknown) => void = () => undefined;
    const sent: unknown[] = [];
    const h = hooks({
      getDoc: () => (acted.push('getDoc'), newDoc({})),
      getState: () => (acted.push('getState'), { frame: 0, activeLayerId: null, selection: [], drawingId: null }),
      edit: () => void acted.push('edit'),
      addTool: () => void acted.push('addTool'),
      addShapeKind: () => void acted.push('addShapeKind'),
      setOverlay: () => void acted.push('setOverlay'),
      placeShape: () => (acted.push('placeShape'), 'x'),
      pickFile: async () => (acted.push('pickFile'), null),
      addExporter: () => void acted.push('addExporter'),
      addPanel: () => void acted.push('addPanel'),
    });
    const rt = new PluginRuntime(parseManifest({ id: 'tst', name: 'T', version: '1', apiVersion: 2, permissions: [], events: ['frame.changed'] }), [], { post: (m) => void sent.push(m), onMessage: (fn) => void (handler = fn), close: () => undefined }, h);
    for (let i = 0; i < 3000; i++) {
      const m: Record<string, unknown> = { t: pick(TYPES), id: pick([1, 2, 3, 'x', null]), method: pick(METHODS), kind: pick(KINDS), event: pick(EVENTS), args: junk(), def: junk(), ui: junk(), list: junk(), ops: junk(), done: junk(), total: junk(), message: junk() };
      handler(m);
    }
    await settle(20);
    expect(acted).toEqual([]);
    // Only listening for what the manifest lists, even when it asked for the others.
    expect([...rt.subscribed].every((e) => e === 'frame.changed')).toBe(true);
    rt.stop();
  });
});
