// @vitest-environment jsdom
// The pen, pencil and brush snapping their start and end: onto the end of another line, a path's point, a guide, the
// grid and the page; never the middle of a line; Ctrl, the switch and the tick turn it off; the pen's points too.
import { beforeEach, describe, expect, it } from 'vitest';
import '../../src/canvas';
import '../../src/tools';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import type { PathShape, StrokeShape } from '../../src/core/format';
import { store } from '../../src/core/store';
import { getSnapLines, getSnapMark, snappedKinds } from '../../src/canvas/snap';
import { resetSnapPicks, setSnapDraw, setSnapDrawDistance, setSnapOn, setSnapPick } from '../../src/canvas/snapOps';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { brushTool } from '../../src/tools/brush';
import { hoverSpot, forgetHover } from '../../src/tools/endSnap';
import { pencilTool } from '../../src/tools/pencil';
import { penTool } from '../../src/tools/pen';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { VectorStroke } from '../../src/tools/vectorStroke';
import { addShapes, box, ctx, drag, ptr, shapesNow, vectorStore } from './helpers';

const stroke = (id: string, pts: [number, number][]): StrokeShape => ({ id, type: 'stroke', points: pts.map(([x, y]) => ({ x, y, p: 0.5 })), brush: { ...DEFAULT_BRUSH }, color: '#000000', opacity: 1 });

/** A hand-made line of points from a to b, a point every 5 pixels. */
function line(a: [number, number], b: [number, number]): [number, number][] {
  const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as [number, number]);
}

const last = () => shapesNow().at(-1) as StrokeShape;
const ends = (s: StrokeShape) => ({ first: s.points[0], last: s.points[s.points.length - 1] });

beforeEach(() => {
  vectorStore();
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
  resetSnapPicks();
  setViewSettings({ snap: true, snapDraw: true, guides: true, grid: 'off', gridSize: 32 });
  store().setUi({ tool: 'brush', brush: { ...DEFAULT_BRUSH }, selection: [] });
  forgetHover();
});

describe('a line meeting the end of another', () => {
  beforeEach(() => addShapes(stroke('old', [[100, 100], [150, 100], [260, 130]])));

  it('ends exactly on the end of the other line when it stops a few pixels short', () => {
    drag(brushTool, ctx(), line([20, 220], [256, 134]));
    expect(ends(last()).last).toMatchObject({ x: 260, y: 130 });
  });
  it('starts exactly on the end of the other line when it begins a few pixels off', () => {
    drag(brushTool, ctx(), line([97, 103], [40, 220]));
    expect(ends(last()).first).toMatchObject({ x: 100, y: 100 });
  });
  it('leaves the end alone when it is out of reach', () => {
    drag(brushTool, ctx(), line([20, 220], [260, 112]));
    expect(ends(last()).last).toMatchObject({ x: 260, y: 112 });
  });
  it('the reach follows the zoom: close on screen is close, not close on the page', () => {
    drag(brushTool, ctx(4), line([20, 220], [258.5, 131.5]));
    // 2.1 page pixels is 8.5 screen pixels at 400%, past the reach of 8.
    expect(ends(last()).last).toMatchObject({ x: 258.5, y: 131.5 });
    drag(brushTool, ctx(0.5), line([20, 220], [272, 138]));
    // 14.4 page pixels is 7.2 screen pixels at 50%.
    expect(ends(last()).last).toMatchObject({ x: 260, y: 130 });
  });
  it('never moves the middle of the line, even right beside something', () => {
    // Passes within 3 pixels of the old line, the page's centre lines and a guide.
    store().update('guides', (d) => void (d.guides = [{ id: 'g1', axis: 'x', at: 121 }]));
    const pts = line([121 + 2, 60], [121 + 2, 148]).concat(line([123, 148], [60, 250]).slice(1));
    drag(brushTool, ctx(), pts);
    const got = last().points;
    for (let i = 1; i < got.length - 1; i++) expect(got[i]).toMatchObject({ x: pts[i][0], y: pts[i][1] });
  });
  it('points a path offers count too, not only line ends', () => {
    addShapes(box('r', 300, 200, 40, 40));
    drag(brushTool, ctx(), line([380, 280], [343, 243]));
    expect(ends(last()).last).toMatchObject({ x: 340, y: 240 });
  });
  it('the pencil does the same, and so does its clean line', () => {
    store().setUi({ tool: 'pencil' });
    drag(pencilTool, ctx(), line([20, 220], [256, 134]));
    expect(ends(last()).last).toMatchObject({ x: 260, y: 130 });
    setToolSettings({ ...DEFAULT_TOOL_SETTINGS, pencilClean: true });
    drag(pencilTool, ctx(), line([20, 250], [256, 134]));
    const p = shapesNow().at(-1) as PathShape;
    expect(p.paths[0].points.at(-1)).toMatchObject({ x: 260, y: 130 });
  });
  it('a line closing on its own start lands exactly on it, but a short dab never snaps to itself', () => {
    const ring: [number, number][] = Array.from({ length: 41 }, (_, i) => [300 + 60 * Math.cos((i / 40) * Math.PI * 2), 200 + 60 * Math.sin((i / 40) * Math.PI * 2)] as [number, number]);
    ring[40] = [ring[0][0] + 4, ring[0][1] + 3];
    drag(brushTool, ctx(), ring);
    const s = ends(last());
    expect(s.last).toMatchObject({ x: s.first.x, y: s.first.y });
    drag(brushTool, ctx(), [[50, 50], [52, 52], [54, 52]]);
    expect(ends(last()).last).toMatchObject({ x: 54, y: 52 });
  });
});

describe('guides, the grid and the page', () => {
  it('a guide pulls the start and end its own way', () => {
    store().update('guides', (d) => void (d.guides = [{ id: 'g1', axis: 'x', at: 250 }, { id: 'g2', axis: 'y', at: 90 }]));
    drag(brushTool, ctx(), line([60, 40], [247, 93]));
    expect(ends(last()).last).toMatchObject({ x: 250, y: 90 });
  });
  it('the square grid pulls only while it shows', () => {
    setViewSettings({ grid: 'square', gridSize: 32 });
    drag(brushTool, ctx(), line([20, 20], [66, 125]));
    expect(ends(last()).last).toMatchObject({ x: 64, y: 128 });
    setViewSettings({ grid: 'off' });
    drag(brushTool, ctx(), line([320, 20], [346, 85]));
    expect(ends(last()).last).toMatchObject({ x: 346, y: 85 });
  });
  it('the page edge pulls a line to the edge', () => {
    drag(brushTool, ctx(), line([100, 60], [398, 60]));
    expect(ends(last()).last.x).toBe(400);
  });
  it('a ticked-off target is left out, and the end falls back to the rest', () => {
    addShapes(stroke('old', [[100, 100], [260, 130]]));
    store().update('guides', (d) => void (d.guides = [{ id: 'g1', axis: 'x', at: 263 }]));
    drag(brushTool, ctx(), line([20, 220], [258, 132]));
    expect(ends(last()).last).toMatchObject({ x: 260, y: 130 });
    setSnapPick('vector', 'points', false);
    drag(brushTool, ctx(), line([20, 250], [258, 132]));
    expect(ends(last()).last).toMatchObject({ x: 263, y: 132 });
  });
  it('other shapes and equal gaps never pull a stroke, whatever their ticks say', () => {
    addShapes(box('r', 100, 100, 100, 100));
    setSnapPick('vector', 'points', false);
    // Within reach of the box's middle line at x = 150 and its edge at y = 200, but not of a corner point.
    drag(brushTool, ctx(), line([300, 280], [152, 204]));
    expect(ends(last()).last).toMatchObject({ x: 152, y: 204 });
  });
});

describe('turning it off', () => {
  beforeEach(() => addShapes(stroke('old', [[100, 100], [260, 130]])));
  const endsAt = () => ends(last()).last;
  it('Ctrl held while drawing skips it', () => {
    drag(brushTool, ctx(), line([20, 220], [256, 134]), { mod: true });
    expect(endsAt()).toMatchObject({ x: 256, y: 134 });
  });
  it('the tick for drawing tools stops it', () => {
    setSnapDraw(false);
    drag(brushTool, ctx(), line([20, 220], [256, 134]));
    expect(endsAt()).toMatchObject({ x: 256, y: 134 });
  });
  it('the master switch stops it', () => {
    setSnapOn(false);
    drag(brushTool, ctx(), line([20, 220], [256, 134]));
    expect(endsAt()).toMatchObject({ x: 256, y: 134 });
  });
  it('a smaller pull reaches less far', () => {
    setSnapDrawDistance(2);
    drag(brushTool, ctx(), line([20, 220], [256, 134]));
    expect(endsAt()).toMatchObject({ x: 256, y: 134 });
  });
  it('a bigger pull reaches further than the usual one does', () => {
    drag(brushTool, ctx(), line([20, 220], [252, 138]));
    expect(endsAt()).toMatchObject({ x: 252, y: 138 });
  });
  it('a bigger pull reaches further', () => {
    setSnapDrawDistance(12);
    drag(brushTool, ctx(), line([20, 220], [252, 138]));
    expect(endsAt()).toMatchObject({ x: 260, y: 130 });
  });
  it('does not look at the drawing at all when it is off', () => {
    setSnapDraw(false);
    const s = new VectorStroke({ ...DEFAULT_BRUSH }, '#000');
    s.add(ptr(1, 1), 1);
    s.add(ptr(100, 100), 1);
    expect(getSnapMark()).toBeNull();
    expect(snappedKinds()).toEqual([]);
  });
});

describe('what you see while you draw', () => {
  beforeEach(() => addShapes(stroke('old', [[100, 100], [260, 130]])));
  it('the line shows ending on the point while it is in reach, and goes back to the hand when it leaves', () => {
    const s = new VectorStroke({ ...DEFAULT_BRUSH }, '#000');
    s.add(ptr(20, 220), 1);
    s.add(ptr(100, 200), 1);
    expect(s.shape()?.points.at(-1)).toMatchObject({ x: 100, y: 200 });
    s.add(ptr(256, 134), 1);
    expect(s.shape()?.points.at(-1)).toMatchObject({ x: 260, y: 130 });
    expect(getSnapMark()).toEqual({ x: 260, y: 130 });
    expect(snappedKinds()).toContain('points');
    s.add(ptr(150, 200), 1);
    expect(s.shape()?.points.at(-1)).toMatchObject({ x: 150, y: 200 });
    expect(getSnapMark()).toBeNull();
    s.stop();
  });
  it('a guide lights up but does not move the line while you draw, and the line lands on it when you let go', () => {
    store().update('guides', (d) => void (d.guides = [{ id: 'g1', axis: 'x', at: 330 }]));
    const s = new VectorStroke({ ...DEFAULT_BRUSH }, '#000');
    s.add(ptr(20, 220), 1);
    s.add(ptr(326, 150), 1);
    expect(s.shape()?.points.at(-1)).toMatchObject({ x: 326, y: 150 });
    expect(snappedKinds()).toContain('guides');
    s.stop();
    drag(brushTool, ctx(), line([20, 220], [326, 150]));
    expect(ends(last()).last).toMatchObject({ x: 330, y: 150 });
  });
  it('the grid never shakes the line as it goes: nothing but the start and the end is ever moved', () => {
    setViewSettings({ grid: 'square', gridSize: 32 });
    const pts = line([20, 20], [300, 250]);
    drag(brushTool, ctx(), pts);
    const got = last().points;
    for (let i = 1; i < got.length - 1; i++) expect(got[i]).toMatchObject({ x: pts[i][0], y: pts[i][1] });
  });
  it('the marks go when the stroke ends', () => {
    drag(brushTool, ctx(), line([20, 220], [256, 134]));
    expect(getSnapMark()).toBeNull();
    expect(getSnapLines()).toEqual([]);
  });
  it('hovering shows where a stroke would start', () => {
    brushTool.hover?.(ptr(97, 103), ctx());
    expect(hoverSpot()).toEqual({ x: 100, y: 100 });
    expect(getSnapMark()).toEqual({ x: 100, y: 100 });
    brushTool.hover?.(ptr(330, 200), ctx());
    expect(hoverSpot()).toBeNull();
    brushTool.hover?.(ptr(97, 103), ctx());
    brushTool.leave?.(ctx());
    expect(hoverSpot()).toBeNull();
    expect(getSnapMark()).toBeNull();
  });
  it('hovering with Ctrl held shows nothing', () => {
    brushTool.hover?.(ptr(97, 103, { mod: true }), ctx());
    expect(hoverSpot()).toBeNull();
  });
});

describe('the pen', () => {
  it('puts a new point exactly on the end of a line when it clicks close to it', () => {
    addShapes(stroke('old', [[100, 100], [260, 130]]));
    store().setUi({ tool: 'pen' });
    const c = ctx();
    penTool.down?.(ptr(60, 60), c);
    penTool.up?.(ptr(60, 60), c);
    penTool.down?.(ptr(257, 133), c);
    penTool.up?.(ptr(257, 133), c);
    penTool.onKey?.({ key: 'Enter' } as KeyboardEvent, c);
    const shape = shapesNow().at(-1) as PathShape;
    expect(shape.paths[0].points.at(-1)).toMatchObject({ x: 260, y: 130 });
  });
});
