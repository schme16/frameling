// The eraser on a vector layer: just the bit you drag over (the way it starts), or whole lines when asked.
import { beforeEach, describe, expect, it } from 'vitest';
import type { FillShape } from '../../src/core/format';
import { currentChoice, setChoice } from '../../src/core/choices';
import { getCommand } from '../../src/core/registry';
import { brushTool } from '../../src/tools/brush';
import { eraserTool, eraserWay } from '../../src/tools/eraser';
import { setLayerDrawMode } from '../../src/tools/merge-mode';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { ctx, drag, shapesNow, vectorStore } from './helpers';

beforeEach(() => {
  setChoice('eraser.vectorWay', undefined);
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS, eraserSize: 20 });
});

const longLine = () => drag(brushTool, ctx(), [[10, 100], [100, 100], [200, 100]]);

describe('eraser: just the bit', () => {
  it('is how the eraser starts', () => {
    expect(eraserWay()).toBe('bit');
  });

  it('cuts a stroke in two with one swipe across it, as one undo step', () => {
    const s = vectorStore();
    longLine();
    expect(shapesNow()).toHaveLength(1);
    drag(eraserTool, ctx(), [[100, 70], [100, 100], [100, 130]]);
    expect(shapesNow()).toHaveLength(2);
    expect(s.undoLabel()).toBe('Erase part of a line');
    s.undo();
    expect(shapesNow()).toHaveLength(1);
    expect(shapesNow()[0].type).toBe('stroke');
    s.redo();
    expect(shapesNow()).toHaveLength(2);
  });

  it('nibbles the end of a stroke away, in several moves', () => {
    vectorStore();
    longLine();
    const id = shapesNow()[0].id;
    drag(eraserTool, ctx(), [[215, 100], [190, 100], [170, 100], [150, 100]]);
    expect(shapesNow()).toHaveLength(1);
    expect(shapesNow()[0].id).toBe(id);
    expect(shapesNow()[0].type).toBe('fill');
  });

  it('does not jump over a thin line on a fast flick', () => {
    vectorStore();
    longLine();
    drag(eraserTool, ctx(), [[100, 40], [100, 160]]);
    expect(shapesNow()).toHaveLength(2);
  });

  it('rubs a stroke away entirely when dragged along all of it', () => {
    vectorStore();
    longLine();
    drag(eraserTool, ctx(), [[0, 100], [60, 100], [120, 100], [180, 100], [215, 100]]);
    expect(shapesNow()).toHaveLength(0);
  });

  it('a single click rubs a round bite out of the middle, cutting a thin stroke in two', () => {
    vectorStore();
    drag(brushTool, ctx(), [[50, 50], [150, 50]]);
    setToolSettings({ eraserSize: 20 });
    const before = shapesNow().length;
    drag(eraserTool, ctx(), [[100, 50], [100, 50]]);
    expect(before).toBe(1);
    expect(shapesNow().length).toBe(2);
  });

  it('leaves everything else on the layer alone', () => {
    vectorStore();
    longLine();
    drag(brushTool, ctx(), [[10, 250], [200, 250]]);
    const far = shapesNow()[1];
    drag(eraserTool, ctx(), [[100, 70], [100, 130]]);
    expect(shapesNow().at(-1)).toBe(far);
  });

  it('does nothing, and makes no undo step, when it touches nothing', () => {
    const s = vectorStore();
    longLine();
    drag(eraserTool, ctx(), [[100, 160], [100, 190]]);
    expect(shapesNow()).toHaveLength(1);
    expect(s.undoLabel()).not.toBe('Erase part of a line');
  });

  it('pieces are fills in the stroke colour', () => {
    const s = vectorStore();
    s.setUi({ color: '#ff9e6d' });
    longLine();
    drag(eraserTool, ctx(), [[100, 70], [100, 130]]);
    expect((shapesNow() as FillShape[]).every((f) => f.type === 'fill' && f.color === '#ff9e6d')).toBe(true);
  });

  it('merge layers still rub out area, as before', () => {
    const s = vectorStore();
    setLayerDrawMode(s.get().doc.layers[0].id, 'merge');
    longLine();
    drag(eraserTool, ctx(), [[100, 70], [100, 130]]);
    expect(shapesNow()).toHaveLength(2);
    expect(s.undoLabel()).toBe('Erase');
  });
});

describe('eraser: whole lines', () => {
  it('removes the whole stroke once the choice says so', () => {
    const s = vectorStore();
    setChoice('eraser.vectorWay', 'whole');
    longLine();
    drag(eraserTool, ctx(), [[100, 70], [100, 130]]);
    expect(shapesNow()).toHaveLength(0);
    expect(s.undoLabel()).toBe('Erase lines');
  });

  it('the palette command flips between the two ways and remembers', () => {
    vectorStore();
    const cmd = getCommand('eraser.bit')!;
    expect(cmd).toBeTruthy();
    cmd.run();
    expect(currentChoice('eraser.vectorWay')).toBe('whole');
    cmd.run();
    expect(currentChoice('eraser.vectorWay')).toBe('bit');
  });
});
