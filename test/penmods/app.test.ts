// @vitest-environment jsdom
// Pen modifiers in the app: on the real audience gate, behind the interrupt switch, one at a time, the person's settings never
// touched, and every stroke drawn while one is on still a normal stroke that one Undo takes back.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setChoice, setChoiceAsker } from '../../src/core/choices';
import { getCommand, getHelp } from '../../src/core/registry';
import type { StrokeShape } from '../../src/core/format';
import { store } from '../../src/core/store';
import { audience, installAudience, setAudienceDrawing, setAudienceOn, submitAudience } from '../../src/audience';
import { _resetFeaturesForTests, registerFeatures, setFeatureOn } from '../../src/features/host';
import { penModsFeature } from '../../src/penmods';
import { dareScreen } from '../../src/dares/fx';
import { daresFeature } from '../../src/dares';
import { isPenModEnabled, setPenModEnabled, stopPenMods, tryPenMod, _resetPenModsForTests } from '../../src/penmods/registry';
import { penEffect, penSizeFactor } from '../../src/penmods/active';
import { penMods, shortId } from '../../src/penmods/catalogue';
import { PenFilter } from '../../src/penmods/filter';
import { getPen, PEN_KEY, resetPen, setToolPen } from '../../src/tablet/settings';
import { brushTool } from '../../src/tools/brush';
import { viewSizeFactor } from '../../src/tools/view-size';
import { ctx, ptr, shapesNow, vectorStore } from '../tools/helpers';

installAudience();

let clock = 1_000_000;

/** Everything a modifier could touch of the person's, in one value, to compare before and after. */
const mine = () => ({
  pen: JSON.stringify(getPen()),
  saved: localStorage.getItem(PEN_KEY),
  brush: JSON.stringify(store().get().ui.brush),
  colour: store().get().ui.color,
});

/** Draws one stroke through the very path the canvas uses: the stroke filter in front of the real brush tool. */
function draw(points: [number, number][]): void {
  const c = ctx();
  const tp = getPen().tools.brush;
  const filter = new PenFilter(tp, 1, { x: points[0][0], y: points[0][1], pressure: 0.5 });
  const real = filter.active ? filter : null;
  brushTool.down?.(ptr(...points[0]), c);
  for (const p of points.slice(1, -1)) {
    const q = real ? real.push({ x: p[0], y: p[1], pressure: 0.5 }) : { x: p[0], y: p[1] };
    brushTool.move?.(ptr(q.x, q.y), c);
  }
  const last = points[points.length - 1];
  const end = real?.finish({ x: last[0], y: last[1], pressure: 0.5 });
  for (const s of end?.before ?? []) brushTool.move?.(ptr(s.x, s.y), c);
  brushTool.up?.(ptr(end?.last.x ?? last[0], end?.last.y ?? last[1]), c);
}

const straight: [number, number][] = Array.from({ length: 41 }, (_, i) => [30 + i * 8, 100]);
const lastStroke = () => shapesNow().at(-1) as StrokeShape;
const docJson = () => JSON.stringify(store().get().doc);

beforeAll(() => {
  setChoiceAsker(null);
  _resetFeaturesForTests();
  registerFeatures([penModsFeature]);
});
afterAll(() => {
  audience.kill();
});
beforeEach(() => {
  vi.useFakeTimers();
  clock += 3_600_000;
  vi.setSystemTime(clock);
  localStorage.clear();
  resetPen();
  _resetPenModsForTests();
  setFeatureOn('stream-penmods', true);
  audience.kill();
  audience.resetCounts();
  setAudienceDrawing(false);
  setChoice('audience.strictness', 'relaxed');
  const s = vectorStore();
  s.setUi({ zoom: 1, panX: 0, panY: 0, tool: 'brush', frame: 0 });
  setAudienceOn(true);
});
afterEach(() => {
  stopPenMods();
  vi.useRealTimers();
});

describe('registered and gated', () => {
  it('every modifier is on the gate as touchesDrawing, and listed for the door only when the interrupt switch is on', () => {
    const acts = audience.snapshot().actions;
    for (const m of penMods) {
      const a = acts.find((x) => x.id === m.id);
      expect(a, m.id).toBeTruthy();
      expect(a!.touchesDrawing, m.id).toBe(true);
      expect(a!.available, m.id).toBe(false);
    }
    setAudienceDrawing(true);
    expect(audience.snapshot().actions.filter((a) => a.id.startsWith('penmod.')).every((a) => a.available)).toBe(true);
    expect(penMods.length).toBeGreaterThanOrEqual(4);
  });

  it('the audience is turned away with the switch off, and nothing changes on the pen', () => {
    for (const m of penMods) {
      audience.kill();
      setAudienceOn(true);
      expect(submitAudience(m.id), m.id).toEqual({ ok: false, reason: 'unavailable' });
      expect(penEffect.get(), m.id).toBeNull();
      expect(dareScreen.get().held).toHaveLength(0);
    }
  });

  it('with the switch on it runs, and the pen shows it', () => {
    setAudienceDrawing(true);
    expect(submitAudience('penmod.thin')).toEqual({ ok: true, outcome: 'ran' });
    expect(penEffect.get()).toEqual({ size: 0.35 });
    expect(dareScreen.get().held).toMatchObject([{ resource: 'pen', id: 'penmod.thin', label: 'Thin brush' }]);
  });

  it('each has a palette command and a help topic with media, plus the list and the stop', () => {
    for (const m of penMods) {
      const c = getCommand(`penmods.try.${shortId(m.id)}`);
      expect(c, m.id).toBeTruthy();
      expect(getHelp(c!.help!), m.id).toBeTruthy();
    }
    for (const id of ['penmods.list', 'penmods.stop']) expect(getCommand(id), id).toBeTruthy();
    expect(getHelp('pen-modifiers')!.media).toBe('pen-modifiers.mp4');
  });

  it('goes when the feature is switched off, ending any that is on', () => {
    tryPenMod('penmod.shaky');
    expect(penEffect.get()).not.toBeNull();
    setFeatureOn('stream-penmods', false);
    expect(penEffect.get()).toBeNull();
    expect(audience.snapshot().actions.some((a) => a.id.startsWith('penmod.'))).toBe(false);
    expect(getCommand('penmods.list')).toBeUndefined();
    setFeatureOn('stream-penmods', true);
    expect(audience.snapshot().actions.some((a) => a.id === 'penmod.steady')).toBe(true);
  });
});

describe('the pen goes back exactly as it was', () => {
  for (const m of penMods) {
    it(`${m.id}: never writes to the person's settings, and ends by itself with everything as it was`, async () => {
      setAudienceDrawing(true);
      const before = mine();
      expect(submitAudience(m.id).ok).toBe(true);
      expect(penEffect.get()).not.toBeNull();
      // Their own settings are untouched even while it is on.
      expect(mine()).toEqual(before);
      await vi.advanceTimersByTimeAsync(40_000);
      expect(penEffect.get()).toBeNull();
      expect(penSizeFactor()).toBe(1);
      expect(viewSizeFactor()).toBe(1);
      expect(dareScreen.get().held).toHaveLength(0);
      expect(mine()).toEqual(before);
    });

    it(`${m.id}: kill, the interrupt switch going off, and Put it back each end it in the same moment`, () => {
      setAudienceDrawing(true);
      const before = mine();
      submitAudience(m.id);
      audience.kill();
      expect(penEffect.get()).toBeNull();
      expect(dareScreen.get().held).toHaveLength(0);
      setAudienceOn(true);
      setAudienceDrawing(true);
      submitAudience(m.id);
      setAudienceDrawing(false);
      expect(penEffect.get()).toBeNull();
      tryPenMod(m.id);
      expect(penEffect.get()).not.toBeNull();
      getCommand('penmods.stop')!.run();
      expect(penEffect.get()).toBeNull();
      expect(mine()).toEqual(before);
    });
  }

  it('a setting changed meanwhile stays changed, the way a colour picked during colour roulette does', async () => {
    setAudienceDrawing(true);
    submitAudience('penmod.thin');
    const s = store();
    s.setUi({ brush: { ...s.get().ui.brush, size: 33 } });
    setToolPen('brush', { stabilizer: 55 });
    const meanwhile = mine();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(penEffect.get()).toBeNull();
    expect(mine()).toEqual(meanwhile);
    expect(store().get().ui.brush.size).toBe(33);
    expect(getPen().tools.brush.stabilizer).toBe(55);
  });

  it('the wobble and the thin size are both on the pen only while it lasts: the tool size follows', () => {
    const size = viewSizeFactor();
    tryPenMod('penmod.fat');
    expect(viewSizeFactor()).toBeCloseTo(size * 2.5);
    stopPenMods();
    expect(viewSizeFactor()).toBe(size);
  });
});

describe('only one at a time', () => {
  it('a new one takes over from the old one instead of stacking', () => {
    tryPenMod('penmod.shaky');
    expect(penEffect.get()).toEqual({ wobble: 1 });
    tryPenMod('penmod.thin');
    expect(penEffect.get()).toEqual({ size: 0.35 });
    expect(dareScreen.get().held.filter((h) => h.resource === 'pen')).toHaveLength(1);
    // The old one running out must not take the new one off.
    return vi.advanceTimersByTimeAsync(25_000).then(() => {
      expect(penEffect.get()).toEqual({ size: 0.35 });
    });
  });

  it('the old one going away never lifts a newer one', async () => {
    tryPenMod('penmod.steady');
    tryPenMod('penmod.fat');
    expect(penEffect.get()).toEqual({ size: 2.5 });
    await vi.advanceTimersByTimeAsync(30_500);
    expect(penEffect.get()).toBeNull();
  });

  it('the gate turns a second one away in the cooldown, so the audience cannot stack them either', () => {
    setAudienceDrawing(true);
    expect(submitAudience('penmod.shaky').ok).toBe(true);
    const second = submitAudience('penmod.thin');
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('cooldown');
    expect(penEffect.get()).toEqual({ wobble: 1 });
  });

  it('lasts as long as the dare length choice says', async () => {
    setChoice('dares.length', 'short');
    tryPenMod('penmod.thin');
    await vi.advanceTimersByTimeAsync(14_000);
    expect(penEffect.get()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(penEffect.get()).toBeNull();
    setChoice('dares.length', undefined);
  });

  it('shares the one stop with the dares: Put every dare back ends it too', () => {
    registerFeatures([daresFeature, penModsFeature]);
    setFeatureOn('stream-dares', true);
    tryPenMod('penmod.thin');
    getCommand('dares.stop')!.run();
    expect(penEffect.get()).toBeNull();
    setFeatureOn('stream-dares', false);
  });
});

describe('strokes drawn while one is on are normal strokes', () => {
  it('with nothing on, a stroke is one step, and the filter does nothing but the stabilizer', () => {
    resetPen();
    draw(straight);
    expect(shapesNow()).toHaveLength(1);
    expect(lastStroke().type).toBe('stroke');
  });

  for (const m of penMods) {
    it(`${m.id}: the stroke is an ordinary stroke, one Undo takes it back, Redo brings it again`, () => {
      const before = docJson();
      tryPenMod(m.id);
      draw(straight);
      const s = lastStroke();
      expect(shapesNow()).toHaveLength(1);
      expect(s.type).toBe('stroke');
      expect(s.points.length).toBeGreaterThan(2);
      expect(s.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
      // It survives a round trip through the file, like any stroke.
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
      const after = docJson();
      store().undo();
      expect(docJson()).toBe(before);
      store().redo();
      expect(docJson()).toBe(after);
      // And the stroke is permanent: ending the modifier does not touch it.
      stopPenMods();
      expect(docJson()).toBe(after);
    });
  }

  it('thin and fat change the size baked into the stroke, and the person\'s size is not touched', () => {
    draw(straight);
    const plain = lastStroke().brush.size;
    tryPenMod('penmod.thin');
    draw(straight);
    const thin = lastStroke().brush.size;
    tryPenMod('penmod.fat');
    draw(straight);
    const fat = lastStroke().brush.size;
    expect(thin).toBeCloseTo(plain * 0.35);
    expect(fat).toBeCloseTo(plain * 2.5);
    expect(store().get().ui.brush.size).toBe(plain);
    stopPenMods();
    draw(straight);
    expect(lastStroke().brush.size).toBe(plain);
  });

  it('shaky hand makes the line wobble, steady hand and long rope make it smoother, and a stroke after it is straight again', () => {
    const jitter: [number, number][] = Array.from({ length: 60 }, (_, i) => [30 + i * 5, 100 + (i % 2 ? 5 : -5)]);
    const off = (s: StrokeShape) => Math.max(...s.points.map((p) => Math.abs(p.y - 100)));
    // How much the line zigzags: the sum of its ups and downs, away from the ends where it catches up with the pen.
    const rough = (s: StrokeShape) => s.points.slice(8, -8).reduce((t, p, i, a) => (i ? t + Math.abs(p.y - a[i - 1].y) : 0), 0);
    draw(straight);
    expect(off(lastStroke())).toBeLessThan(0.5);
    tryPenMod('penmod.shaky');
    draw(straight);
    expect(off(lastStroke())).toBeGreaterThan(2);
    stopPenMods();
    draw(straight);
    expect(off(lastStroke())).toBeLessThan(0.5);
    draw(jitter);
    const plain = rough(lastStroke());
    tryPenMod('penmod.steady');
    draw(jitter);
    const steady = rough(lastStroke());
    tryPenMod('penmod.rope');
    draw(jitter);
    const rope = rough(lastStroke());
    expect(plain).toBeGreaterThan(20);
    expect(steady).toBeLessThan(plain / 2);
    expect(rope).toBeLessThanOrEqual(steady);
  });

  it('the modifier never reaches a stroke that was already there', () => {
    draw(straight);
    const first = JSON.stringify(lastStroke());
    tryPenMod('penmod.shaky');
    draw(straight.map(([x, y]) => [x, y + 40] as [number, number]));
    expect(JSON.stringify(shapesNow()[0])).toBe(first);
  });
});

describe('switching one off', () => {
  it('a modifier the streamer switched off is turned away, shown as off, and stays off', () => {
    setAudienceDrawing(true);
    expect(isPenModEnabled('penmod.shaky')).toBe(true);
    setPenModEnabled('penmod.shaky', false);
    expect(isPenModEnabled('penmod.shaky')).toBe(false);
    expect(audience.snapshot().actions.find((a) => a.id === 'penmod.shaky')).toMatchObject({ enabled: false, available: false });
    expect(submitAudience('penmod.shaky')).toEqual({ ok: false, reason: 'unavailable' });
    expect(submitAudience('penmod.thin').ok).toBe(true);
    expect(JSON.parse(localStorage.getItem('frameling.penmods.v1')!).off).toEqual(['penmod.shaky']);
    setPenModEnabled('penmod.shaky', true);
    vi.setSystemTime(clock + 120_000);
    expect(submitAudience('penmod.shaky').ok).toBe(true);
  });

  it('switching a running one off takes it off the pen at once', () => {
    setAudienceDrawing(true);
    submitAudience('penmod.shaky');
    expect(penEffect.get()).not.toBeNull();
    setPenModEnabled('penmod.shaky', false);
    expect(penEffect.get()).toBeNull();
  });

  it('Try it still works for the streamer with audience features off and the interrupt switch off', () => {
    setAudienceOn(false);
    expect(audience.snapshot().drawingAllowed).toBe(false);
    expect(tryPenMod('penmod.thin')).toBe(true);
    expect(penEffect.get()).toEqual({ size: 0.35 });
    expect(tryPenMod('nope')).toBe(false);
  });
});

describe('turning audience features off', () => {
  it('takes the modifier off the pen in the same moment', () => {
    setAudienceDrawing(true);
    submitAudience('penmod.fat');
    setAudienceOn(false);
    expect(penEffect.get()).toBeNull();
  });
});
