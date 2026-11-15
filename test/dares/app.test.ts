// @vitest-environment jsdom
// Dares in the app: on the real audience gate, with the toggle off and on, one Undo, kill, and no trace left behind.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setChoice, setChoiceAsker } from '../../src/core/choices';
import { getCommand, getHelp } from '../../src/core/registry';
import { newDoc, newVectorDrawing, uid } from '../../src/core/doc';
import type { PathShape } from '../../src/core/format';
import { store } from '../../src/core/store';
import { audience, installAudience, setAudienceDrawing, setAudienceOn, submitAudience } from '../../src/audience';
import { _resetFeaturesForTests, registerFeatures, setFeatureOn } from '../../src/features/host';
import { daresFeature } from '../../src/dares';
import { allDares, drawingDares, viewDares } from '../../src/dares/catalogue';
import { dareScreen } from '../../src/dares/fx';
import { isDareEnabled, setDareEnabled, stopDares, tryDare, _resetDaresForTests } from '../../src/dares/registry';
import { getTurn, NO_TURN, setTurn } from '../../src/canvas/turn';
import { fit, getView } from '../../src/canvas/controller';

installAudience();

const root = document.documentElement;
let clock = 1_000_000;

function drawingDoc() {
  const doc = newDoc({ width: 400, height: 300 });
  const d = newVectorDrawing();
  const line: PathShape = { id: uid('s'), type: 'path', paths: [{ closed: false, points: [{ x: 50, y: 50 }, { x: 200, y: 120 }, { x: 300, y: 80 }] }], fill: null, stroke: { color: '#000', width: 4, join: 'round', cap: 'round' }, opacity: 1 };
  d.shapes.push(line);
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: uid('c'), start: 0, length: doc.length, drawingId: d.id });
  return doc;
}

/** Everything a view dare could change, in one value, to compare before and after. */
const trace = () => ({
  turn: getTurn(),
  view: getView(),
  mark: root.getAttribute('data-dare'),
  screen: dareScreen.get(),
  colour: store().get().ui.color,
  doc: store().get().doc,
});

beforeAll(() => {
  setChoiceAsker(null);
  _resetFeaturesForTests();
  registerFeatures([daresFeature]);
});
afterAll(() => {
  audience.kill();
});
beforeEach(() => {
  vi.useFakeTimers();
  // The gate remembers when each kind last ran, so every test starts well after the one before.
  clock += 3_600_000;
  vi.setSystemTime(clock);
  _resetDaresForTests();
  setFeatureOn('stream-dares', true);
  audience.kill();
  audience.resetCounts();
  setAudienceDrawing(false);
  setChoice('audience.strictness', 'relaxed');
  setTurn(NO_TURN);
  store().load(drawingDoc());
  store().setUi({ zoom: 1, panX: 0, panY: 0, activeLayerId: store().get().doc.layers[0].id, frame: 0 });
  // Following the window, as a fresh drawing does: the dare must hand that back too.
  fit(true);
  setAudienceOn(true);
});
afterEach(() => {
  stopDares();
  vi.useRealTimers();
});

describe('dares are registered', () => {
  it('every dare is on the gate with the right family flag, and listed for the door only when it may run', () => {
    const acts = audience.snapshot().actions;
    for (const d of allDares) {
      const a = acts.find((x) => x.id === d.id);
      expect(a, d.id).toBeTruthy();
      expect(a!.touchesDrawing, d.id).toBe(d.family === 'drawing');
      expect(a!.available, d.id).toBe(d.family === 'view');
    }
    expect(viewDares.length).toBeGreaterThanOrEqual(5);
    expect(drawingDares.length).toBeGreaterThanOrEqual(5);
    setAudienceDrawing(true);
    expect(audience.snapshot().actions.filter((a) => a.id.startsWith('dare.')).every((a) => a.available)).toBe(true);
  });

  it('each has a palette command with a help topic, plus the list and the stop', () => {
    for (const d of allDares) {
      const c = getCommand(`dares.try.${d.id.replace('dare.', '')}`);
      expect(c, d.id).toBeTruthy();
      expect(getHelp(c!.help!), d.id).toBeTruthy();
    }
    for (const id of ['dares.list', 'dares.stop']) expect(getCommand(id), id).toBeTruthy();
    expect(getHelp('dares')!.media).toBe('dares.mp4');
    expect(getHelp('dares-drawing')!.media).toBe('dares-drawing.mp4');
  });

  it('go when the feature is switched off', () => {
    setFeatureOn('stream-dares', false);
    expect(audience.snapshot().actions.some((a) => a.id.startsWith('dare.'))).toBe(false);
    expect(getCommand('dares.list')).toBeUndefined();
    setFeatureOn('stream-dares', true);
    expect(audience.snapshot().actions.some((a) => a.id === 'dare.flip')).toBe(true);
  });
});

describe('view dares leave no trace', () => {
  for (const d of viewDares) {
    it(`${d.id}: applies, then ends by itself with everything as it was`, async () => {
      const before = trace();
      const v = submitAudience(d.id);
      expect(v.ok).toBe(true);
      if (d.id !== 'dare.shake') expect(JSON.stringify(trace())).not.toBe(JSON.stringify(before));
      await vi.advanceTimersByTimeAsync(70_000);
      const after = trace();
      expect(after.turn).toEqual(before.turn);
      expect(after.view).toEqual(before.view);
      expect(after.mark).toBe(before.mark);
      expect(after.screen).toEqual(before.screen);
      expect(after.colour).toBe(before.colour);
      // The document is the very same object: nothing touched it.
      expect(after.doc).toBe(before.doc);
    });

    it(`${d.id}: kill puts it all back in the same moment`, async () => {
      const before = trace();
      submitAudience(d.id);
      audience.kill();
      const after = trace();
      expect(after.turn).toEqual(before.turn);
      expect(after.view).toEqual(before.view);
      expect(after.mark).toBe(before.mark);
      expect(after.screen).toEqual(before.screen);
      expect(after.doc).toBe(before.doc);
      await vi.advanceTimersByTimeAsync(70_000);
      expect(trace().turn).toEqual(before.turn);
    });
  }

  it('a view dare never reaches the drawing, even with the interrupt switch on', async () => {
    setAudienceDrawing(true);
    const doc = store().get().doc;
    for (const d of viewDares) {
      audience.kill();
      setAudienceOn(true);
      submitAudience(d.id);
      await vi.advanceTimersByTimeAsync(70_000);
      expect(store().get().doc, d.id).toBe(doc);
    }
  });

  it('a new view dare takes over from the old one instead of stacking', () => {
    const startView = getView();
    submitAudience('dare.flip');
    expect(getTurn().flip).toBe(true);
    // Another kind in the same family is on its own cooldown, so go straight to the dare.
    tryDare('dare.grey');
    expect(getTurn().flip).toBe(false);
    expect(root.getAttribute('data-dare')).toBe('grey');
    tryDare('dare.zoom');
    expect(root.getAttribute('data-dare')).toBeNull();
    expect(dareScreen.get().held).toHaveLength(1);
    stopDares();
    expect(getView()).toEqual(startView);
    expect(dareScreen.get().held).toHaveLength(0);
  });

  it('the cooldown turns a second dare of the same kind away', () => {
    expect(submitAudience('dare.flip').ok).toBe(true);
    const second = submitAudience('dare.grey');
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('cooldown');
  });

  it('a banner and a countdown show words and clear again', async () => {
    submitAudience('dare.challenge', { text: 'Draw a hat' });
    expect(dareScreen.get().banner).toEqual({ text: 'Draw a hat' });
    await vi.advanceTimersByTimeAsync(31_000);
    expect(dareScreen.get().banner).toBeNull();
    submitAudience('dare.countdown', { seconds: 5 });
    expect(dareScreen.get().countdown?.over).toBe(false);
    await vi.advanceTimersByTimeAsync(5_100);
    expect(dareScreen.get().countdown?.over).toBe(true);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(dareScreen.get().countdown).toBeNull();
  });

  it('rubbish for a banner is turned away before it queues', () => {
    expect(submitAudience('dare.challenge', { text: 7 })).toEqual({ ok: false, reason: 'invalid' });
    expect(submitAudience('dare.countdown', { seconds: 'soon' })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('dares last as long as the choice says', async () => {
    setChoice('dares.length', 'short');
    submitAudience('dare.flip');
    await vi.advanceTimersByTimeAsync(14_000);
    expect(getTurn().flip).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(getTurn().flip).toBe(false);
    setChoice('dares.length', undefined);
  });
});

describe('dares that reach the drawing', () => {
  for (const d of drawingDares.filter((x) => x.id !== 'dare.colour')) {
    it(`${d.id}: refused with the toggle off, runs with it on, and one Undo takes it back`, async () => {
      const first = store().get().doc;
      const refused = submitAudience(d.id);
      expect(refused).toEqual({ ok: false, reason: 'unavailable' });
      expect(store().get().doc).toBe(first);

      setAudienceDrawing(true);
      const ran = submitAudience(d.id);
      expect(ran).toEqual({ ok: true, outcome: 'ran' });
      const changed = store().get().doc;
      expect(changed).not.toBe(first);

      store().undo();
      // One Undo, and the document is exactly as it was.
      expect(JSON.stringify(store().get().doc)).toBe(JSON.stringify(first));
    });
  }

  it('the three gifts add a layer and delete nothing', () => {
    setAudienceDrawing(true);
    const before = store().get().doc;
    for (const id of ['dare.googly', 'dare.shape', 'dare.splat']) {
      tryDare(id);
    }
    const after = store().get().doc;
    expect(after.layers).toHaveLength(before.layers.length + 3);
    expect(after.layers[0]).toBe(before.layers[0]);
    // Each was its own step.
    store().undo();
    store().undo();
    store().undo();
    expect(store().get().doc.layers).toHaveLength(before.layers.length);
  });

  it('the gifts stop at the cap', () => {
    for (let i = 0; i < 9; i++) tryDare('dare.shape');
    expect(store().get().doc.layers).toHaveLength(1 + 6);
  });

  it('jelly and budge only move: the same shapes and cels are still there', () => {
    setAudienceDrawing(true);
    const before = store().get().doc;
    tryDare('dare.jelly');
    tryDare('dare.budge');
    const after = store().get().doc;
    expect(after.layers).toHaveLength(before.layers.length);
    expect(Object.keys(after.drawings)).toEqual(Object.keys(before.drawings));
    const a = Object.values(after.drawings)[0];
    const b = Object.values(before.drawings)[0];
    if (a.kind === 'vector' && b.kind === 'vector') expect(a.shapes).toHaveLength(b.shapes.length);
    expect(after.layers[0].cels[0].offset).toBeTruthy();
  });

  it('jelly and budge do nothing, and make no undo step, on a locked layer', () => {
    setAudienceDrawing(true);
    store().update('lock', (d) => void (d.layers[0].locked = true));
    const doc = store().get().doc;
    tryDare('dare.jelly');
    tryDare('dare.budge');
    expect(store().get().doc).toBe(doc);
  });

  it('colour roulette changes the colour in hand, then puts it back', async () => {
    setAudienceDrawing(true);
    const was = store().get().ui.color;
    const doc = store().get().doc;
    expect(submitAudience('dare.colour').ok).toBe(true);
    expect(store().get().ui.color).not.toBe(was);
    expect(store().get().doc).toBe(doc);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(store().get().ui.color).toBe(was);
  });

  it('colour roulette leaves a colour you picked meanwhile alone', async () => {
    setAudienceDrawing(true);
    submitAudience('dare.colour');
    store().setUi({ color: '#123456' });
    await vi.advanceTimersByTimeAsync(31_000);
    expect(store().get().ui.color).toBe('#123456');
  });

  it('colour roulette ends at once when the interrupt switch goes off or on kill', () => {
    setAudienceDrawing(true);
    const was = store().get().ui.color;
    submitAudience('dare.colour');
    setAudienceDrawing(false);
    expect(store().get().ui.color).toBe(was);
    setAudienceDrawing(true);
    submitAudience('dare.colour');
    audience.kill();
    expect(store().get().ui.color).toBe(was);
  });

  it('the streamer can try a drawing dare by hand, and it is still one Undo', () => {
    const first = store().get().doc;
    expect(audience.snapshot().drawingAllowed).toBe(false);
    expect(tryDare('dare.googly')).toBe(true);
    expect(store().get().doc.layers).toHaveLength(2);
    store().undo();
    expect(JSON.stringify(store().get().doc)).toBe(JSON.stringify(first));
  });
});

describe('switching one off', () => {
  it('a dare the streamer switched off is turned away, shown as off, and stays off', () => {
    expect(isDareEnabled('dare.flip')).toBe(true);
    setDareEnabled('dare.flip', false);
    expect(isDareEnabled('dare.flip')).toBe(false);
    expect(audience.snapshot().actions.find((a) => a.id === 'dare.flip')).toMatchObject({ enabled: false, available: false });
    expect(submitAudience('dare.flip')).toEqual({ ok: false, reason: 'unavailable' });
    expect(submitAudience('dare.grey').ok).toBe(true);
    expect(JSON.parse(localStorage.getItem('frameling.dares.v1')!).off).toEqual(['dare.flip']);
    setDareEnabled('dare.flip', true);
    vi.setSystemTime(clock + 120_000);
    expect(submitAudience('dare.flip').ok).toBe(true);
  });

  it('switching a running dare off puts the view back at once', () => {
    submitAudience('dare.flip');
    expect(getTurn().flip).toBe(true);
    setDareEnabled('dare.flip', false);
    expect(getTurn().flip).toBe(false);
  });

  it('a switched-off dare is dropped from the queue', () => {
    submitAudience('dare.grey');
    // Same gap rule: the next ones wait.
    const q = submitAudience('dare.challenge');
    expect(q.ok).toBe(true);
    if (q.ok && q.outcome === 'queued') {
      setDareEnabled('dare.challenge', false);
      expect(audience.snapshot().queue).toHaveLength(0);
    }
  });
});

describe('kill and the switch', () => {
  it('Stop puts every kind of dare back in one go, and the gate is off', () => {
    setAudienceDrawing(true);
    const was = store().get().ui.color;
    submitAudience('dare.flip');
    tryDare('dare.colour');
    tryDare('dare.challenge');
    tryDare('dare.countdown');
    expect(dareScreen.get().held.length).toBeGreaterThanOrEqual(3);
    audience.kill();
    expect(getTurn()).toEqual(NO_TURN);
    expect(store().get().ui.color).toBe(was);
    expect(dareScreen.get()).toEqual({ held: [], banner: null, countdown: null });
    expect(root.getAttribute('data-dare')).toBeNull();
    expect(audience.isOn()).toBe(false);
  });

  it('turning audience features off puts a dare back', () => {
    submitAudience('dare.grey');
    expect(root.getAttribute('data-dare')).toBe('grey');
    setAudienceOn(false);
    expect(root.getAttribute('data-dare')).toBeNull();
  });

  it('Put every dare back works for tries when audience features are off', () => {
    setAudienceOn(false);
    tryDare('dare.flip');
    expect(getTurn().flip).toBe(true);
    getCommand('dares.stop')!.run();
    expect(getTurn().flip).toBe(false);
  });

  it('switching the feature off puts everything back', () => {
    submitAudience('dare.flip');
    setFeatureOn('stream-dares', false);
    expect(getTurn().flip).toBe(false);
  });
});
