import { describe, expect, it } from 'vitest';
import { defaultSettings, drawnFrames, fileSafe, frameNumber, outputSize, planExport, resolveRange, scaleChoices, slug } from '../../src/export/plan';
import { DEFAULT_SHEET, type ExportSettings } from '../../src/export/types';
import { sampleDoc } from './helpers';

const base = (over: Partial<ExportSettings> = {}): ExportSettings => ({ ...defaultSettings(sampleDoc()), ...over, sheet: { ...DEFAULT_SHEET } });

describe('export plan', () => {
  const doc = sampleDoc();

  it('resolves ranges: whole animation, a clip, this frame', () => {
    expect(resolveRange(doc, base({ range: 'all' }), 2)).toEqual({ start: 0, end: 3 });
    expect(resolveRange(doc, base({ range: 'clip', clipId: 'k2' }), 0)).toEqual({ start: 2, end: 3 });
    expect(resolveRange(doc, base({ range: 'frame' }), 1)).toEqual({ start: 1, end: 1 });
    // A still format is always the current frame, and a frame past the end is held at the last one.
    expect(resolveRange(doc, base({ format: 'png', range: 'all' }), 99)).toEqual({ start: 3, end: 3 });
  });

  it('sizes the output, evenly for video', () => {
    expect(outputSize({ ...doc, width: 15, height: 9 }, 2, false)).toEqual({ width: 30, height: 18 });
    expect(outputSize({ ...doc, width: 15, height: 9 }, 1, true)).toEqual({ width: 16, height: 10 });
  });

  it('defaults pixel art to a whole-number scale and a see-through background when there is none', () => {
    const s = defaultSettings(doc);
    expect(Number.isInteger(s.scale)).toBe(true);
    expect(s.scale).toBeGreaterThan(1);
    expect(s.transparent).toBe(true);
    expect(scaleChoices(doc).every(Number.isInteger)).toBe(true);
  });

  it('names files after the document, clip or frame', () => {
    expect(planExport(doc, base({ format: 'gif', range: 'clip', clipId: 'k1' }), 0).name).toBe('Hero Run-idle');
    expect(planExport(doc, base({ format: 'png' }), 2).name).toBe('Hero Run-frame-3');
    expect(fileSafe('a/b:c?')).toBe('abc');
    expect(slug('Hero Run!')).toBe('hero-run');
    expect(frameNumber(0, 10)).toBe('0001');
    expect(frameNumber(11999, 12000)).toBe('12000');
  });

  it('says in plain words when it cannot go ahead', () => {
    expect(planExport(doc, base({ format: 'mp4', range: 'frame' }), 0).problem).toMatch(/at least two frames/);
    expect(planExport(doc, base({ format: 'gif', range: 'clip', clipId: null }), 0).problem).toMatch(/Pick which clip/);
    expect(planExport(doc, base({ scale: 9999 }), 0).problem).toMatch(/bigger than/);
    expect(planExport(doc, base({ format: 'gif' }), 0).problem).toBeNull();
  });
});

describe('drawn frames', () => {
  const docOf = (cels: [number, number][], length: number, audio = false) => {
    const d = sampleDoc();
    return { ...d, length, audio: audio ? [{} as never] : undefined, layers: [{ ...d.layers[0], cels: cels.map(([start, len], i) => ({ id: `c${i}`, start, length: len, drawingId: 'x' })) }] };
  };
  it('says where the drawings stop when the end is empty', () => {
    expect(drawnFrames(docOf([[0, 1], [1, 1], [2, 2]], 24))).toBe(4);
  });
  it('is null when the drawings reach the end, nothing is drawn, or there are sounds', () => {
    expect(drawnFrames(docOf([[0, 24]], 24))).toBeNull();
    expect(drawnFrames(docOf([], 24))).toBeNull();
    expect(drawnFrames(docOf([[0, 2]], 24, true))).toBeNull();
  });
});
