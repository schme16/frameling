// Alt on the canvas: a click picks a colour, a drag turns the view. The rule is pure (src/canvas/altPress.ts); the
// engine tests below drive real pointer events through it, with a mouse and with a pen.
import { describe, expect, it } from 'vitest';
import { ALT_TURN_TOOLS, TURN_SLOP_MOUSE, TURN_SLOP_PEN, altPressMoved, altPressReleased, altTurnPress, turnSlop } from '../../src/canvas/altPress';
import { TURN_MAGNET, dragAngle, normAngle, turnedBy } from '../../src/canvas/turn';

describe('pick or turn', () => {
  it('stays a pick for a shaky hand, whichever way it wobbles', () => {
    for (let a = 0; a < 360; a += 15) {
      const dx = Math.cos((a * Math.PI) / 180) * (TURN_SLOP_MOUSE - 0.01);
      const dy = Math.sin((a * Math.PI) / 180) * (TURN_SLOP_MOUSE - 0.01);
      expect(altPressMoved('waiting', dx, dy, 'mouse')).toBe('waiting');
    }
    expect(altPressMoved('waiting', 0, 0, 'mouse')).toBe('waiting');
    expect(altPressMoved('waiting', 4, 4, 'mouse')).toBe('waiting');
  });

  it('turns once it has gone past the distance, in any direction', () => {
    expect(altPressMoved('waiting', 7, 0, 'mouse')).toBe('turning');
    expect(altPressMoved('waiting', 0, -7, 'mouse')).toBe('turning');
    expect(altPressMoved('waiting', 5, 5, 'mouse')).toBe('turning');
  });

  it('a pen is allowed a little more shake than a mouse', () => {
    expect(TURN_SLOP_PEN).toBeGreaterThan(TURN_SLOP_MOUSE);
    expect(turnSlop('pen')).toBe(TURN_SLOP_PEN);
    expect(turnSlop('mouse')).toBe(TURN_SLOP_MOUSE);
    expect(altPressMoved('waiting', 8, 0, 'pen')).toBe('waiting');
    expect(altPressMoved('waiting', 8, 0, 'mouse')).toBe('turning');
    expect(altPressMoved('waiting', 10, 0, 'pen')).toBe('turning');
  });

  it('once turning, always turning, even if the pointer comes back', () => {
    expect(altPressMoved('turning', 0, 0, 'mouse')).toBe('turning');
  });

  it('letting go while still waiting is a pick, and a turn is not', () => {
    expect(altPressReleased('waiting')).toBe('pick');
    expect(altPressReleased('turning')).toBe('nothing');
  });

  it('only takes the press for tools that do not use Alt themselves, and Alt on its own', () => {
    const base = { alt: true, shift: false, mod: false, button: 0, tool: 'pencil', pointerType: 'mouse' };
    expect(altTurnPress(base)).toBe(true);
    expect(altTurnPress({ ...base, pointerType: 'pen' })).toBe(true);
    expect(altTurnPress({ ...base, alt: false })).toBe(false);
    expect(altTurnPress({ ...base, shift: true })).toBe(false);
    expect(altTurnPress({ ...base, mod: true })).toBe(false);
    expect(altTurnPress({ ...base, button: 2 })).toBe(false);
    expect(altTurnPress({ ...base, pointerType: 'touch' })).toBe(false);
    for (const t of ['rect', 'ellipse', 'line', 'select', 'transform', 'pen', 'hand', 'zoom', 'eyedropper', 'artboard', 'camera']) {
      expect(ALT_TURN_TOOLS.has(t), t).toBe(false);
    }
  });
});

describe('any angle', () => {
  it('keeps a tenth of a degree and wraps round', () => {
    expect(normAngle(37)).toBe(37);
    expect(normAngle(37.46)).toBe(37.5);
    expect(normAngle(-10)).toBe(350);
    expect(normAngle(725)).toBe(5);
    expect(normAngle(359.97)).toBe(0);
    expect(normAngle(Number.NaN)).toBe(0);
  });

  it('a drag follows the pointer and settles straight near a quarter turn', () => {
    expect(dragAngle(0, 37, false, false)).toBe(37);
    expect(dragAngle(0, 2, false, false)).toBe(0);
    expect(dragAngle(0, -TURN_MAGNET, false, false)).toBe(0);
    expect(dragAngle(0, -4, false, false)).toBe(356);
    expect(dragAngle(10, 81, false, false)).toBe(90);
    expect(dragAngle(10, 75, false, false)).toBe(85);
    expect(dragAngle(10, 170, false, false)).toBe(180);
  });

  it('Shift while dragging gives 15 degree steps', () => {
    expect(dragAngle(0, 37, false, true)).toBe(30);
    expect(dragAngle(0, 38, false, true)).toBe(45);
    expect(dragAngle(10, 5, false, true)).toBe(15);
  });

  it('a mirrored view drags the other way', () => {
    expect(dragAngle(0, 40, true, false)).toBe(320);
  });

  it('the turn keys step to the next 15 from a free angle, then carry on in 15s', () => {
    expect(turnedBy({ angle: 37, flip: false }, 1).angle).toBe(45);
    expect(turnedBy({ angle: 37, flip: false }, -1).angle).toBe(30);
    expect(turnedBy({ angle: 37, flip: false }, 2).angle).toBe(60);
    expect(turnedBy({ angle: 45, flip: false }, 1).angle).toBe(60);
    expect(turnedBy({ angle: 0.4, flip: true }, -1)).toEqual({ angle: 0, flip: true });
  });
});
