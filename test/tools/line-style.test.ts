import { beforeEach, describe, expect, it } from 'vitest';
import type { PathShape } from '../../src/core/format';
import { getCommand } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { loadFile, saveFile } from '../../src/io/file';
import { DEFAULT_TOOL_SETTINGS, getToolSettings, setToolSettings } from '../../src/tools/settings';
import { makeShape } from '../../src/tools/shapes';
import { penShape } from '../../src/tools/pen';
import '../../src/tools/edit-commands';
import '../../src/tools/merge-mode';
import '../../src/tools/lineStyle';
import { addShapes, box, shapesNow, vectorStore } from './helpers';

const run = (id: string) => getCommand(id)!.run();
const line = (id: string): PathShape => ({ id, type: 'path', paths: [{ closed: false, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }], fill: null, stroke: { color: '#000', width: 4, join: 'round', cap: 'round' }, opacity: 1 });
const strokeOf = (id: string) => (shapesNow().find((s) => s.id === id) as PathShape).stroke!;

beforeEach(() => {
  vectorStore();
  setToolSettings({ lineDash: 'solid', lineWidth: 'even', arrowStart: 'none', arrowEnd: 'none' });
});

describe('line style commands', () => {
  it('Dashed puts a pattern on the picked line, squares its ends, and is one undo step', () => {
    addShapes(line('a'));
    store().setUi({ selection: ['a'] });
    run('stroke.dash.dashed');
    expect(strokeOf('a').dash).toEqual([3, 2]);
    expect(strokeOf('a').cap).toBe('butt');
    store().undo();
    expect(strokeOf('a').dash).toBeUndefined();
    expect(strokeOf('a').cap).toBe('round');
  });

  it('Dotted rounds the ends so the dots show, and Solid takes everything back off', () => {
    addShapes({ ...line('a'), stroke: { color: '#000', width: 4, join: 'round', cap: 'butt' } });
    store().setUi({ selection: ['a'] });
    run('stroke.dash.dotted');
    expect(strokeOf('a').cap).toBe('round');
    expect(strokeOf('a').dash![0]).toBeLessThan(0.1);
    run('stroke.dash.solid');
    expect(strokeOf('a').dash).toBeUndefined();
    expect(strokeOf('a').dashOffset).toBeUndefined();
  });

  it('with nothing picked it only sets what the next shapes get', () => {
    addShapes(line('a'));
    store().setUi({ selection: [] });
    run('stroke.dash.dashed');
    expect(getToolSettings().lineDash).toBe('dashed');
    expect(strokeOf('a').dash).toBeUndefined();
  });

  it('the arrow command adds a head, then takes it off when every picked line has it', () => {
    addShapes(line('a'), line('b'));
    store().setUi({ selection: ['a', 'b'] });
    run('stroke.arrow.end');
    expect(strokeOf('a').arrowEnd).toBe('triangle');
    expect(strokeOf('b').arrowEnd).toBe('triangle');
    run('stroke.arrow.end');
    expect(strokeOf('a').arrowEnd).toBeUndefined();
  });

  it('leaves shapes with no outline, and shapes not picked, exactly as they were', () => {
    const filled = box('f', 0, 0, 10, 10, '#f00');
    addShapes(line('a'), line('other'), filled);
    store().setUi({ selection: ['a', 'f'] });
    const before = shapesNow();
    run('stroke.width.swell');
    const after = shapesNow();
    expect(strokeOf('a').widths).toBeDefined();
    expect(after.find((s) => s.id === 'other')).toBe(before.find((s) => s.id === 'other'));
    expect(after.find((s) => s.id === 'f')).toBe(before.find((s) => s.id === 'f'));
  });

  it('has a command for every choice, in plain words', () => {
    for (const id of ['stroke.dash.solid', 'stroke.dash.dashed', 'stroke.dash.dotted', 'stroke.dash.dashdot', 'stroke.arrow.start', 'stroke.arrow.end', 'stroke.width.even', 'stroke.width.swell', 'stroke.width.pinch', 'stroke.width.taper', 'stroke.width.taperStart', 'stroke.width.brush']) {
      const c = getCommand(id);
      expect(c, id).toBeDefined();
      expect(c!.label).not.toMatch(/—/);
      expect(c!.help).toBe('line-style');
    }
  });
});

describe('new shapes wear the remembered style', () => {
  const colors = { fill: null, stroke: '#112233', line: '#112233' };
  const mod = { shift: false, alt: false };

  it('a line gets dashes and arrows', () => {
    const s = makeShape('line', { x: 0, y: 0 }, { x: 80, y: 0 }, mod, colors, { ...DEFAULT_TOOL_SETTINGS, lineDash: 'dashed', arrowEnd: 'open' })!;
    expect(s.stroke).toMatchObject({ dash: [3, 2], cap: 'butt', arrowEnd: 'open' });
  });

  it('with the defaults a shape is exactly what it always was', () => {
    const s = makeShape('line', { x: 0, y: 0 }, { x: 80, y: 0 }, mod, colors, DEFAULT_TOOL_SETTINGS)!;
    expect(s.stroke).toEqual({ color: '#112233', width: DEFAULT_TOOL_SETTINGS.shapeStroke, join: 'round', cap: 'round' });
    const r = makeShape('rect', { x: 0, y: 0 }, { x: 80, y: 50 }, mod, { fill: '#fff', stroke: '#000', line: '#000' }, DEFAULT_TOOL_SETTINGS)!;
    expect(Object.keys(r.stroke!).sort()).toEqual(['cap', 'color', 'join', 'width']);
  });

  it('an old saved set of options that lacks the new ones still works', () => {
    const old = { ...DEFAULT_TOOL_SETTINGS } as Partial<typeof DEFAULT_TOOL_SETTINGS>;
    delete old.lineDash;
    delete old.arrowEnd;
    const s = makeShape('line', { x: 0, y: 0 }, { x: 80, y: 0 }, mod, colors, old as typeof DEFAULT_TOOL_SETTINGS)!;
    expect(s.stroke!.dash).toBeUndefined();
  });

  it('the pen\'s open line takes them too', () => {
    setToolSettings({ lineDash: 'dotted', arrowStart: 'dot' });
    const sp = { closed: false, points: [{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 90, y: 0 }] };
    const s = penShape(sp, { fill: null, stroke: '#000', line: '#000' }, 3)!;
    expect(s.stroke).toMatchObject({ cap: 'round', arrowStart: 'dot' });
    expect(s.stroke!.dash).toBeDefined();
  });
});

describe('saving and opening', () => {
  it('keeps dashes, arrows and widths through a save', () => {
    const s = vectorStore();
    addShapes({ ...line('a'), stroke: { color: '#000', width: 4, join: 'round', cap: 'butt', dash: [3, 2], dashOffset: 1, arrowEnd: 'triangle', arrowSize: 5, widths: [{ at: 0, w: 0.5 }, { at: 1, w: 1 }] } });
    const back = loadFile(saveFile(s.get().doc)).doc;
    const shape = Object.values(back.drawings).flatMap((d) => (d.kind === 'vector' ? d.shapes : [])).find((x) => x.id === 'a') as PathShape;
    expect(shape.stroke).toMatchObject({ dash: [3, 2], dashOffset: 1, arrowEnd: 'triangle', arrowSize: 5, widths: [{ at: 0, w: 0.5 }, { at: 1, w: 1 }] });
  });

  it('opens an old file with none of it, and drops nonsense in a damaged one', () => {
    const s = vectorStore();
    addShapes(line('plain'), { ...line('bad'), stroke: { color: '#000', width: 4, join: 'round', cap: 'round', dash: [0, 0], arrowEnd: 'laser', widths: 'x' } as never });
    const back = loadFile(saveFile(s.get().doc)).doc;
    const all = Object.values(back.drawings).flatMap((d) => (d.kind === 'vector' ? d.shapes : [])) as PathShape[];
    expect(all.find((x) => x.id === 'plain')!.stroke).toEqual({ color: '#000', width: 4, join: 'round', cap: 'round' });
    expect(all.find((x) => x.id === 'bad')!.stroke).toEqual({ color: '#000', width: 4, join: 'round', cap: 'round' });
  });
});
