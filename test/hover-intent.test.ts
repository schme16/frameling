import { describe, expect, it } from 'vitest';
import { headingTo, type Box } from '../src/ui/hoverIntent';

// A submenu sitting to the right of the menu, as the Export submenu does.
const right: Box = { left: 200, top: 100, right: 400, bottom: 400 };
// And one placed to the left, as it is when the window runs out of room.
const left: Box = { left: 0, top: 100, right: 150, bottom: 400 };

describe('headingTo', () => {
  it('says yes to a straight run at the box', () => {
    expect(headingTo({ x: 100, y: 200 }, { x: 120, y: 200 }, right)).toBe(true);
  });

  it('says yes to the diagonal that crosses the rows below', () => {
    // From the row that opened it, down and across to an item near the bottom of the submenu.
    expect(headingTo({ x: 100, y: 120 }, { x: 130, y: 160 }, right)).toBe(true);
  });

  it('says no once the pointer turns away', () => {
    expect(headingTo({ x: 100, y: 120 }, { x: 80, y: 160 }, right)).toBe(false);
  });

  it('says no when the pointer drops straight down past the box', () => {
    expect(headingTo({ x: 100, y: 500 }, { x: 100, y: 540 }, right)).toBe(false);
  });

  it('says no when it is steeper than the far corner', () => {
    expect(headingTo({ x: 100, y: 120 }, { x: 110, y: 500 }, right)).toBe(false);
  });

  it('works for a submenu on the left as well', () => {
    expect(headingTo({ x: 200, y: 120 }, { x: 170, y: 160 }, left)).toBe(true);
    expect(headingTo({ x: 200, y: 120 }, { x: 230, y: 160 }, left)).toBe(false);
  });

  it('says no when nothing moved, or when there is nothing to go on', () => {
    expect(headingTo({ x: 100, y: 200 }, { x: 100, y: 200 }, right)).toBe(false);
    expect(headingTo(null, { x: 100, y: 200 }, right)).toBe(false);
    expect(headingTo({ x: 100, y: 200 }, { x: 120, y: 200 }, null)).toBe(false);
  });

  it('says no when the pointer is already over the box horizontally', () => {
    expect(headingTo({ x: 280, y: 50 }, { x: 290, y: 70 }, right)).toBe(false);
  });
});
