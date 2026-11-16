import { beforeEach, describe, expect, it } from 'vitest';
import type { PathShape, Repeat } from '../../src/core/format';
import { getCommand, getPanel, getTool } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { currentChoice, resetChoices, setChoice } from '../../src/core/choices';
import '../../src/tools/edit-commands';
import '../../src/tools/merge-mode';
import '../../src/repeat';
import { resetRepeatTool } from '../../src/repeat/tool';
import { changeRepeat, currentRepeat, pickedExtent } from '../../src/repeat/ops';
import { addShapes, box, ctx, drag, ptr, shapesNow, vectorStore } from '../tools/helpers';

const pick = (...ids: string[]) => store().setUi({ selection: ids });
const run = (id: string) => void getCommand(id)!.run();
const repeatOf = (id: string): Repeat | undefined => (shapesNow().find((s) => s.id === id) as PathShape & { repeat?: Repeat }).repeat;

beforeEach(() => {
  resetChoices();
  vectorStore();
  resetRepeatTool();
});

describe('the Repeat commands', () => {
  it('are there in plain words, greyed with a reason when nothing is picked, and on keys that clash with nothing', () => {
    for (const id of ['repeat.grid', 'repeat.ring', 'repeat.mirror']) {
      const c = getCommand(id)!;
      expect(c.keys?.length).toBe(1);
      expect(c.enabled?.(store().get())).toBe(false);
      expect(c.reason?.(store().get())).toMatch(/Select a shape/);
    }
    expect(getCommand('repeat.off')!.reason?.(store().get())).toMatch(/Select a shape that repeats/);
    expect(getPanel('repeat')).toBeTruthy();
    expect(getTool('repeat')?.railless).toBe(true);
  });
});

describe('putting a repeat on', () => {
  it('makes a grid with steps that fit the shape, in one undo step', () => {
    addShapes(box('a', 50, 50, 40, 30));
    pick('a');
    run('repeat.grid');
    expect(repeatOf('a')).toEqual({ kind: 'grid', cols: 3, rows: 3, dx: 52, dy: 42 });
    store().undo();
    expect(repeatOf('a')).toBeUndefined();
    expect(shapesNow()).toHaveLength(1);
  });

  it('puts a ring round the middle of the page, the copies turning with it unless that was answered otherwise', () => {
    addShapes(box('a', 50, 50, 40, 30));
    pick('a');
    run('repeat.ring');
    expect(repeatOf('a')).toEqual({ kind: 'ring', count: 8, cx: 200, cy: 150 });
    expect(currentChoice('repeat.ringTurn')).toBe('follow');
  });

  it('keeps the copies upright when that is the remembered answer', () => {
    setChoice('repeat.ringTurn', 'upright');
    addShapes(box('a', 50, 50, 40, 30));
    pick('a');
    run('repeat.ring');
    expect(repeatOf('a')).toMatchObject({ kind: 'ring', turn: false });
  });

  it('makes a mirror image across the middle of the page, up and down', () => {
    addShapes(box('a', 50, 50, 40, 30));
    pick('a');
    run('repeat.mirror');
    expect(repeatOf('a')).toEqual({ kind: 'mirror', x: 200, y: 150 });
  });

  it('groups several shapes first, so they repeat as one', () => {
    addShapes(box('a', 50, 50, 40, 30), box('b', 120, 50, 40, 30));
    pick('a', 'b');
    run('repeat.grid');
    const [a, b] = shapesNow();
    expect(a.group).toBeTruthy();
    expect(a.group).toBe(b.group);
    expect(repeatOf('a')).toEqual(repeatOf('b'));
    // The steps fit the whole group.
    expect(repeatOf('a')).toMatchObject({ dx: 122 });
  });

  it('leaves shapes that already share a group in it', () => {
    addShapes({ ...box('a', 50, 50, 40, 30), group: 'g' } as PathShape, { ...box('b', 120, 50, 40, 30), group: 'g' } as PathShape);
    pick('a', 'b');
    run('repeat.grid');
    expect(shapesNow().map((s) => s.group)).toEqual(['g', 'g']);
  });
});

describe('changing it afterwards', () => {
  beforeEach(() => {
    addShapes(box('a', 50, 50, 40, 30));
    pick('a');
    run('repeat.grid');
  });

  it('takes a typed number live, a run of changes being one undo step', () => {
    for (const cols of [4, 5, 6]) changeRepeat('Repeat: across', (r) => (r.kind === 'grid' ? { ...r, cols } : r), 'repeat-cols');
    expect(repeatOf('a')).toMatchObject({ cols: 6 });
    store().undo();
    expect(repeatOf('a')).toMatchObject({ cols: 3 });
  });

  it('shows the whole reach of the copies', () => {
    expect(pickedExtent()).toEqual({ x: 50, y: 50, w: 40 + 2 * 52, h: 30 + 2 * 42 });
  });

  it('takes the repeat off, keeping the shape', () => {
    run('repeat.off');
    expect(shapesNow()).toHaveLength(1);
    expect(repeatOf('a')).toBeUndefined();
    expect(currentRepeat()).toBeNull();
  });

  it('turns the copies into shapes of their own, and says so by selecting them', () => {
    run('repeat.expand');
    const now = shapesNow() as (PathShape & { repeat?: Repeat })[];
    expect(now).toHaveLength(9);
    expect(now.every((s) => !s.repeat)).toBe(true);
    expect(new Set(now.map((s) => s.id)).size).toBe(9);
    expect(store().get().ui.selection).toHaveLength(9);
    store().undo();
    expect(shapesNow()).toHaveLength(1);
    expect(repeatOf('a')).toBeTruthy();
  });
});

describe('the Repeat tool', () => {
  it('drags a ring’s centre, snapping to a guide, in one undo step', () => {
    store().update('guide', (d) => void (d.guides = [{ id: 'g1', axis: 'x', at: 120 }]));
    addShapes(box('a', 50, 50, 40, 30));
    pick('a');
    run('repeat.ring');
    const tool = getTool('repeat')!;
    const c = ctx();
    // Grab the centre handle (200, 150) and take it near the guide at x = 120.
    drag(tool, c, [[200, 150], [150, 160], [122, 170]]);
    const r = repeatOf('a');
    expect(r).toMatchObject({ kind: 'ring' });
    if (r?.kind !== 'ring') throw new Error('ring');
    expect(r.cx).toBe(120);
    expect(r.cy).toBe(170);
    store().undo();
    expect(repeatOf('a')).toMatchObject({ cx: 200, cy: 150 });
  });

  it('lets go of the snapping with Ctrl held', () => {
    store().update('guide', (d) => void (d.guides = [{ id: 'g1', axis: 'x', at: 120 }]));
    addShapes(box('a', 50, 50, 40, 30));
    pick('a');
    run('repeat.ring');
    drag(getTool('repeat')!, ctx(), [[200, 150], [150, 160], [122, 170]], { mod: true });
    expect(repeatOf('a')).toMatchObject({ cx: 122 });
  });

  it('moves a mirror line and turns it by its far end', () => {
    addShapes(box('a', 50, 50, 40, 30));
    pick('a');
    run('repeat.mirror');
    const tool = getTool('repeat')!;
    // The point handle sits at the page middle; drag it somewhere.
    drag(tool, ctx(), [[200, 150], [250, 150], [260, 140]], { mod: true });
    expect(repeatOf('a')).toMatchObject({ kind: 'mirror', x: 260, y: 140 });
    // The turning end is 110 screen pixels along the line (up and down: below the point at zoom 1).
    drag(tool, ctx(), [[260, 250], [300, 200], [360, 140]], { mod: true });
    const r = repeatOf('a');
    if (r?.kind !== 'mirror') throw new Error('mirror');
    expect(r.angle).toBeCloseTo(0, 6);
  });

  it('drags a grid’s step to where the next copy should land', () => {
    addShapes(box('a', 50, 50, 40, 30));
    pick('a');
    run('repeat.grid');
    // The step handle sits at the shape's middle (70, 65) plus the step (52, 42).
    drag(getTool('repeat')!, ctx(), [[122, 107], [130, 110], [150, 125]], { mod: true });
    expect(repeatOf('a')).toMatchObject({ kind: 'grid', dx: 80, dy: 60 });
  });

  it('clicking a shape picks it, so its repeat shows', () => {
    addShapes({ ...box('a', 50, 50, 40, 30), repeat: { kind: 'mirror', x: 200, y: 0 } } as PathShape);
    pick();
    drag(getTool('repeat')!, ctx(), [[60, 60], [60, 60]]);
    expect(store().get().ui.selection).toEqual(['a']);
  });
});

describe('the mirror here and the mirror drawing mode', () => {
  it('give the same copy of the same shape across the same line', async () => {
    const { mirrorShapes, vectorMirror } = await import('../../src/tools/mirror');
    const { withRepeats } = await import('../../src/core/repeats');
    const s = { ...box('a', 50, 50, 40, 30), repeat: { kind: 'mirror', x: 120, y: 0 } } as PathShape;
    const drawn = mirrorShapes([box('a', 50, 50, 40, 30)], vectorMirror('h', 400, 300, 120, null), () => 'x')[0] as PathShape;
    addShapes(s);
    const d = store().get().doc.drawings[Object.keys(store().get().doc.drawings)[0]];
    const out = withRepeats(d);
    if (out.kind !== 'vector') throw new Error('vector');
    expect((out.shapes[1] as PathShape).paths).toEqual(drawn.paths);
  });
});
