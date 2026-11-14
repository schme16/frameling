import { describe, expect, it } from 'vitest';
import { BREATH, gapBetween, grow, overlapArea, placeCard, pointerNear, zoneOf, type Box, type Place, type PlaceIn, type Size } from '../../src/quests/place';

// A 1280 by 720 window as the app lays it out for the Animate workspace (measured from a real run, in CSS pixels at 100 per cent).
const LAYOUT = {
  canvas: { left: 112, top: 60, right: 888, bottom: 406 },
  rail: { left: 8, top: 56, right: 104, bottom: 600 },
  right: { left: 896, top: 56, right: 1236, bottom: 430 },
  timeline: { left: 112, top: 414, right: 1236, bottom: 664 },
};
const TARGETS = {
  copy: { left: 470, top: 458, right: 502, bottom: 490 },
  play: { left: 206, top: 458, right: 238, bottom: 490 },
  brush: { left: 12, top: 100, right: 56, bottom: 140 },
  fill: { left: 12, top: 214, right: 56, bottom: 254 },
  export: { left: 150, top: 8, right: 210, bottom: 36 },
};
const CARD: Size[] = [
  { w: 420, h: 200 },
  { w: 320, h: 250 },
];
const BAR: Size = { w: 270, h: 40 };

const scaled = (b: Box, k: number): Box => ({ left: b.left / k, top: b.top / k, right: b.right / k, bottom: b.bottom / k });

/** A window at an interface size: the window is the same 1280 by 720 pixels, so there are fewer CSS pixels in it. */
function at(scale: number, target: Box | null, extra: Partial<PlaceIn> = {}): PlaceIn {
  return {
    view: { w: 1280 / scale, h: 720 / scale },
    insets: { top: 44, bottom: 36 },
    sizes: CARD,
    bar: BAR,
    target: target && scaled(target, scale),
    avoid: [scaled(LAYOUT.canvas, scale)],
    ...extra,
  };
}

const boxOf = (p: Place): Box => ({ left: p.left, top: p.top, right: p.left + p.w, bottom: p.top + p.h });

/** The three promises: inside the window, off the target, off the canvas. */
function expectClear(p: Place, i: PlaceIn) {
  const z = zoneOf(i);
  const b = boxOf(p);
  expect(b.left).toBeGreaterThanOrEqual(z.left - 0.5);
  expect(b.top).toBeGreaterThanOrEqual(z.top - 0.5);
  expect(b.right).toBeLessThanOrEqual(z.right + 0.5);
  expect(b.bottom).toBeLessThanOrEqual(z.bottom + 0.5);
  if (i.target) expect(overlapArea(b, grow(i.target, BREATH))).toBe(0);
  for (const a of i.avoid ?? []) expect(overlapArea(b, a)).toBe(0);
  expect(p.covers).toBe(false);
}

describe('where the quest card sits', () => {
  it('keeps off the Copy button in the timeline, and off the canvas (the step that was covered)', () => {
    const i = at(1, TARGETS.copy);
    const p = placeCard(i);
    expect(p.mode).toBe('card');
    expectClear(p, i);
  });

  it('keeps off the tool rail button the step points at, near it', () => {
    for (const t of [TARGETS.brush, TARGETS.fill]) {
      const i = at(1, t);
      const p = placeCard(i);
      expect(p.mode).toBe('card');
      expectClear(p, i);
      expect(gapBetween(boxOf(p), t)).toBeLessThan(400);
    }
  });

  it('keeps off the canvas when the step is the canvas', () => {
    const i = at(1, LAYOUT.canvas);
    const p = placeCard(i);
    expect(p.mode).toBe('card');
    expectClear(p, i);
  });

  it('keeps off a menu button at the top, and sits beside it rather than across the window', () => {
    const i = at(1, TARGETS.export);
    const p = placeCard(i);
    expectClear(p, i);
    expect(gapBetween(boxOf(p), TARGETS.export)).toBeLessThan(500);
  });

  it('lives at the bottom left, as it always did, when nothing is pointed at and nothing is in the way', () => {
    const p = placeCard({ view: { w: 1800, h: 1000 }, sizes: CARD, bar: BAR, target: null });
    expect(p.left).toBe(12);
    expect(p.top + p.h).toBe(1000 - 12);
  });

  it('is clear for every tool and timeline target at 1280 by 720', () => {
    for (const t of Object.values(TARGETS)) {
      const i = at(1, t);
      expectClear(placeCard(i), i);
    }
  });

  it('is clear at 150 per cent (853 by 480 CSS pixels): a narrower card or the bar', () => {
    for (const t of Object.values(TARGETS)) {
      const i = at(1.5, t);
      const p = placeCard(i);
      expectClear(p, i);
    }
  });

  it('is clear at 200 per cent (640 by 360 CSS pixels), where only the small bar fits', () => {
    for (const t of [TARGETS.copy, TARGETS.brush, TARGETS.play]) {
      const i = at(2, t);
      const p = placeCard(i);
      expectClear(p, i);
      expect(p.mode).toBe('bar');
      expect(p.w).toBe(BAR.w);
    }
  });

  it('uses the narrower card before giving up to the bar', () => {
    // A strip 330 wide with room for the narrow card only.
    const i: PlaceIn = { view: { w: 360, h: 500 }, insets: { top: 12, bottom: 12 }, sizes: CARD, bar: BAR, target: null };
    const p = placeCard(i);
    expect(p.mode).toBe('card');
    expect(p.size).toBe(1);
    expect(p.w).toBe(320);
  });

  it('shrinks the card to the window when the window is narrower than the card', () => {
    const p = placeCard({ view: { w: 300, h: 600 }, sizes: [{ w: 276, h: 260 }], bar: BAR, target: null });
    expect(p.mode).toBe('card');
    expect(p.left).toBeGreaterThanOrEqual(12);
    expect(p.left + p.w).toBeLessThanOrEqual(288);
  });

  it('chooses the roomiest free area near the target, not the first corner it finds', () => {
    // A target in the middle of the left edge: the free area on its right is big, the strips above and below are small.
    const view = { w: 1000, h: 800 };
    const t = { left: 12, top: 380, right: 52, bottom: 420 };
    const p = placeCard({ view, sizes: [{ w: 300, h: 150 }], bar: BAR, target: t });
    expect(p.mode).toBe('card');
    expect(overlapArea(boxOf(p), grow(t, BREATH))).toBe(0);
    expect(gapBetween(boxOf(p), t)).toBeLessThan(300);
  });

  describe('standing still', () => {
    it('does not move for a target that shifts a little', () => {
      const first = placeCard(at(1, TARGETS.copy));
      const nudged = { left: TARGETS.copy.left - 6, top: TARGETS.copy.top - 3, right: TARGETS.copy.right - 6, bottom: TARGETS.copy.bottom - 3 };
      const again = placeCard(at(1, nudged, { current: first }));
      expect(again).toEqual(first);
    });

    it('does not move when the window is resized a little and the place is still free', () => {
      const first = placeCard(at(1, TARGETS.copy));
      const i = at(1, TARGETS.copy, { current: first });
      i.view = { w: i.view.w + 20, h: i.view.h + 10 };
      expect(placeCard(i)).toEqual(first);
    });

    it('moves when the target comes to where the card is', () => {
      const first = placeCard(at(1, TARGETS.copy));
      const onto = { left: first.left + 40, top: first.top + 40, right: first.left + 90, bottom: first.top + 80 };
      const i = at(1, onto, { current: first });
      i.avoid = [];
      const p = placeCard(i);
      expect(p.left === first.left && p.top === first.top).toBe(false);
      expectClear(p, i);
    });

    it('gives the same answer for the same boxes', () => {
      const i = at(1, TARGETS.fill);
      expect(placeCard(i)).toEqual(placeCard(i));
    });
  });

  describe('dragged', () => {
    it('stays where the person put it', () => {
      const i = at(1, TARGETS.copy, { pinned: { left: 700, top: 120 } });
      const p = placeCard(i);
      expect(p.left).toBe(700);
      expect(p.top).toBe(120);
    });

    it('is kept inside the window when the window gets smaller', () => {
      const i = at(1, null, { pinned: { left: 1200, top: 600 } });
      const p = placeCard(i);
      expect(p.left + p.w).toBeLessThanOrEqual(1280 - 12);
      expect(p.top + p.h).toBeLessThanOrEqual(720 - 36);
    });

    it('gives way for a step whose target is under it, and the place is used again once it is clear', () => {
      const pinned = { left: 440, top: 440 };
      const covered = at(1, TARGETS.copy, { pinned });
      const p = placeCard(covered);
      expect(p.left === 440 && p.top === 440).toBe(false);
      expectClear(p, covered);
      const clear = placeCard(at(1, TARGETS.brush, { pinned }));
      expect(clear.left).toBe(440);
    });
  });

  describe('put out of the way', () => {
    it('shows the small bar when tucked, off the target', () => {
      const i = at(1, TARGETS.copy, { tucked: true });
      const p = placeCard(i);
      expect(p.mode).toBe('bar');
      expect(p.w).toBe(BAR.w);
      expectClear(p, i);
    });

    it('opens over whatever hides least when asked to, where there is no room', () => {
      const i = at(2, TARGETS.copy, { peek: true });
      const p = placeCard(i);
      expect(p.mode).toBe('card');
      expect(p.covers).toBe(true);
      // The target at least stays in view.
      expect(overlapArea(boxOf(p), scaled(TARGETS.copy, 2))).toBe(0);
    });

    it('says it is covering something when not even the bar fits', () => {
      const t = { left: 0, top: 0, right: 300, bottom: 200 };
      const p = placeCard({ view: { w: 300, h: 200 }, sizes: CARD, bar: BAR, target: t });
      expect(p.mode).toBe('bar');
      expect(p.covers).toBe(true);
    });
  });

  describe('the pointer', () => {
    const box = { left: 100, top: 100, right: 200, bottom: 200 };
    it('is near a box when within the padding', () => {
      expect(pointerNear(box, { left: 150, top: 150 })).toBe(true);
      expect(pointerNear(box, { left: 215, top: 150 })).toBe(true);
      expect(pointerNear(box, { left: 260, top: 150 })).toBe(false);
    });
    it('is not near when there is nothing', () => {
      expect(pointerNear(null, { left: 1, top: 1 })).toBe(false);
      expect(pointerNear(box, null)).toBe(false);
    });
  });
});
