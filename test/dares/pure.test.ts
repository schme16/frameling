import { describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing, uid } from '../../src/core/doc';
import type { Doc, PathShape, Shape } from '../../src/core/format';
import { addGiftLayer, applyNudge, blobPath, dropShape, DROP_KINDS, giftCount, giftProblem, googlyShapes, MAX_GIFTS, nudgeStep, nudgeTarget, seeded, splatShapes, wobblePoint, wobbleSetup, wobbleShapes, wobbleTarget, WOBBLE_SHARE } from '../../src/dares/draw';
import { cleanChallenge, cleanCountdown, dareMs, allDares, CHALLENGES, COUNTDOWN_MAX, COUNTDOWN_MIN } from '../../src/dares/catalogue';
import { secondsLeft } from '../../src/dares/DareLayer';

const finite = (shapes: Shape[]) =>
  shapes.every((s) => (s.type === 'path' ? s.paths.every((p) => p.points.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y) && (!q.c1 || Number.isFinite(q.c1.x)))) : true));

function docWithStroke(): Doc {
  const doc = newDoc({ width: 400, height: 300 });
  const d = newVectorDrawing();
  const line: PathShape = { id: uid('s'), type: 'path', paths: [{ closed: false, points: [{ x: 50, y: 50 }, { x: 200, y: 120 }, { x: 300, y: 80 }] }], fill: null, stroke: { color: '#000', width: 4, join: 'round', cap: 'round' }, opacity: 1 };
  d.shapes.push(line);
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: uid('c'), start: 0, length: doc.length, drawingId: d.id });
  return doc;
}

describe('dare shapes', () => {
  it('make real, finite shapes inside the page, the same way for the same seed', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const make of [googlyShapes, splatShapes, (w: number, h: number, r: () => number) => dropShape(w, h, r)]) {
        const shapes = make(800, 600, seeded(seed));
        expect(shapes.length).toBeGreaterThan(0);
        expect(finite(shapes)).toBe(true);
      }
    }
    expect(JSON.stringify(googlyShapes(800, 600, seeded(7)).map((s) => (s as PathShape).paths))).toBe(JSON.stringify(googlyShapes(800, 600, seeded(7)).map((s) => (s as PathShape).paths)));
  });

  it('googly eyes are two eyes with a pupil each, grouped', () => {
    const s = googlyShapes(800, 600, seeded(3));
    expect(s).toHaveLength(4);
    expect(new Set(s.map((x) => x.group)).size).toBe(1);
  });

  it('every kind of dropped shape can be made', () => {
    for (const k of DROP_KINDS) expect(dropShape(800, 600, seeded(2), k)).toHaveLength(1);
  });

  it('a blob is a closed smooth outline', () => {
    const p = blobPath(10, 10, 5, seeded(1));
    expect(p.closed).toBe(true);
    expect(p.points.every((q) => q.c1 && q.c2)).toBe(true);
  });
});

describe('gift layers', () => {
  it('go on a new layer on top and leave what was there alone', () => {
    const doc = docWithStroke();
    const before = JSON.stringify(doc.layers[0]);
    const id = addGiftLayer(doc, 'Googly eyes', googlyShapes(doc.width, doc.height, seeded(1)));
    expect(id).toBeTruthy();
    expect(doc.layers).toHaveLength(2);
    expect(doc.layers[1].id).toBe(id);
    expect(JSON.stringify(doc.layers[0])).toBe(before);
    expect(giftCount(doc)).toBe(1);
    expect(doc.layers[1].cels[0].length).toBe(doc.length);
  });

  it('stop at the cap, and inside a symbol or with shared layers', () => {
    const doc = docWithStroke();
    for (let i = 0; i < MAX_GIFTS; i++) expect(addGiftLayer(doc, `g${i}`, [])).toBeTruthy();
    expect(giftProblem(doc)).toBe('too-many');
    expect(addGiftLayer(doc, 'one more', [])).toBeNull();
    expect(doc.layers).toHaveLength(1 + MAX_GIFTS);
    expect(giftProblem({ layers: [], editing: [{} as never], sharedLayers: undefined })).toBe('inside-symbol');
    expect(giftProblem({ layers: [], sharedLayers: true })).toBe('shared-layers');
  });
});

describe('wobble', () => {
  it('moves every point only a little and keeps the same number of shapes and points', () => {
    const doc = docWithStroke();
    const d = Object.values(doc.drawings)[0];
    if (d.kind !== 'vector') throw new Error('vector');
    const before = JSON.parse(JSON.stringify(d.shapes)) as PathShape[];
    const setup = wobbleSetup(doc.width, doc.height, seeded(5));
    expect(wobbleShapes(d.shapes, setup)).toBe(1);
    const after = d.shapes as PathShape[];
    expect(after).toHaveLength(before.length);
    const max = Math.min(doc.width, doc.height) * WOBBLE_SHARE * Math.SQRT2 + 1e-6;
    before[0].paths[0].points.forEach((p, i) => {
      const q = after[0].paths[0].points[i];
      expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThanOrEqual(max);
    });
  });

  it('is smooth: two close points move almost the same', () => {
    const s = wobbleSetup(800, 600, seeded(9));
    const a = wobblePoint({ x: 100, y: 100 }, s);
    const b = wobblePoint({ x: 101, y: 100 }, s);
    expect(Math.hypot(a.x - 100 - (b.x - 101), a.y - 100 - (b.y - 100))).toBeLessThan(1);
  });

  it('has no target on a locked, hidden, empty or pixel layer', () => {
    const doc = docWithStroke();
    const layer = doc.layers[0];
    expect(wobbleTarget(doc, layer.id, 0)).not.toBeNull();
    layer.locked = true;
    expect(wobbleTarget(doc, layer.id, 0)).toBeNull();
    layer.locked = false;
    layer.visible = false;
    expect(wobbleTarget(doc, layer.id, 0)).toBeNull();
    layer.visible = true;
    expect(wobbleTarget(doc, 'nope', 0)).toBeNull();
    expect(wobbleTarget(doc, null, 0)).toBeNull();
    expect(wobbleTarget(newDoc(), newDoc().layers[0].id, 0)).toBeNull();
  });
});

describe('nudge', () => {
  it('moves a key by a small whole step and adds up, and moving back removes the offset', () => {
    const doc = docWithStroke();
    const t = nudgeTarget(doc, doc.layers[0].id, 0)!;
    expect(t).toBeTruthy();
    const step = nudgeStep(doc.width, doc.height, seeded(4));
    expect(Math.hypot(step.x, step.y)).toBeLessThanOrEqual(Math.min(doc.width, doc.height) * 0.03 + 1);
    expect(applyNudge(doc, t, { x: 6, y: -3 })).toBe(true);
    expect(doc.layers[0].cels[0].offset).toEqual({ x: 6, y: -3 });
    expect(applyNudge(doc, t, { x: -6, y: 3 })).toBe(true);
    expect(doc.layers[0].cels[0].offset).toBeUndefined();
  });

  it('has no target on a locked layer', () => {
    const doc = docWithStroke();
    doc.layers[0].locked = true;
    expect(nudgeTarget(doc, doc.layers[0].id, 0)).toBeNull();
  });
});

describe('what a viewer may send', () => {
  it('a challenge takes nothing, an empty body, or words; never rubbish', () => {
    expect(cleanChallenge(undefined)).toEqual({ text: null });
    expect(cleanChallenge({})).toEqual({ text: null });
    expect(cleanChallenge({ text: '  Draw   a hat\n' })).toEqual({ text: 'Draw a hat' });
    expect(cleanChallenge({ text: '' })).toBeNull();
    expect(cleanChallenge({ text: 5 })).toBeNull();
    expect(cleanChallenge(42)).toBeNull();
  });

  it('a countdown holds seconds to a sensible range', () => {
    expect(cleanCountdown(undefined)).toEqual({ text: null, seconds: null });
    expect(cleanCountdown({ seconds: 1 })).toEqual({ text: null, seconds: COUNTDOWN_MIN });
    expect(cleanCountdown({ seconds: 99999 })).toEqual({ text: null, seconds: COUNTDOWN_MAX });
    expect(cleanCountdown({ seconds: 'ten' })).toBeNull();
    expect(cleanCountdown({ seconds: NaN })).toBeNull();
    expect(cleanCountdown({ text: 'Draw a face', seconds: 30 })).toEqual({ text: 'Draw a face', seconds: 30 });
    expect(cleanCountdown(true)).toBeNull();
  });
});

describe('lengths and the clock', () => {
  it('follow the choice, and an unknown answer is normal', () => {
    expect(dareMs(1, 'short')).toBe(15_000);
    expect(dareMs(1, 'normal')).toBe(30_000);
    expect(dareMs(1, 'long')).toBe(60_000);
    expect(dareMs(1, 'weird')).toBe(30_000);
    expect(dareMs(0.5, 'short')).toBeGreaterThanOrEqual(2000);
  });
  it('count down in whole seconds, never below zero', () => {
    expect(secondsLeft(10_500, 10_000)).toBe(1);
    expect(secondsLeft(10_000, 10_000)).toBe(0);
    expect(secondsLeft(9_000, 10_000)).toBe(0);
    expect(secondsLeft(25_000, 10_000)).toBe(15);
  });
});

describe('the catalogue', () => {
  it('has unique ids, both families, a cooldown that outlasts the shortest overlap, and words for every one', () => {
    const ids = allDares.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^dare\.[a-z]+$/.test(id))).toBe(true);
    expect(allDares.some((d) => d.family === 'view')).toBe(true);
    expect(allDares.some((d) => d.family === 'drawing')).toBe(true);
    for (const d of allDares) {
      expect(d.label.length).toBeGreaterThan(2);
      expect(d.about.length).toBeGreaterThan(10);
      expect(d.about + d.label).not.toMatch(/—/);
      expect(d.cooldown).toBeGreaterThanOrEqual(20_000);
    }
    expect(CHALLENGES.length).toBeGreaterThan(5);
  });
  it('drawing dares share one cooldown group and view dares another, so nothing of a kind stacks', () => {
    expect(new Set(allDares.filter((d) => d.family === 'drawing').map((d) => d.kind))).toEqual(new Set(['dare-draw']));
    expect(new Set(allDares.filter((d) => d.id.match(/flip|spin|shake|grey|zoom/)).map((d) => d.kind))).toEqual(new Set(['dare-view']));
  });
});
