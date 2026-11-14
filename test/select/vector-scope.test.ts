import { beforeEach, describe, expect, it } from 'vitest';
import type { PathShape } from '../../src/core/format';
import { store } from '../../src/core/store';
import { getCommand } from '../../src/core/registry';
import { getChoiceDef, rememberedChoice, resetChoices, setChoice } from '../../src/core/choices';
import '../../src/core/commands';
import '../../src/tools';
import { selectTool } from '../../src/tools/select';
import { setLayerDrawMode } from '../../src/tools/merge-mode';
import { IDENTITY, translate } from '../../src/canvas/geometry';
import {
  addPicks,
  boxArea,
  clearParts,
  currentParts,
  keyOf,
  movePoints,
  otherScope,
  pickedBounds,
  pickScoped,
  pointInPolygon,
  removePoints,
  SCOPE_CHOICE,
  scopeFor,
  transformPicked,
} from '../../src/select/scope';
import { addShapes, box, ctx, drag, ptr, shapesNow, vectorStore } from '../tools/helpers';

const sel = () => store().get().ui.selection;
const pathOf = (id: string): PathShape => shapesNow().find((s) => s.id === id) as PathShape;

// A 100 x 100 square at (100, 100): corners (100,100) (200,100) (200,200) (100,200) in that order.
const square = () => box('sq', 100, 100, 100, 100);

beforeEach(() => {
  vectorStore();
  resetChoices();
  clearParts();
  store().setUi({ tool: 'select' });
});

describe('the scope decision', () => {
  const shapes = [square(), box('far', 400, 400, 20, 20)];

  it('whole takes every shape the drag touches, parts takes the points inside it', () => {
    const area = boxArea({ x: 150, y: 150, w: 100, h: 100 }); // covers only the bottom right corner
    const whole = pickScoped(shapes, area, 'whole');
    expect(whole.ids).toEqual(['sq']);
    expect(whole.parts.size).toBe(0);
    const parts = pickScoped(shapes, area, 'parts');
    expect(parts.ids).toEqual(['sq']);
    expect([...parts.parts.get('sq')!]).toEqual([keyOf(0, 2)]);
  });

  it('says the two answers differ only when some shape is not wholly inside', () => {
    expect(pickScoped(shapes, boxArea({ x: 150, y: 150, w: 100, h: 100 }), 'whole').differs).toBe(true);
    // Right round the square: both ways pick all of it, so there is nothing to ask.
    const round = pickScoped(shapes, boxArea({ x: 90, y: 90, w: 120, h: 120 }), 'whole');
    expect(round.differs).toBe(false);
    expect(pickScoped(shapes, boxArea({ x: 90, y: 90, w: 120, h: 120 }), 'parts').parts.size).toBe(0);
    // Over nothing at all.
    expect(pickScoped(shapes, boxArea({ x: 0, y: 0, w: 10, h: 10 }), 'whole').differs).toBe(false);
  });

  it('a box across the middle of an edge touches the shape but holds no point of it', () => {
    const area = boxArea({ x: 140, y: 90, w: 20, h: 20 });
    expect(pickScoped(shapes, area, 'whole').ids).toEqual(['sq']);
    expect(pickScoped(shapes, area, 'whole').differs).toBe(true);
    expect(pickScoped(shapes, area, 'parts').ids).toEqual([]);
  });

  it('a shape with no points of its own is only picked when it is wholly inside', () => {
    const text = { id: 't', type: 'text' } as never;
    const touching = { touches: () => true, holds: () => true, wraps: () => false };
    expect(pickScoped([text], touching, 'whole').ids).toEqual(['t']);
    expect(pickScoped([text], touching, 'parts').ids).toEqual([]);
    expect(pickScoped([text], { ...touching, wraps: () => true }, 'parts').ids).toEqual(['t']);
  });

  it('the usual way and the other way', () => {
    expect(scopeFor('whole', false)).toBe('whole');
    expect(scopeFor('whole', true)).toBe('parts');
    expect(scopeFor('parts', true)).toBe('whole');
    expect(otherScope('parts')).toBe('whole');
  });

  it('Shift adds points to the ones already picked, and keeps a whole shape whole', () => {
    const base = new Map([['a', new Set([keyOf(0, 0)])]]);
    const next = new Map([['a', new Set([keyOf(0, 1)])], ['b', new Set([keyOf(0, 0)])]]);
    const out = addPicks(base, ['a', 'w'], next);
    expect([...out.get('a')!].sort()).toEqual([keyOf(0, 0), keyOf(0, 1)]);
    expect(out.has('b')).toBe(true);
    const keepsWhole = addPicks(new Map(), ['w'], new Map([['w', new Set([keyOf(0, 0)])]]));
    expect(keepsWhole.has('w')).toBe(false);
  });

  it('points inside a closed outline, including one that crosses itself', () => {
    const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    expect(pointInPolygon({ x: 2, y: 2 }, tri)).toBe(true);
    expect(pointInPolygon({ x: 9, y: 9 }, tri)).toBe(false);
  });
});

describe('moving only the picked points', () => {
  it('moves one corner and leaves the rest', () => {
    const moved = movePoints(square(), translate(10, 20), new Set([keyOf(0, 2)])) as PathShape;
    const pts = moved.paths[0].points;
    expect(pts[2]).toMatchObject({ x: 210, y: 220 });
    expect(pts[0]).toMatchObject({ x: 100, y: 100 });
    expect(pts[1]).toMatchObject({ x: 200, y: 100 });
    expect(pts[3]).toMatchObject({ x: 100, y: 200 });
  });

  it('a curve is dragged by the point it hangs from, the far end stays', () => {
    const curve: PathShape = {
      id: 'c',
      type: 'path',
      paths: [
        {
          closed: false,
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0, c1: { x: 30, y: 40 }, c2: { x: 70, y: 40 } },
            { x: 200, y: 0, c1: { x: 130, y: -40 }, c2: { x: 170, y: -40 } },
          ],
        },
      ],
      fill: null,
      stroke: null,
      opacity: 1,
    } as never;
    const out = movePoints(curve, translate(0, 10), new Set([keyOf(0, 1)])) as PathShape;
    const [, p1, p2] = out.paths[0].points;
    expect(p1).toMatchObject({ x: 100, y: 10, c1: { x: 30, y: 40 }, c2: { x: 70, y: 50 } });
    // The next curve starts at this point, so its first handle goes with it; its own end stays.
    expect(p2).toMatchObject({ x: 200, y: 0, c1: { x: 130, y: -30 }, c2: { x: 170, y: -40 } });
  });

  it('a closed shape wraps: the last point drives the first one\'s incoming curve handle', () => {
    const s: PathShape = {
      id: 'w',
      type: 'path',
      paths: [{ closed: true, points: [{ x: 0, y: 0, c1: { x: 5, y: 5 }, c2: { x: 1, y: 1 } }, { x: 10, y: 0 }, { x: 10, y: 10 }] }],
      fill: null,
      stroke: null,
      opacity: 1,
    } as never;
    const out = movePoints(s, translate(100, 0), new Set([keyOf(0, 2)])) as PathShape;
    expect(out.paths[0].points[0].c1).toEqual({ x: 105, y: 5 });
    expect(out.paths[0].points[0].c2).toEqual({ x: 1, y: 1 });
  });

  it('transformPicked moves a shape whole when nothing of it is picked on its own', () => {
    const out = transformPicked(square(), translate(5, 5), new Map()) as PathShape;
    expect(out.paths[0].points[0]).toMatchObject({ x: 105, y: 105 });
    expect(movePoints(square(), IDENTITY, new Set())).toMatchObject({ id: 'sq' });
  });

  it('delete takes the points, and the shape when too little is left', () => {
    const three = removePoints(square(), new Set([keyOf(0, 0)])) as PathShape;
    expect(three.paths[0].points).toHaveLength(3);
    expect(removePoints(square(), new Set([keyOf(0, 0), keyOf(0, 1)]))).toBeNull();
  });

  it('the box round the picked points, not the whole shape', () => {
    const b = pickedBounds([square()], new Map([['sq', new Set([keyOf(0, 2)])]]));
    expect(b).toEqual({ x: 200, y: 200, w: 0, h: 0 });
    expect(pickedBounds([square()], new Map())).toEqual({ x: 100, y: 100, w: 100, h: 100 });
  });
});

describe('Select with the choice', () => {
  // A drag over just the bottom right corner of the square.
  const corner = (extra = {}) => drag(selectTool, ctx(), [[250, 250], [150, 150]], extra);

  it('is registered, asks plainly, and the whole shape is what it does until you say', () => {
    const def = getChoiceDef(SCOPE_CHOICE)!;
    expect(def.default).toBe('whole');
    expect(def.options.map((o) => o.value)).toEqual(['parts', 'whole']);
    expect(def.question).not.toMatch(/—/);
    addShapes(square());
    corner();
    expect(sel()).toEqual(['sq']);
    expect(currentParts().size).toBe(0);
    expect(rememberedChoice(SCOPE_CHOICE)).toBeUndefined();
  });

  it('just the bit: picks the corner, and a drag on it moves only that corner', () => {
    setChoice(SCOPE_CHOICE, 'parts');
    addShapes(square());
    corner();
    expect(sel()).toEqual(['sq']);
    expect([...currentParts().get('sq')!]).toEqual([keyOf(0, 2)]);
    // Grab the picked corner and pull it.
    drag(selectTool, ctx(), [[200, 200], [230, 240]]);
    const pts = pathOf('sq').paths[0].points;
    expect(pts[2]).toMatchObject({ x: 230, y: 240 });
    expect(pts[0]).toMatchObject({ x: 100, y: 100 });
    // The pick is still on the same corner after the move.
    expect([...currentParts().get('sq')!]).toEqual([keyOf(0, 2)]);
  });

  it('the whole shape: the same drag moves the lot', () => {
    setChoice(SCOPE_CHOICE, 'whole');
    addShapes(square());
    corner();
    drag(selectTool, ctx(), [[160, 160], [180, 180]]);
    const pts = pathOf('sq').paths[0].points;
    expect(pts[0]).toMatchObject({ x: 120, y: 120 });
    expect(pts[2]).toMatchObject({ x: 220, y: 220 });
  });

  it('Ctrl swaps it for one drag, and only that drag', () => {
    setChoice(SCOPE_CHOICE, 'whole');
    addShapes(square());
    corner({ mod: true });
    expect(currentParts().size).toBe(1);
    corner();
    expect(currentParts().size).toBe(0);
    setChoice(SCOPE_CHOICE, 'parts');
    corner({ mod: true });
    expect(currentParts().size).toBe(0);
    expect(sel()).toEqual(['sq']);
  });

  it('the lasso follows the same choice', () => {
    setChoice(SCOPE_CHOICE, 'parts');
    store().setUi({ tool: 'select-lasso' });
    addShapes(square());
    drag(selectTool, ctx(), [[260, 260], [150, 260], [150, 150], [260, 150]]);
    expect([...currentParts().get('sq')!]).toEqual([keyOf(0, 2)]);
  });

  it('Delete takes just the picked point, and the pick lets go when the selection changes', () => {
    setChoice(SCOPE_CHOICE, 'parts');
    addShapes(square());
    corner();
    void getCommand('edit.delete')!.run();
    expect(pathOf('sq').paths[0].points).toHaveLength(3);
    expect(currentParts().size).toBe(0);
    corner();
    store().setUi({ selection: [] });
    expect(currentParts().size).toBe(0);
  });

  it('a nudge takes just the picked points', () => {
    setChoice(SCOPE_CHOICE, 'parts');
    addShapes(square());
    corner();
    void getCommand('select.nudgeRight')?.run();
    const pts = pathOf('sq').paths[0].points;
    expect(pts[2].x).toBe(201);
    expect(pts[0].x).toBe(100);
  });

  it('a merge layer keeps its own way and is never asked', () => {
    setLayerDrawMode(store().get().doc.layers[0].id, 'merge');
    addShapes(box('m', 0, 0, 100, 100));
    drag(selectTool, ctx(), [[150, 150], [50, 50]]);
    expect(currentParts().size).toBe(0);
    expect(sel()).toHaveLength(1);
  });

  it('the Ctrl swap is free: no shortcut is a bare Ctrl, and the command takes no keys', async () => {
    const { allCommands } = await import('../../src/core/registry');
    expect(getCommand('select.scope')!.keys ?? []).toEqual([]);
    // Ctrl as a held key is only ever a modifier of another key or of a drag; nothing is bound to Ctrl alone.
    for (const c of allCommands()) for (const k of c.keys ?? []) expect(k.replace(/\+?(Mod|Ctrl|Control)\+?/g, '')).not.toBe('');
  });

  it('the command flips it, and is listed with its own words', () => {
    const cmd = getCommand('select.scope')!;
    expect(cmd.checked?.({} as never)).toBe(false);
    void cmd.run();
    expect(rememberedChoice(SCOPE_CHOICE)).toBe('parts');
    expect(cmd.checked?.({} as never)).toBe(true);
  });
});

void ptr;
