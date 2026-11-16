// @vitest-environment jsdom
// The driver on the real store: a run is one step in Undo (and none when it fails), and a request in the way is refused.
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { createDriver, type DriverDeps } from '../../src/remotedoor/driver';
import { remoteLog, clearLog } from '../../src/remotedoor/log';
import type { RemoteAnswer } from '../../src/shared/remoteDoor';

const setName = (n: string) => store().update(`Name ${n}`, (d) => void (d.name = n));
const done = () => store().historyList().done.map((s) => s.label);

let busy = { pointerDown: false, dialogOpen: false, scriptRunning: false };
let open = true;
let touched = 0;
const pressed: string[] = [];
const COMMANDS: Record<string, () => void> = {
  'test.three': () => ['a', 'b', 'c'].forEach(setName),
  'test.one': () => setName('one'),
  'test.boom': () => {
    setName('half');
    throw new Error('"Boom" can\'t run right now: nothing is picked.');
  },
};

function make(over: Partial<DriverDeps> = {}) {
  const deps: DriverDeps = {
    commands: () => [],
    press: async (id) => {
      pressed.push(id);
      if (!COMMANDS[id]) throw new Error(`Frameling has no command "${id}" a script can press.`);
      COMMANDS[id]();
    },
    choose: (w) => store().setUi({ frame: w.frame ?? 0 }),
    group: { start: () => store().startGroup(), end: (m, l) => store().endGroup(m as never, l), abort: (m) => store().abortGroup(m as never) },
    isOpen: () => open,
    busy: () => busy,
    state: () => ({ frame: store().get().ui.frame }),
    doc: () => store().get().doc as never,
    runScript: async () => ({ ok: true, changes: 0, ms: 1, printed: [] }),
    touched: () => void touched++,
    labelOf: (id) => (id === 'test.three' ? 'Three renames' : undefined),
    ...over,
  };
  return createDriver(deps);
}
const run = (d: ReturnType<typeof make>, body: unknown): Promise<RemoteAnswer> => d.answer({ op: 'run', body });

beforeEach(() => {
  resetStore(newDoc({ name: 'start' }));
  busy = { pointerDown: false, dialogOpen: false, scriptRunning: false };
  open = true;
  touched = 0;
  pressed.length = 0;
  clearLog();
});

describe('undo', () => {
  it('a run of several commands is ONE step, named for the caller, and one Undo takes all of it back', async () => {
    const d = make();
    const r = await run(d, { steps: [{ command: 'test.three' }, { command: 'test.one' }], label: 'Rename lots' });
    expect(r).toMatchObject({ status: 200, body: { ok: true, steps: 2, changes: 4 } });
    expect(done()).toEqual(['Remote: Rename lots']);
    expect(store().get().doc.name).toBe('one');
    store().undo();
    expect(store().get().doc.name).toBe('start');
    expect(done()).toEqual([]);
  });
  it('one command named in the address is one step too, named for the command', async () => {
    const d = make();
    await run(d, { steps: [{ command: 'test.three' }] });
    expect(done()).toEqual(['Remote: Three renames']);
    store().undo();
    expect(store().get().doc.name).toBe('start');
  });
  it('a run that fails part way puts everything back: no step, no Redo, and the caller is told', async () => {
    const d = make();
    setName('mine');
    const before = store().get().doc;
    const r = await run(d, { steps: [{ command: 'test.three' }, { command: 'test.boom' }] });
    expect(r).toMatchObject({ status: 422, body: { ok: false, reason: 'failed', undone: 4 } });
    expect((r.body as { message: string }).message).toMatch(/nothing is picked/);
    expect(store().get().doc).toEqual(before);
    expect(done()).toEqual(['Name mine']);
    expect(store().canRedo()).toBe(false);
  });
  it('does not fold into the person\'s own step before it', async () => {
    setName('mine');
    const d = make();
    await run(d, { steps: [{ command: 'test.one' }] });
    expect(done()).toEqual(['Name mine', 'Remote: run']);
  });
  it('a door switched off part way takes back what it had done', async () => {
    const d = make({ press: async (id) => { COMMANDS[id](); open = false; } });
    const r = await run(d, { steps: [{ command: 'test.three' }, { command: 'test.one' }] });
    expect(r).toMatchObject({ status: 503, body: { reason: 'closed' } });
    expect(store().get().doc.name).toBe('start');
    expect(done()).toEqual([]);
  });
  it('nothing was pressed when a step could not be read', async () => {
    const d = make();
    const r = await run(d, { steps: [{ command: 'test.one' }, { command: 'file.save' }] });
    expect(r.status).toBe(403);
    expect(pressed).toEqual([]);
    expect(done()).toEqual([]);
  });
});

describe('a request that arrives at a bad moment is refused, not queued', () => {
  it.each([
    ['pointerDown', 'stroke'],
    ['dialogOpen', 'dialog'],
    ['scriptRunning', 'script'],
  ] as const)('%s', async (flag, detail) => {
    busy = { ...busy, [flag]: true };
    const d = make();
    const r = await run(d, { steps: [{ command: 'test.one' }] });
    expect(r).toMatchObject({ status: 409, body: { ok: false, reason: 'busy', detail, retryInMs: 1000 } });
    expect(pressed).toEqual([]);
    expect(done()).toEqual([]);
    // Later, when it has cleared, the same request goes through (it was not kept).
    busy = { pointerDown: false, dialogOpen: false, scriptRunning: false };
    expect(await run(d, { steps: [{ command: 'test.one' }] })).toMatchObject({ status: 200 });
    expect(pressed).toEqual(['test.one']);
  });
  it('a second run while one is going is refused', async () => {
    let release: () => void = () => undefined;
    const d = make({ press: () => new Promise<void>((r) => (release = r)) });
    const first = run(d, { steps: [{ command: 'test.one' }] });
    const second = await run(d, { steps: [{ command: 'test.one' }] });
    expect(second).toMatchObject({ status: 409, body: { detail: 'another-request' } });
    release();
    expect(await first).toMatchObject({ status: 200 });
    expect(await run(make(), { steps: [{ command: 'test.one' }] })).toMatchObject({ status: 200 });
  });
  it('reading still works while a dialog is open or someone is drawing', async () => {
    busy = { pointerDown: true, dialogOpen: true, scriptRunning: true };
    const d = make();
    expect(await d.answer({ op: 'state' })).toMatchObject({ status: 200, body: { ok: true, busy: 'script' } });
    expect(await d.answer({ op: 'commands' })).toMatchObject({ status: 200 });
  });
});

describe('a script', () => {
  it('runs through the Scripts runner and says what it did', async () => {
    const d = make({ runScript: async () => ({ ok: true, changes: 3, ms: 12, printed: [{ level: 'log', text: 'hi' }] }) });
    expect(await d.answer({ op: 'script', body: { code: 'x' } })).toMatchObject({ status: 200, body: { ok: true, changes: 3, printed: [{ level: 'log', text: 'hi' }] } });
  });
  it('a script that fails is 422 with its line', async () => {
    const d = make({ runScript: async () => ({ ok: false, message: 'oops. Your drawing is back how it was.', line: 4, changes: 0, ms: 1, printed: [] }) });
    expect(await d.answer({ op: 'script', body: { code: 'x' } })).toMatchObject({ status: 422, body: { reason: 'failed', line: 4 } });
  });
  it('is refused the same way when it is not a good moment', async () => {
    busy.dialogOpen = true;
    expect(await make().answer({ op: 'script', body: { code: 'x' } })).toMatchObject({ status: 409, body: { detail: 'dialog' } });
  });
  it('a bad one is 400', async () => {
    expect(await make().answer({ op: 'script', body: { code: 5 } })).toMatchObject({ status: 400 });
  });
});

describe('the log', () => {
  it('says what was driven, newest first, with how it went, and keeps no script text', async () => {
    const d = make({ runScript: async () => ({ ok: true, changes: 0, ms: 1, printed: [] }) });
    await run(d, { steps: [{ command: 'test.three' }] });
    await run(d, { steps: [{ command: 'test.boom' }] });
    busy.dialogOpen = true;
    await run(d, { steps: [{ command: 'test.one' }] });
    busy.dialogOpen = false;
    await d.answer({ op: 'script', body: { code: 'const secret = "hunter2";\nawait 1;', name: 'Mine' } });
    const log = remoteLog.get();
    expect(log.map((e) => e.outcome)).toEqual(['done', 'refused', 'failed', 'done']);
    expect(log[3].what).toBe('Pressed Three renames');
    expect(log[0].what).toBe('Ran the script "Mine" (2 lines)');
    expect(JSON.stringify(log)).not.toContain('hunter2');
    expect(touched).toBe(3);
  });
  it('keeps at most 200', async () => {
    const d = make();
    for (let i = 0; i < 205; i++) await d.answer({ op: 'run', body: { steps: [{ set: { frame: 0 } }] } });
    expect(remoteLog.get()).toHaveLength(200);
  });
});
