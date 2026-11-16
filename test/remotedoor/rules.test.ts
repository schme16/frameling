import { describe, expect, it } from 'vitest';
import { busyReason, cleanLabel, cleanRun, cleanScript, describeRun, MAX_STEPS, summarize } from '../../src/remotedoor/rules';
import { isRunnable } from '../../src/plugins/appRules';
import { cleanAnswer, validRemotePort } from '../../src/shared/remoteDoor';

describe('what a run may say', () => {
  it('keeps commands and choices, in order, with a name', () => {
    const r = cleanRun({ steps: [{ command: 'edit.duplicate' }, { set: { frame: 2.2, color: '#ff0000', junk: 1 } }], label: '  Make\n a row  ' });
    expect(r).toEqual({ ok: true, value: { steps: [{ command: 'edit.duplicate' }, { set: { frame: 2, color: '#ff0000' } }], label: 'Make a row' } });
  });
  it('refuses what is not a run, in plain words', () => {
    for (const bad of [undefined, null, 'x', [], {}, { steps: [] }, { steps: 'x' }, { steps: [1] }, { steps: [{}] }, { steps: [{ command: 'a.b', set: {} }] }, { steps: [{ command: 5 }] }, { steps: [{ command: '' }] }, { steps: [{ set: 'x' }] }, { steps: [{ set: { frame: -1 } }] }]) {
      const r = cleanRun(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      if (!r.ok) expect(r.message.length).toBeGreaterThan(10);
    }
  });
  it('checks every step before anything is pressed: one bad step refuses the whole run', () => {
    const r = cleanRun({ steps: [{ command: 'edit.duplicate' }, { command: 'file.save' }] });
    expect(r).toMatchObject({ ok: false, reason: 'refused' });
  });
  it('has a limit on how many steps', () => {
    expect(cleanRun({ steps: Array.from({ length: MAX_STEPS }, () => ({ command: 'view.fit' })) }).ok).toBe(true);
    expect(cleanRun({ steps: Array.from({ length: MAX_STEPS + 1 }, () => ({ command: 'view.fit' })) }).ok).toBe(false);
  });
});

describe('what it may NOT press: the stream safety work is not a way round', () => {
  it('shares the Scripts list, and adds the things that would loosen a safeguard', () => {
    for (const id of ['view.streamSafe', 'audience.kill', 'audience.toggle', 'audience.view', 'audience.drawing', 'streamboard.toggle', 'stream.obsLink', 'remote.toggle', 'remote.copyKey', 'remote.roll', 'file.save', 'file.exportPdf', 'edit.undo', 'settings.reset', 'plugins.install', 'twitch.connect', 'scripts.open']) {
      expect(isRunnable(id), id).toBe(false);
      expect(cleanRun({ steps: [{ command: id }] }), id).toMatchObject({ ok: false, reason: 'refused' });
    }
  });
  it('can press the drawing commands', () => {
    for (const id of ['edit.duplicate', 'select.all', 'view.fit', 'timeline.newKey']) expect(cleanRun({ steps: [{ command: id }] }).ok, id).toBe(true);
  });
});

describe('a script', () => {
  it('needs code, names itself plainly, and has a size limit', () => {
    expect(cleanScript({ code: 'await frameling.app.run("view.fit")' })).toEqual({ ok: true, value: { code: 'await frameling.app.run("view.fit")', name: 'Remote script' } });
    expect(cleanScript({ code: 'x', name: 'Row‮ of dots' })).toMatchObject({ value: { name: 'Row of dots' } });
    for (const bad of [null, {}, { code: '' }, { code: '   ' }, { code: 5 }, { code: 'x'.repeat(100_001) }]) expect(cleanScript(bad).ok, JSON.stringify(bad)).toBe(false);
  });
});

describe('when it is too busy to be driven', () => {
  const idle = { pointerDown: false, dialogOpen: false, scriptRunning: false, runInProgress: false };
  it('goes ahead when nothing is in the way', () => expect(busyReason(idle)).toBeNull());
  it('says what is in the way, and refuses rather than waits', () => {
    expect(busyReason({ ...idle, pointerDown: true })).toMatchObject({ detail: 'stroke' });
    expect(busyReason({ ...idle, dialogOpen: true })).toMatchObject({ detail: 'dialog' });
    expect(busyReason({ ...idle, scriptRunning: true })).toMatchObject({ detail: 'script' });
    expect(busyReason({ ...idle, runInProgress: true })).toMatchObject({ detail: 'another-request' });
  });
  it('puts the other request first, then the script, then the pen, then the dialog', () => {
    expect(busyReason({ pointerDown: true, dialogOpen: true, scriptRunning: true, runInProgress: true })?.detail).toBe('another-request');
    expect(busyReason({ pointerDown: true, dialogOpen: true, scriptRunning: true, runInProgress: false })?.detail).toBe('script');
    expect(busyReason({ pointerDown: true, dialogOpen: true, scriptRunning: false, runInProgress: false })?.detail).toBe('stroke');
  });
});

describe('what it says back', () => {
  it('summarises a drawing without pictures, names of files or the drawing\'s own name', () => {
    const s = summarize({ width: 100, height: 80, fps: 12, length: 3, layers: [{ id: 'l1', name: 'Ink', kind: 'vector', visible: true, cels: [{ start: 0, length: 1, drawingId: 'd1' }] }], drawings: { d1: { kind: 'vector', shapes: [{}, {}] } } });
    expect(s).toEqual({ width: 100, height: 80, fps: 12, frames: 3, layers: [{ id: 'l1', name: 'Ink', kind: 'vector', visible: true, cels: 1, shapes: 2 }] });
  });
  it('describes a run from what was cleaned, never from what was sent', () => {
    const labelOf = (id: string) => (id === 'edit.duplicate' ? 'Duplicate' : undefined);
    expect(describeRun([{ command: 'edit.duplicate' }], labelOf)).toBe('Pressed Duplicate');
    expect(describeRun([{ set: { frame: 1 } }], labelOf)).toMatch(/Chose/);
    expect(describeRun([{ command: 'edit.duplicate' }, { set: { frame: 1 } }], labelOf)).toBe('Ran 2 steps: Duplicate and 1 choice');
    expect(cleanLabel('a\u0000b​c')).toBe('a b c');
  });
  it('checks the page\'s answers and the ports', () => {
    expect(cleanAnswer({ status: 409, body: { ok: false } })).toEqual({ status: 409, body: { ok: false } });
    expect(cleanAnswer({ status: 500, body: {} })).toBeNull();
    expect(validRemotePort(47231)).toBe(true);
    expect(validRemotePort(80)).toBe(false);
  });
});
