// @vitest-environment jsdom
// Running a script through the real prelude and the real runtime (in Node), against the real store: one Undo step for a
// whole run, nothing left behind by a run that fails, and a runaway script that is stopped without taking the app with it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PathShape, VectorDrawing } from '../../src/core/format';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { registerCommand, unregisterCommand } from '../../src/core/registry';
import { WATCHDOG } from '../../src/plugins/watchdog';
import { running, startRun, type RunDeps } from '../../src/scripts/runner';
import { box, addShapes, shapesNow } from '../tools/helpers';
import { closeAll, runPlugin, settle, type FakeWorker } from '../plugins/harness';
import { waitUntil } from '../helpers/waits';

let worker: FakeWorker | null = null;
const deps: RunDeps = {
  start: async (s) => {
    worker = runPlugin(s.code, { id: s.plugin.id });
    return worker.transport;
  },
};
const script = (code: string, name = 'Test script') => ({ id: 'stest1', name, code });
const colours = () => shapesNow().map((s) => (s as PathShape).fill);
const steps = () => store().historyList().done.map((s) => s.label);

const RED_ALL = `
const picked = await frameling.document.selected();
for (const shape of picked.shapes) {
  await frameling.document.edit('One', [{ op: 'setShapeStyle', drawingId: picked.drawingId, shapeId: shape.id, fill: '#ff0000' }]);
}`;

beforeEach(() => {
  resetStore(newDoc({ width: 400, height: 300 }));
  addShapes(box('a', 0, 0, 10, 10, '#00ff00'), box('b', 20, 0, 10, 10, '#00ff00'), box('c', 40, 0, 10, 10, '#00ff00'));
  store().setUi({ selection: ['a', 'b', 'c'] });
});

afterEach(() => {
  worker?.close();
  worker = null;
  closeAll();
  WATCHDOG.scriptStuckMs = 5000;
  WATCHDOG.pingEveryMs = 1000;
});

describe('running a script', () => {
  it('reads what is picked and changes it', async () => {
    const out = await startRun(script(RED_ALL), deps).done;
    expect(out).toMatchObject({ ok: true });
    expect(colours()).toEqual(['#ff0000', '#ff0000', '#ff0000']);
  });

  it('is one step in Undo, however many changes it made', async () => {
    const before = steps().length;
    const out = await startRun(script(RED_ALL, 'Make red'), deps).done;
    expect(out.ok).toBe(true);
    expect(out.changes).toBe(3);
    expect(steps()).toHaveLength(before + 1);
    expect(steps().at(-1)).toBe('Script: Make red');
    store().undo();
    expect(colours()).toEqual(['#00ff00', '#00ff00', '#00ff00']);
    store().redo();
    expect(colours()).toEqual(['#ff0000', '#ff0000', '#ff0000']);
  });

  it('leaves nothing half done when it throws after changing things', async () => {
    const before = store().get().doc;
    const stepsBefore = steps();
    const out = await startRun(script(`${RED_ALL}\nthrow new Error('nope');`), deps).done;
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/nope/);
    expect(out.message).toMatch(/back how it was/);
    expect(store().get().doc).toEqual(before);
    expect(steps()).toEqual(stepsBefore);
    expect(store().canRedo()).toBe(false);
  });

  it('leaves nothing half done when one of its changes is refused', async () => {
    const before = store().get().doc;
    const out = await startRun(
      script(`const p = await frameling.document.selected();
await frameling.document.edit('Fine', [{ op: 'setShapeStyle', drawingId: p.drawingId, shapeId: 'a', fill: '#ff0000' }]);
await frameling.document.edit('Bad', [{ op: 'setShapeStyle', drawingId: p.drawingId, shapeId: 'nothing', fill: '#ff0000' }]);`),
      deps,
    ).done;
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/no shape/i);
    expect(store().get().doc).toEqual(before);
  });

  it('reports the line the error came from', async () => {
    const out = await startRun(script(`const e = new Error('boom');\ne.stack = 'Error: boom\\n    at run (frameling-plugin:script-stest1:2:7)';\nthrow e;`), deps).done;
    expect(out).toMatchObject({ ok: false, message: expect.stringContaining('boom'), line: 2 });
  });

  it('counts a change it did not wait for as part of the run', async () => {
    const before = steps().length;
    const out = await startRun(script(`const p = await frameling.document.selected();\nframeling.document.edit('Late', [{ op: 'setShapeStyle', drawingId: p.drawingId, shapeId: 'a', fill: '#0000ff' }]);`), deps).done;
    expect(out.ok).toBe(true);
    expect(colours()[0]).toBe('#0000ff');
    expect(steps()).toHaveLength(before + 1);
  });

  it('collects what it prints', async () => {
    const seen: string[] = [];
    const run = startRun(script(`self.console.log('hello', 3, { a: 1 });\nself.console.warn('careful');`), deps, { onPrint: (l) => seen.push(`${l.level}:${l.text}`) });
    const out = await run.done;
    expect(out.ok).toBe(true);
    expect(seen).toEqual(['log:hello 3 {"a":1}', 'warn:careful']);
    expect(out.printed.map((l) => l.text)).toEqual(['hello 3 {"a":1}', 'careful']);
  });

  it('adds no commands, panels or exports of its own', async () => {
    const out = await startRun(script(`frameling.commands.register({ id: 'sneaky', label: 'Sneaky' }, () => {});`), deps).done;
    expect(out.ok).toBe(true);
    expect(store().get().doc.layers.length).toBeGreaterThan(0);
  });

  it('runs one script at a time', async () => {
    const first = startRun(script(`await new Promise((r) => setTimeout(r, 80));`), deps);
    const second = await startRun(script('1'), deps).done;
    expect(second.ok).toBe(false);
    expect(second.message).toMatch(/still running/);
    expect((await first.done).ok).toBe(true);
    expect(running.get()).toBeNull();
  });
});

describe('pressing commands', () => {
  const calls: string[] = [];
  beforeEach(() => {
    calls.length = 0;
    registerCommand({ id: 'test.double', label: 'Double it', category: 'Test', run: () => void store().update('Double', (d) => void (d.name = d.name + d.name)) });
    registerCommand({ id: 'test.needsSelection', label: 'Needs a selection', category: 'Test', enabled: (s) => s.ui.selection.length > 0, reason: () => 'Pick some shapes first.', run: () => void calls.push('ran') });
  });
  afterEach(() => (unregisterCommand('test.double'), unregisterCommand('test.needsSelection')));

  it('runs a command by id, inside the same one step', async () => {
    store().update('Name', (d) => void (d.name = 'ab'));
    const before = steps().length;
    const out = await startRun(script(`await frameling.app.run('test.double');\nawait frameling.app.run('test.double');`), deps).done;
    expect(out.ok).toBe(true);
    expect(store().get().doc.name).toBe('abababab');
    expect(steps()).toHaveLength(before + 1);
    store().undo();
    expect(store().get().doc.name).toBe('ab');
  });

  it('says why a command can not run, and puts everything back', async () => {
    store().setUi({ selection: [] });
    const before = store().get().doc;
    const out = await startRun(script(`await frameling.app.run('test.double');\nawait frameling.app.run('test.needsSelection');`), deps).done;
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/Needs a selection.*can't run right now.*Pick some shapes first/);
    expect(calls).toEqual([]);
    expect(store().get().doc).toEqual(before);
  });

  it('chooses what a command acts on', async () => {
    store().setUi({ selection: [] });
    const out = await startRun(script(`await frameling.app.set({ selection: ['a'] });\nawait frameling.app.run('test.needsSelection');`), deps).done;
    expect(out.ok).toBe(true);
    expect(calls).toEqual(['ran']);
    expect(store().get().ui.selection).toEqual(['a']);
  });

  it('refuses the commands that reach outside the drawing, however they are asked for', async () => {
    registerCommand({ id: 'file.save', label: 'Save', category: 'File', run: () => void calls.push('saved') });
    registerCommand({ id: 'plugin.x.y', label: 'A plugin', category: 'Plugins', run: () => void calls.push('plugin') });
    try {
      for (const id of ['file.save', 'plugin.x.y', 'script.sabc12', 'app.restart']) {
        const out = await startRun(script(`await frameling.app.run(${JSON.stringify(id)});`), deps).done;
        expect(out.ok, id).toBe(false);
        expect(out.message, id).toMatch(/can't press/);
      }
      expect(calls).toEqual([]);
    } finally {
      unregisterCommand('file.save');
      unregisterCommand('plugin.x.y');
    }
  });

  it('lists only the commands it may press', async () => {
    registerCommand({ id: 'file.save', label: 'Save', category: 'File', run: () => undefined });
    try {
      const out = await startRun(script(`const list = await frameling.app.commands();\nself.console.log(list.some((c) => c.id === 'test.double'), list.some((c) => c.id === 'file.save'));`), deps).done;
      expect(out.ok).toBe(true);
      expect(out.printed[0].text).toBe('true false');
    } finally {
      unregisterCommand('file.save');
    }
  });

  it('refuses a layer that is not there', async () => {
    const out = await startRun(script(`await frameling.app.set({ layerId: 'nope' });`), deps).done;
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/no layer/i);
  });
});

describe('a script that will not finish', () => {
  it('is stopped by Stop, without ending anything else, and the drawing goes back', async () => {
    const before = store().get().doc;
    const run = startRun(script(`${RED_ALL}\nawait new Promise(() => {});`), deps);
    await waitUntil(() => colours().every((c) => c === '#ff0000') && colours().length === 3, 'the script to paint the layers red');
    expect(colours()).toEqual(['#ff0000', '#ff0000', '#ff0000']);
    run.stop();
    const out = await run.done;
    expect(out).toMatchObject({ ok: false, ended: 'stopped' });
    expect(out.message).toMatch(/back how it was/);
    expect(store().get().doc).toEqual(before);
    expect(running.get()).toBeNull();
    // The app carries on: another script runs.
    expect((await startRun(script('1'), deps).done).ok).toBe(true);
  });

  it('is stopped by the watchdog when its worker goes quiet, and the drawing goes back', async () => {
    WATCHDOG.pingEveryMs = 20;
    // Long enough that a busy machine pausing this thread for a moment is not read as a stuck worker; the frozen worker
    // below is still caught, just after this long.
    WATCHDOG.scriptStuckMs = 1500;
    const before = store().get().doc;
    const run = startRun(script(`${RED_ALL}\nawait new Promise(() => {});`), deps);
    await waitUntil(() => colours().every((c) => c === '#ff0000') && colours().length === 3, 'the script to paint the layers red');
    // The worker stops answering, as one stuck in a loop would.
    worker!.freeze();
    const out = await run.done;
    expect(out).toMatchObject({ ok: false, ended: 'stuck' });
    expect(out.message).toMatch(/frameling\.progress/);
    expect(store().get().doc).toEqual(before);
    expect(running.get()).toBeNull();
  });

  it('is given a shorter leash than a plugin command', () => {
    expect(WATCHDOG.scriptStuckMs).toBeLessThan(WATCHDOG.busyStuckMs);
    expect(WATCHDOG.scriptStuckMs).toBeLessThanOrEqual(WATCHDOG.stuckMs);
  });
});

// Quietens an unused import in case the helpers change.
void settle;
void (null as unknown as VectorDrawing);
