import { describe, expect, it } from 'vitest';
import { ARROW_INSET, ARROW_REACH, TIP_GAP, TIP_MARGIN, arrowOffset, isRailThing, placeTip, type Box } from '../../src/ui/tipPlace';

const view = { width: 1400, height: 900 };
const tip = { width: 200, height: 60 };
const box = (left: number, top: number, w: number, h: number): Box => ({ left, top, right: left + w, bottom: top + h });

describe('tip placement', () => {
  it('goes just above the thing by default, centred on it', () => {
    const thing = box(600, 400, 40, 30);
    const p = placeTip(thing, tip, view);
    expect(p.side).toBe('above');
    expect(p.top).toBe(thing.top - TIP_GAP - tip.height);
    expect(p.left).toBe(620 - 100);
    expect(p.arrow).toBe(100);
  });

  it('drops under the thing only when there is no room above', () => {
    const thing = box(600, 40, 40, 30);
    const p = placeTip(thing, tip, view);
    expect(p.side).toBe('below');
    expect(p.top).toBe(thing.bottom + TIP_GAP);
    expect(p.arrow).toBe(100);
  });

  it('stays above when it just fits, and flips by one pixel less', () => {
    const fits = TIP_MARGIN + tip.height + TIP_GAP;
    expect(placeTip(box(600, fits, 40, 30), tip, view).side).toBe('above');
    expect(placeTip(box(600, fits - 1, 40, 30), tip, view).side).toBe('below');
  });

  it('is held on screen sideways, and the arrow slides to keep pointing at the thing', () => {
    const thing = box(1380, 400, 16, 30);
    const p = placeTip(thing, tip, view);
    expect(p.left).toBe(view.width - tip.width - TIP_MARGIN);
    // 1388 is 196 along the tip, but the arrow stops short of the corner.
    expect(p.arrow).toBe(tip.width - ARROW_INSET);
    const near = placeTip(box(2, 400, 30, 70), tip, view);
    expect(near.left).toBe(TIP_MARGIN);
    expect(near.arrow).toBe(ARROW_INSET);
  });

  it('moves the arrow smoothly as the thing moves: every step along changes it by the same step, no jumps', () => {
    const arrows: number[] = [];
    for (let x = 1100; x <= 1380; x += 10) {
      const a = placeTip(box(x, 400, 20, 20), tip, view).arrow;
      expect(a).not.toBeNull();
      arrows.push(a as number);
    }
    for (let i = 1; i < arrows.length; i++) {
      const step = arrows[i] - arrows[i - 1];
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThanOrEqual(10);
    }
    expect(arrows[0]).toBe(100);
    expect(arrows[arrows.length - 1]).toBeGreaterThan(arrows[0]);
  });

  it('keeps the arrow off the tip corners', () => {
    const p = placeTip(box(1385, 400, 10, 30), tip, view);
    expect(p.arrow).toBe(tip.width - ARROW_INSET);
    const q = placeTip(box(1, 400, 20, 70), tip, view);
    expect(q.arrow).toBe(ARROW_INSET);
  });

  it('puts a tool at the left edge beside it, arrow on its left edge', () => {
    const thing = box(8, 300, 40, 40);
    expect(isRailThing(thing)).toBe(true);
    const p = placeTip(thing, tip, view);
    expect(p.side).toBe('right');
    expect(p.left).toBe(thing.right + TIP_GAP);
    expect(p.top).toBe(320 - 30);
    expect(p.arrow).toBe(30);
  });

  it('slides a rail arrow when the tip is held off the top or bottom', () => {
    const p = placeTip(box(8, 2, 40, 40), tip, view);
    expect(p.top).toBe(TIP_MARGIN);
    expect(p.arrow).toBe(ARROW_INSET);
    const low = placeTip(box(8, 880, 40, 20), tip, view);
    expect(low.top).toBe(view.height - tip.height - TIP_MARGIN);
    expect(low.arrow).toBe(tip.height - ARROW_INSET);
  });

  it('leaves the arrow off when the tip could not be placed near the thing', () => {
    // A thing as tall as the window: neither side has room, the tip lands on top of it.
    const p = placeTip(box(300, 0, 400, 900), tip, view);
    expect(p.arrow).toBeNull();
  });

  it('leaves the arrow off when the thing is out of the arrow reach, rather than pointing at nothing', () => {
    expect(arrowOffset(100, 500, 200)).toBeNull();
    expect(arrowOffset(500 - ARROW_INSET - ARROW_REACH - 1, 500, 200)).toBeNull();
    expect(arrowOffset(500 + 100, 500, 200)).toBe(100);
  });

  it('arrowOffset clamps within the reach and is continuous', () => {
    expect(arrowOffset(500, 500, 200)).toBe(ARROW_INSET);
    expect(arrowOffset(500 + ARROW_INSET - ARROW_REACH, 500, 200)).toBe(ARROW_INSET);
    expect(arrowOffset(700, 500, 200)).toBe(200 - ARROW_INSET);
  });

  it('a menu row gets its tip beside the whole menu, level with the row, with no arrow', () => {
    const menus = box(100, 40, 250, 400);
    const row = box(110, 200, 230, 28);
    const p = placeTip(row, tip, view, menus, true);
    expect(p.side).toBe('aside');
    expect(p.left).toBe(menus.right + 10);
    expect(p.top).toBe(row.top - 6);
    expect(p.arrow).toBeNull();
  });

  it('a menu row goes to the left of the menu when there is no room on the right', () => {
    const menus = box(1100, 40, 250, 400);
    const p = placeTip(box(1110, 200, 230, 28), tip, view, menus, true);
    expect(p.left).toBe(menus.left - 10 - tip.width);
  });

  it('a menu-row thing with no menu open is placed the ordinary way, above, with an arrow', () => {
    const p = placeTip(box(600, 400, 40, 30), tip, view, null, true);
    expect(p.side).toBe('above');
    expect(p.arrow).toBe(100);
  });
});
