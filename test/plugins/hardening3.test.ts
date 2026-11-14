// @vitest-environment jsdom
// Third look at the plugin host: how much a plugin may ask of it, what an update from somewhere else inherits, and ids that
// are also names on every object.
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8 } from 'fflate';
import { newDoc } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';
import { codeFingerprint, sha256Hex } from '../../src/plugins/fingerprint';
import { DASH_LIMITS, outlineLength, safeDash, sanitizeDrawList } from '../../src/plugins/drawlist';
import { installFrom, plugins, removePlugin, resetPluginsForTests, setApprover, setSandboxStarterForTests } from '../../src/plugins/manager';
import { parseManifest, type Permission } from '../../src/plugins/manifest';
import { rememberedValues, rememberValues, sanitizeOptions } from '../../src/plugins/options';
import { EventPipe } from '../../src/plugins/pipe';
import { decide } from '../../src/plugins/powers';
import { PluginRuntime, type HostHooks } from '../../src/plugins/runtime';
import { memoryLibrary, setLibraryForTests } from '../../src/platform/library';
import { closeAll, runPlugin, settle } from './harness';

afterEach(() => {
  vi.useRealTimers();
  closeAll();
});

describe('the code fingerprint', () => {
  it('is SHA-256, for any length and for text with accents and emoji', () => {
    for (const n of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 1000, 100_000]) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 255);
      expect(sha256Hex(bytes), `${n} bytes`).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
    const text = 'const café = "😀";';
    expect(codeFingerprint(text)).toBe(createHash('sha256').update(text).digest('hex'));
  });
});

// ---------------------------------------------------------------- inbound cost

function hooks(over: Partial<HostHooks> = {}): HostHooks & { log: string[]; trips: number } {
  const log: string[] = [];
  const h = {
    log,
    trips: 0,
    getDoc: () => newDoc({ name: 'Doc' }),
    getState: () => ({ frame: 0, activeLayerId: null, selection: [], drawingId: null }),
    edit: () => undefined,
    notify: (m: string, k?: string) => void log.push(`notify:${k}:${m}`),
    addCommand: () => undefined,
    addExporter: () => undefined,
    addPanel: () => undefined,
    updatePanel: () => undefined,
    problem: (m: string) => void log.push(`problem:${m}`),
    ...over,
  };
  return h as never;
}

function raw(permissions: Permission[], h: ReturnType<typeof hooks>) {
  let handler: (m: unknown) => void = () => undefined;
  const sent: any[] = [];
  const rt = new PluginRuntime(parseManifest({ id: 'tst', name: 'T', version: '1', apiVersion: 2, permissions }), permissions, { post: (m) => void sent.push(m), onMessage: (fn) => void (handler = fn), close: () => undefined }, h);
  return { rt, sent, say: (m: unknown) => handler(m) };
}

describe('how much a plugin may ask of the host in a second', () => {
  it('too many messages: the extra ones are dropped, a call is refused (so its promise ends), and the person is told once', async () => {
    const h = hooks();
    const { rt, sent, say } = raw([], h);
    for (let i = 0; i < 2000; i++) say({ t: 'call', id: i + 1, method: 'ui.notify', args: { message: 'x' } });
    await settle();
    expect(h.log.filter((l) => l.startsWith('problem:'))).toHaveLength(1);
    const refused = sent.filter((m) => m.t === 'reply' && m.ok === false && /Too many/.test(m.error));
    expect(refused.length).toBeGreaterThan(1000);
    // A new second brings the allowance back.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 1500);
    sent.length = 0;
    say({ t: 'call', id: 5000, method: 'permissions' });
    await settle();
    expect(sent.find((m) => m.id === 5000)?.ok).toBe(true);
    rt.stop();
  });

  it('too many bytes: a few huge messages use the second up', async () => {
    const h = hooks();
    const { rt, sent, say } = raw(['panels'], h);
    const big = 'a'.repeat(5 * 1024 * 1024);
    for (let i = 0; i < 6; i++) say({ t: 'call', id: i + 1, method: 'ui.notify', args: { message: big } });
    await settle();
    expect(sent.filter((m) => m.t === 'reply' && /Too many/.test(m.error ?? '')).length).toBeGreaterThan(0);
    rt.stop();
  });

  it('answers to the host and heartbeats are never counted, so they cannot be starved', async () => {
    const h = hooks();
    const { rt, say } = raw([], h);
    for (let i = 0; i < 3000; i++) say({ t: 'pong', n: i });
    const p = rt.runCommand('x');
    await settle();
    say({ t: 'reply', id: 1, ok: true, value: null });
    await p;
    expect(h.log.filter((l) => l.startsWith('problem:'))).toEqual([]);
    rt.stop();
  });
});

describe('progress that tries to keep a plugin alive', () => {
  async function jobWith(reports: [number, number][]) {
    const credited = vi.fn();
    const h = hooks({ watchdog: () => undefined });
    const { rt, say } = raw([], h);
    (rt as any).watch.progress = credited;
    const run = rt.runCommand('x');
    await settle();
    for (const [d, t] of reports) say({ t: 'progress', done: d, total: t });
    await settle();
    rt.stop();
    void run.catch(() => undefined);
    return credited.mock.calls.length;
  }

  it('real steps forward each buy more time', async () => {
    expect(await jobWith(Array.from({ length: 10 }, (_, i) => [i + 1, 10] as [number, number]))).toBe(10);
  });

  it('a stream of tiny increases buys time only as often as the job really moved', async () => {
    const tiny = Array.from({ length: 5000 }, (_, i) => [1 + i * 1e-6, 100] as [number, number]);
    expect(await jobWith(tiny)).toBeLessThan(3);
  });

  it('cannot keep growing the goal to keep making "progress"', async () => {
    const growing = Array.from({ length: 200 }, (_, i) => [1.01 ** i, 1.01 ** i] as [number, number]);
    // The goal stays what it first was, so "done" cannot run away from it.
    expect(await jobWith(growing)).toBeLessThanOrEqual(2);
  });
});

describe('the tool event pipe', () => {
  type Ev = { type: 'down' | 'move' | 'up' | 'cancel' | 'key'; n: number };
  it('keeps every press, release and cancel however many pile up behind a slow plugin', async () => {
    const seen: string[] = [];
    let release: () => void = () => undefined;
    const p = new EventPipe<Ev>(async (e) => {
      seen.push(`${e.type}${e.n}`);
      if (e.n === 0) await new Promise<void>((r) => (release = r));
    });
    p.push({ type: 'down', n: 0 }, undefined);
    const wanted: string[] = ['down0'];
    for (let i = 1; i <= 120; i++) {
      // Down, a pair of moves apart from each other (so they are not folded), up, and a cancel.
      p.push({ type: 'down', n: i * 10 }, undefined);
      p.push({ type: 'move', n: i * 10 + 1 }, undefined);
      p.push({ type: 'up', n: i * 10 + 2 }, undefined);
      p.push({ type: 'cancel', n: i * 10 + 3 }, undefined);
      wanted.push(`down${i * 10}`, `up${i * 10 + 2}`, `cancel${i * 10 + 3}`);
    }
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(seen.filter((s) => !s.startsWith('move'))).toEqual(wanted);
  });
});

// ---------------------------------------------------------------- identity

describe('an update with the same id', () => {
  let asked: string[];
  let answer: boolean;
  beforeEach(() => {
    localStorage.clear();
    asked = [];
    answer = true;
    setLibraryForTests(memoryLibrary);
    setSandboxStarterForTests(async (pkg) => runPlugin(pkg.code, { id: pkg.manifest.id }).transport);
    setApprover(async (m, verb) => {
      asked.push(verb);
      if (!answer) return null;
      const d = decide(m, m.permissions, false);
      return { permissions: d.permissions, network: d.network };
    });
    resetStore(newDoc());
  });
  afterEach(async () => {
    resetPluginsForTests();
    setApprover(null);
    for (const e of await memoryLibrary.list('plugins')) await memoryLibrary.remove('plugins', e.id);
    setLibraryForTests(null);
  });

  const files = (code: string, version = '1.0.0') => ({
    'manifest.json': strToU8(JSON.stringify({ id: 'same-id', name: 'Same', version, apiVersion: 2, permissions: ['document.edit'] })),
    'main.js': strToU8(code),
  });
  const saved = () => JSON.parse(localStorage.getItem('frameling.plugins.v1') ?? '{}')['same-id'];

  it('records the code fingerprint and where it came from when the person decides', async () => {
    await installFrom(files('// one'), '/home/a/same.zip');
    expect(saved()).toMatchObject({ fingerprint: codeFingerprint('// one'), source: '/home/a/same.zip' });
  });

  it('the same code keeps what was allowed, wherever it comes from', async () => {
    await installFrom(files('// one'), '/home/a/same.zip');
    await installFrom(files('// one', '1.0.1'), '/elsewhere/same.zip');
    expect(asked).toEqual(['Install']);
  });

  it('new code from the same place keeps what was allowed', async () => {
    await installFrom(files('// one'), '/home/a/same.zip');
    await installFrom(files('// two', '1.1.0'), '/home/a/same.zip');
    expect(asked).toEqual(['Install']);
    expect(saved().fingerprint).toBe(codeFingerprint('// two'));
  });

  it('new code from another place asks again, and saying no keeps the old plugin as it was', async () => {
    await installFrom(files('// one'), '/home/a/same.zip');
    answer = false;
    expect(await installFrom(files('// evil', '9.9.9'), '/downloads/same.zip')).toBe(false);
    expect(asked).toEqual(['Install', 'Update']);
    expect(saved().fingerprint).toBe(codeFingerprint('// one'));
    expect(plugins.get()[0].manifest.version).toBe('1.0.0');
    answer = true;
    expect(await installFrom(files('// evil', '9.9.9'), '/downloads/same.zip')).toBe(true);
    expect(saved()).toMatchObject({ fingerprint: codeFingerprint('// evil'), source: '/downloads/same.zip' });
  });

  it('new code with no known place on either side asks again too', async () => {
    await installFrom(files('// one'));
    await installFrom(files('// two', '1.1.0'));
    expect(asked).toEqual(['Install', 'Update']);
  });

  it('a decision saved before fingerprints counts the stored code as what was decided about', async () => {
    await installFrom(files('// one'), '/home/a/same.zip');
    const all = JSON.parse(localStorage.getItem('frameling.plugins.v1')!);
    delete all['same-id'].fingerprint;
    delete all['same-id'].source;
    localStorage.setItem('frameling.plugins.v1', JSON.stringify(all));
    await installFrom(files('// one', '1.0.2'), '/x/y.zip');
    expect(asked).toEqual(['Install']);
    await installFrom(files('// changed', '1.0.3'), '/z/z.zip');
    expect(asked).toEqual(['Install', 'Update']);
  });
});

// ---------------------------------------------------------------- leftovers and names

describe('removing a plugin', () => {
  beforeEach(() => {
    localStorage.clear();
    setLibraryForTests(memoryLibrary);
    setSandboxStarterForTests(async (pkg) => runPlugin(pkg.code, { id: pkg.manifest.id }).transport);
    setApprover(async (m) => {
      const d = decide(m, m.permissions, false);
      return { permissions: d.permissions, network: d.network };
    });
    window.confirm = () => true;
  });
  afterEach(async () => {
    resetPluginsForTests();
    setApprover(null);
    for (const e of await memoryLibrary.list('plugins')) await memoryLibrary.remove('plugins', e.id);
    setLibraryForTests(null);
  });

  it('forgets the export options it remembered, and only its own', async () => {
    await installFrom({ 'manifest.json': strToU8(JSON.stringify({ id: 'gone-soon', name: 'Gone', version: '1', apiVersion: 2, permissions: [] })), 'main.js': strToU8('') });
    const opts = sanitizeOptions([{ id: 'n', type: 'number', label: 'N', min: 0, max: 10, step: 1, default: 1 }]);
    rememberValues('gone-soon', 'e', { n: 7 });
    rememberValues('gone-soon-not', 'e', { n: 8 });
    expect(rememberedValues('gone-soon', 'e', opts).n).toBe(7);
    await removePlugin('gone-soon');
    expect(plugins.get()).toEqual([]);
    expect(rememberedValues('gone-soon', 'e', opts).n).toBe(1);
    expect(rememberedValues('gone-soon-not', 'e', opts).n).toBe(8);
  });
});

describe('ids and names that every object already has', () => {
  const m = (o: Record<string, unknown>) => ({ id: 'ok-id', name: 'N', version: '1', ...o });
  it('a plugin cannot be called constructor or prototype', () => {
    expect(() => parseManifest(m({ id: 'constructor' }))).toThrow(/reserved/);
    expect(() => parseManifest(m({ id: 'prototype' }))).toThrow(/reserved/);
    expect(() => parseManifest(m({ id: '__proto__' }))).toThrow();
    expect(parseManifest(m({ id: 'constructors' })).id).toBe('constructors');
  });
  it('a permission cannot be a name from Object', () => {
    for (const p of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) expect(() => parseManifest(m({ apiVersion: 2, permissions: [p] }))).toThrow(/permission/);
  });
  it('a call named after Object.prototype is refused as unknown', async () => {
    const h = hooks();
    const { rt, sent, say } = raw(['document.read'], h);
    for (const [i, name] of ['constructor', 'toString', 'hasOwnProperty', '__proto__'].entries()) say({ t: 'call', id: i + 1, method: name });
    await settle();
    expect(sent.filter((s) => s.t === 'reply').map((s) => s.error)).toEqual(Array(4).fill(expect.stringMatching(/has no/)));
    rt.stop();
  });
});

// ---------------------------------------------------------------- dashes

describe('dash patterns', () => {
  const line = (dash: number[], len = 100) => ({ type: 'line' as const, x1: 0, y1: 0, x2: len, y2: 0, dash });
  it('a tiny dash is raised to half a screen pixel', () => {
    expect(safeDash([1e-9, 1e-9], 1, 1, 100)).toEqual([0.5, 0.5]);
    expect(safeDash([1e-9, 1e-9], 1, 4, 100)).toEqual([0.125, 0.125]);
    expect(safeDash([4, 2], 1, 1, 100)).toEqual([4, 2]);
  });
  it('a zero stays zero (dots), but an all-zero pattern is dropped', () => {
    expect(safeDash([0, 3], 1, 1, 100)).toEqual([0, 3]);
    expect(safeDash([0, 0], 1, 1, 100)).toBeNull();
  });
  it('a line that would be cut into too many dashes is drawn solid', () => {
    expect(safeDash([1, 1], 1, 1, 1_000_000)).toBeNull();
    expect(safeDash([1, 1], 1, 1, DASH_LIMITS.maxDashes / 2 - 10)).not.toBeNull();
  });
  it('measures every kind of outline', () => {
    expect(outlineLength(line([1], 30))).toBe(30);
    expect(outlineLength({ type: 'rect', x: 0, y: 0, w: 10, h: 5 })).toBe(30);
    expect(outlineLength({ type: 'polygon', points: [[0, 0], [10, 0], [10, 10]] })).toBeCloseTo(10 + 10 + Math.hypot(10, 10));
    expect(outlineLength({ type: 'path', d: [['M', 0, 0], ['L', 10, 0], ['C', 10, 5, 10, 10, 20, 10]] })).toBeGreaterThan(20);
  });
  it('the canvas gets a sane pattern for [1e-9, 1e-9] on a huge line, and never a stall-sized one', async () => {
    const { drawDrawList } = await import('../../src/plugins/drawlist');
    const calls: number[][] = [];
    const g = new Proxy({}, { get: (_t, k) => (k === 'setLineDash' ? (d: number[]) => void calls.push(d) : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
    drawDrawList(g, sanitizeDrawList([line([1e-9, 1e-9], 500_000)]), 1);
    drawDrawList(g, sanitizeDrawList([line([1e-9, 1e-9], 10)]), 1);
    // The long one is solid (no pattern set); the short one is at half a pixel.
    expect(calls).toEqual([[0.5, 0.5]]);
  });
});
