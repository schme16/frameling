import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PathShape, StrokeShape } from '../../src/core/format';
import { getCommand } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { resetChoices, setChoice } from '../../src/core/choices';
import { brushTool } from '../../src/tools/brush';
import { pencilTool } from '../../src/tools/pencil';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { HOLD_MS_DEFAULT, HOLD_SLOP_SCREEN, StillWatch, TIDY_CHOICE, holdMs, strokeToShape, tidyWidth } from '../../src/tools/quickshape';
import { setLayerDrawMode } from '../../src/tools/merge-mode';
import '../../src/tools/edit-commands';
import { ctx, ptr, shapesNow, vectorStore } from './helpers';

/** A hand-drawn circle: a point every 16 ms for a bit over one turn, a little off true. */
const circle = (cx: number, cy: number, r: number, n = 70): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / (n - 1)) * Math.PI * 2 * 1.03 + 0.5;
    const wob = 1 + 0.025 * Math.sin(i * 1.7);
    return [cx + Math.cos(a) * r * wob, cy + Math.sin(a) * r * wob] as [number, number];
  });

/** Draws `pts` with the tool, `gap` ms between points, then holds still `hold` ms before lifting. */
function stroke(tool: typeof brushTool, pts: [number, number][], hold: number, gap = 16, c = ctx(), extra: Parameters<typeof ptr>[2] = {}) {
  tool.down?.(ptr(...pts[0], extra), c);
  for (const p of pts.slice(1)) {
    vi.advanceTimersByTime(gap);
    tool.move?.(ptr(...p, extra), c);
  }
  const last = pts[pts.length - 1];
  vi.advanceTimersByTime(hold);
  return { c, up: (at: [number, number] = last) => tool.up?.(ptr(...at, extra), c) };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetChoices();
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
  vectorStore();
});
afterEach(() => vi.useRealTimers());

describe('the timing', () => {
  it('has a half-second-and-a-bit hold, and a few pixels of slop', () => {
    expect(HOLD_MS_DEFAULT).toBe(600);
    expect(HOLD_SLOP_SCREEN).toBe(3);
    expect(holdMs()).toBe(600);
    setToolSettings({ quickHoldMs: 100 });
    expect(holdMs()).toBe(300);
    setToolSettings({ quickHoldMs: 99999 });
    expect(holdMs()).toBe(1200);
  });

  it('fires once after the pen has stayed put, and not before', () => {
    const fire = vi.fn();
    const w = new StillWatch(600, 3, fire);
    w.move(10, 10, 1);
    vi.advanceTimersByTime(599);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(fire).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('shaking by a pixel or two does not start the wait again', () => {
    const fire = vi.fn();
    const w = new StillWatch(600, 3, fire);
    w.move(10, 10, 1);
    vi.advanceTimersByTime(300);
    w.move(11, 10.5, 1);
    w.move(9.5, 11, 1);
    vi.advanceTimersByTime(301);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('moving on does start it again, so slow steady drawing never fires', () => {
    const fire = vi.fn();
    const w = new StillWatch(600, 3, fire);
    // 20 pixels a second: far too fast to count as still, far too slow to be a flick.
    for (let i = 0; i < 100; i++) {
      w.move(i * 0.5 * 4, 0, 1);
      vi.advanceTimersByTime(200);
    }
    expect(fire).not.toHaveBeenCalled();
  });

  it('judges the slop in screen pixels: zoomed out, the same document distance is less', () => {
    const fire = vi.fn();
    const w = new StillWatch(600, 3, fire);
    w.move(0, 0, 0.25);
    vi.advanceTimersByTime(300);
    w.move(8, 0, 0.25);
    vi.advanceTimersByTime(301);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('stop cancels it', () => {
    const fire = vi.fn();
    const w = new StillWatch(600, 3, fire);
    w.move(0, 0, 1);
    w.stop();
    vi.advanceTimersByTime(2000);
    expect(fire).not.toHaveBeenCalled();
  });
});

describe('hold to tidy, switched on', () => {
  beforeEach(() => setChoice(TIDY_CHOICE, 'on'));

  it('a rough circle held at the end becomes a circle, in the stroke\'s colour and width', () => {
    store().setUi({ color: '#ff9e6d' });
    const { up } = stroke(brushTool, circle(200, 150, 80), 700);
    up();
    const shapes = shapesNow();
    expect(shapes).toHaveLength(1);
    const s = shapes[0] as PathShape;
    expect(s.type).toBe('path');
    expect(s.fill).toBeNull();
    expect(s.stroke!.color).toBe('#ff9e6d');
    // A circle: four curves round the middle of where it was drawn.
    expect(s.paths[0].points).toHaveLength(4);
    const xs = s.paths[0].points.map((p) => p.x);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(200, -1);
  });

  it('the pencil does it too', () => {
    const { up } = stroke(pencilTool as typeof brushTool, circle(100, 100, 60), 700);
    up();
    expect((shapesNow()[0] as PathShape).type).toBe('path');
  });

  it('undo once gives the rough line back; undo twice takes the line away', () => {
    const s = store();
    const { up } = stroke(brushTool, circle(200, 150, 80), 700);
    up();
    expect(s.undoLabel()).toBe('Tidy into a shape');
    s.undo();
    expect(shapesNow()).toHaveLength(1);
    expect(shapesNow()[0].type).toBe('stroke');
    expect((shapesNow()[0] as StrokeShape).points.length).toBeGreaterThan(30);
    s.undo();
    expect(shapesNow()).toHaveLength(0);
  });

  it('a stroke held less than the hold time is left exactly as drawn', () => {
    const { up } = stroke(brushTool, circle(200, 150, 80), 500);
    up();
    expect(shapesNow()[0].type).toBe('stroke');
  });

  it('a circle drawn slowly on purpose is never tidied, however long it takes', () => {
    // A point every 300 ms and 8 pixels apart: about 27 pixels a second, close to a minute of careful drawing.
    const slow = circle(200, 150, 80, 63);
    const { up } = stroke(brushTool, slow, 100, 300);
    up();
    expect(shapesNow()[0].type).toBe('stroke');
  });

  it('even a very slow hand, 15 pixels a second, is not still', () => {
    const slower = circle(200, 150, 80, 112);
    const { up } = stroke(brushTool, slower, 100, 300);
    up();
    expect(shapesNow()[0].type).toBe('stroke');
  });

  it('a pause in the middle that then carries on does not tidy', () => {
    const c = ctx();
    const pts = circle(200, 150, 80);
    brushTool.down?.(ptr(...pts[0]), c);
    for (const p of pts.slice(1, 35)) brushTool.move?.(ptr(...p), c);
    vi.advanceTimersByTime(1000);
    for (const p of pts.slice(35)) {
      vi.advanceTimersByTime(16);
      brushTool.move?.(ptr(...p), c);
    }
    brushTool.up?.(ptr(...pts[pts.length - 1]), c);
    // The pause happened half way round: not a shape yet, so nothing was snapped and the line carried on whole.
    expect(shapesNow()[0].type).toBe('stroke');
    expect((shapesNow()[0] as StrokeShape).points.length).toBeGreaterThan(60);
  });

  it('a squiggle held for ages stays a squiggle', () => {
    const squiggle: [number, number][] = Array.from({ length: 60 }, (_, i) => [i * 5, Math.sin(i / 4) * 40 + (i % 7)]);
    const { up } = stroke(brushTool, squiggle, 2000);
    up();
    expect(shapesNow()[0].type).toBe('stroke');
  });

  it('a short tick held down is left alone', () => {
    const { up } = stroke(brushTool, [[10, 10], [20, 12], [30, 13], [40, 13], [45, 14], [48, 14]], 2000);
    up();
    expect(shapesNow()[0].type).toBe('stroke');
  });

  it('a straight line becomes a straight, level one', () => {
    const line: [number, number][] = Array.from({ length: 40 }, (_, i) => [20 + i * 6, 100 + Math.sin(i) * 1.2 + i * 0.05]);
    const { up } = stroke(brushTool, line, 700);
    up();
    const s = shapesNow()[0] as PathShape;
    expect(s.paths[0].closed).toBe(false);
    expect(s.paths[0].points).toHaveLength(2);
    expect(s.paths[0].points[0].y).toBe(s.paths[0].points[1].y);
  });

  it('dragging after it snaps changes the shape; the line you drew is still behind it', () => {
    const c = ctx();
    const pts = circle(200, 150, 80);
    const { up } = stroke(brushTool, pts, 700, 16, c);
    // The pen is held at the last point; pull it out a long way: the circle grows.
    brushTool.move?.(ptr(pts[pts.length - 1][0] + 80, pts[pts.length - 1][1], {}), c);
    up([pts[pts.length - 1][0] + 80, pts[pts.length - 1][1]]);
    const s = shapesNow()[0] as PathShape;
    const xs = s.paths[0].points.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(200);
    store().undo();
    expect((shapesNow()[0] as StrokeShape).points[0]).toMatchObject({ x: pts[0][0] });
  });

  it('Escape drops the whole stroke, as it always did', () => {
    const { c } = stroke(brushTool, circle(200, 150, 80), 700);
    brushTool.cancel?.(c);
    expect(shapesNow()).toHaveLength(0);
    vi.advanceTimersByTime(5000);
    expect(shapesNow()).toHaveLength(0);
  });

  it('is not on for a merge layer or a Shift+click line', () => {
    setLayerDrawMode(store().get().doc.layers[0].id, 'merge');
    const a = stroke(brushTool, circle(200, 150, 80), 700);
    a.up();
    expect(shapesNow().every((s) => s.type !== 'path')).toBe(true);
  });

  it('draws the wobbly line live, and shows the clean shape once it has snapped', () => {
    const c = ctx();
    const pts = circle(200, 150, 80);
    brushTool.down?.(ptr(...pts[0]), c);
    for (const p of pts.slice(1)) brushTool.move?.(ptr(...p), c);
    expect(c.requestOverlay).not.toHaveBeenCalled();
    vi.advanceTimersByTime(700);
    expect(c.requestOverlay).toHaveBeenCalled();
    brushTool.cancel?.(c);
  });
});

describe('hold to tidy, switched off', () => {
  it('never changes a line, however long the pen is held', () => {
    setChoice(TIDY_CHOICE, 'off');
    const { up } = stroke(brushTool, circle(200, 150, 80), 3000);
    up();
    expect(shapesNow()[0].type).toBe('stroke');
  });

  it('starts off: nobody has said yes, so a held circle is left as drawn (and the first time is asked after the stroke)', () => {
    const { up } = stroke(brushTool, circle(200, 150, 80), 3000);
    up();
    expect(shapesNow()[0].type).toBe('stroke');
  });
});

describe('tidy a line you already drew', () => {
  it('Tidy into a shape turns a picked circle into one, and leaves a squiggle alone', () => {
    const c = ctx();
    for (const pts of [circle(100, 100, 60), Array.from({ length: 60 }, (_, i) => [300 + i * 5, Math.sin(i / 4) * 40 + 100] as [number, number])]) {
      brushTool.down?.(ptr(...pts[0]), c);
      for (const p of pts.slice(1)) brushTool.move?.(ptr(...p), c);
      brushTool.up?.(ptr(...pts[pts.length - 1]), c);
    }
    const [circ, squig] = shapesNow();
    store().setUi({ selection: [circ.id, squig.id] });
    getCommand('arrange.tidyStroke')!.run();
    const after = shapesNow();
    expect(after[0].type).toBe('path');
    expect(after[0].id).toBe(circ.id);
    expect(after[1]).toBe(squig);
  });

  it('says so, and changes nothing, when it is not a shape', () => {
    const c = ctx();
    const pts: [number, number][] = Array.from({ length: 60 }, (_, i) => [i * 5, Math.sin(i / 4) * 40]);
    brushTool.down?.(ptr(...pts[0]), c);
    for (const p of pts.slice(1)) brushTool.move?.(ptr(...p), c);
    brushTool.up?.(ptr(...pts[pts.length - 1]), c);
    const before = shapesNow();
    store().setUi({ selection: [before[0].id] });
    getCommand('arrange.tidyStroke')!.run();
    expect(shapesNow()).toBe(before);
  });
});

describe('the clean line', () => {
  it('keeps the stroke\'s id, colour, see-through and group, and is as thick as the pen pressed', () => {
    const base = { id: 's1', type: 'stroke' as const, color: '#112233', opacity: 0.6, group: 'g', points: [{ x: 0, y: 0, p: 0.5 }, { x: 1, y: 1, p: 0.5 }], brush: { size: 10, thinning: 0, smoothing: 0, streamline: 0, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true } };
    const p = strokeToShape(base, { kind: 'ellipse', cx: 0, cy: 0, rx: 5, ry: 5, rot: 0 });
    expect(p).toMatchObject({ id: 's1', type: 'path', opacity: 0.6, group: 'g', fill: null });
    expect(p.stroke).toMatchObject({ color: '#112233', width: 10, join: 'round', cap: 'round' });
    expect(strokeToShape(base, { kind: 'rect', cx: 0, cy: 0, w: 4, h: 4, rot: 0 }).stroke!.join).toBe('miter');
    expect(tidyWidth({ size: 10, thinning: 0.5 }, [{ p: 1 }, { p: 1 }])).toBe(15);
    expect(tidyWidth({ size: 10, thinning: 0.5 }, [{ p: 0 }])).toBe(5);
    expect(tidyWidth({ size: 10, thinning: 0 }, [])).toBe(10);
  });
});

describe('the commands', () => {
  it('Hold to tidy switches on and off from the palette', () => {
    const cmd = getCommand('draw.holdToTidy')!;
    expect(cmd.checked!(store().get())).toBe(false);
    cmd.run();
    expect(cmd.checked!(store().get())).toBe(true);
    cmd.run();
    expect(cmd.checked!(store().get())).toBe(false);
  });
});
