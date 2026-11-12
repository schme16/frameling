// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { _resetChoicesForTests, registerChoice, setChoice } from '../../src/core/choices';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { Doc, DocPalette } from '../../src/core/format';
import { registerPanel } from '../../src/core/registry';
import { DEFAULT_SHEET, type ExportSettings } from '../../src/export/types';
import { applyWorkspace, builtinWorkspaces, currentWorkspace, inPixelWorkspace, PIXEL_TOOLS, resetDock, saveWorkspace, stripTools } from '../../src/ui/dock';
import { BAR_SIZES, hasMirror, hasPerfect, hasShape, paletteIndexOf, sizeSettingFor } from '../../src/pixel/bar';
import { framesDue, nextPreviewFrame, previewBase, previewFrames, previewScale, setPreview, previewSettings } from '../../src/pixel/preview';
import { isPixelDoc, PIXEL_DOC_CHOICE, pixelExportStart, watchPixelDocs } from '../../src/pixel/workspace';

const Nothing = () => null;
beforeAll(() => {
  for (const [id, zone, order] of [
    ['timeline', 'bottom', 10],
    ['tool-options', 'right', 10],
    ['colors', 'right', 20],
    ['palette', 'right', 25],
    ['rig', 'right', 38],
    ['lipsync', 'right', 70],
    ['preview', 'right', 80],
    ['help', 'right', 90],
  ] as const)
    registerPanel({ id, title: id, icon: 'help', component: Nothing, zone, order });
});
beforeEach(() => resetDock());

const pixelDoc = (): Doc => newDoc({ width: 64, height: 32, pixel: { pixelSize: 8 }, length: 6 });

describe('the Pixel workspace layout', () => {
  it('puts a big palette on the left, the Preview first on the right, and tucks away what pixel art never needs', () => {
    const pixel = builtinWorkspaces().find((w) => w.id === 'pixel')!;
    const z = pixel.layout.zones;
    expect(z.left.tabs).toEqual(['palette', 'colors']);
    expect(z.left.active).toBe('palette');
    expect(z.left.size).toBeGreaterThanOrEqual(280);
    expect(z.right.tabs[0]).toBe('preview');
    expect(z.right.active).toBe('preview');
    expect(z.right.tabs).not.toContain('rig');
    expect(pixel.layout.hidden).toEqual(expect.arrayContaining(['rig', 'lipsync']));
    expect(pixel.pixel).toBe(true);
    expect(pixel.tools?.pixel).toEqual([...PIXEL_TOOLS]);
  });

  it('leaves Draw and Animate as they were', () => {
    const [draw, animate] = builtinWorkspaces();
    expect(draw.pixel).toBeUndefined();
    expect(draw.tools).toBeUndefined();
    expect(draw.layout.hidden).toEqual([]);
    expect(animate.layout.zones.right.tabs).toContain('rig');
  });

  it('knows when it is the current one, and a layout saved from it stays a pixel one', () => {
    expect(inPixelWorkspace()).toBe(false);
    applyWorkspace('pixel');
    expect(inPixelWorkspace()).toBe(true);
    const mine = saveWorkspace('My sprites')!;
    expect(mine.pixel).toBe(true);
    expect(mine.tools?.pixel).toContain('shade');
    expect(currentWorkspace()?.id).toBe(mine.id);
    expect(inPixelWorkspace()).toBe(true);
    applyWorkspace('draw');
    expect(saveWorkspace('Plain')!.pixel).toBeUndefined();
  });
});

describe('the tool strip in a workspace', () => {
  const tools = ['brush', 'pencil', 'shade', 'bone', 'eraser', 'pixel-select', 'select', 'zoom'].map((id) => ({ id }));
  const ws = { tools: { pixel: ['pencil', 'brush', 'eraser', 'shade', 'pixel-select', 'zoom', 'not-registered'] } };

  it('narrows and orders the tools on the kinds the workspace lists', () => {
    expect(stripTools(tools, 'pixel', ws).map((t) => t.id)).toEqual(['pencil', 'brush', 'eraser', 'shade', 'pixel-select', 'zoom']);
  });
  it('shows everything usable on other kinds, with no layer, or with no list', () => {
    expect(stripTools(tools, 'vector', ws)).toBe(tools);
    expect(stripTools(tools, null, ws)).toBe(tools);
    expect(stripTools(tools, 'pixel', undefined)).toBe(tools);
    expect(stripTools(tools, 'pixel', {})).toBe(tools);
  });
  it('hides rig tools in the real Pixel workspace', () => {
    const pixel = builtinWorkspaces().find((w) => w.id === 'pixel')!;
    expect(stripTools(tools, 'pixel', pixel).map((t) => t.id)).not.toContain('bone');
  });
});

describe('opening pixel art', () => {
  it('tells pixel art from vector drawings', () => {
    expect(isPixelDoc(pixelDoc())).toBe(true);
    expect(isPixelDoc(newDoc())).toBe(false);
    const mixed = pixelDoc();
    mixed.layers.push(newVectorLayer('Lines'));
    expect(isPixelDoc(mixed)).toBe(false);
    const ref = pixelDoc();
    ref.layers.push({ ...newVectorLayer('Sketch'), reference: true });
    expect(isPixelDoc(ref)).toBe(true);
  });

  function fakeStore(doc: Doc) {
    let cur = doc;
    const subs = new Set<() => void>();
    return {
      get: () => ({ doc: cur }),
      subscribe: (fn: () => void) => (subs.add(fn), () => void subs.delete(fn)),
      load(d: Doc) {
        cur = d;
        for (const f of subs) f();
      },
    };
  }

  const reRegister = () => {
    _resetChoicesForTests();
    registerChoice({ id: PIXEL_DOC_CHOICE, title: 't', question: 'q', category: 'Workspace', default: 'switch', options: [{ value: 'switch', label: 'a' }, { value: 'stay', label: 'b' }] });
  };

  it('offers the Pixel workspace when pixel art opens, not for the document already there or for vector', () => {
    reRegister();
    const s = fakeStore(pixelDoc());
    let switched = 0;
    const off = watchPixelDocs(s, () => switched++);
    s.load(s.get().doc);
    expect(switched).toBe(0);
    s.load(newDoc());
    expect(switched).toBe(0);
    s.load(pixelDoc());
    expect(switched).toBe(1);
    off();
  });

  it('stays put when you are already in a pixel workspace, or said to keep your layout', () => {
    reRegister();
    const s = fakeStore(newDoc());
    let switched = 0;
    const off = watchPixelDocs(s, () => switched++);
    applyWorkspace('pixel');
    s.load(pixelDoc());
    expect(switched).toBe(0);
    applyWorkspace('draw');
    setChoice(PIXEL_DOC_CHOICE, 'stay');
    s.load(pixelDoc());
    expect(switched).toBe(0);
    off();
  });
});

describe('export in the Pixel workspace', () => {
  const base: ExportSettings = { format: 'mp4', range: 'clip', clipId: 'c1', scale: 2, transparent: true, loop: true, dither: false, sheet: { ...DEFAULT_SHEET } };
  it('starts on a sprite sheet at art size the first time only', () => {
    const first = pixelExportStart('doc-a', base, 1 / 8, true);
    expect(first).toMatchObject({ format: 'sheet', scale: 1 / 8, range: 'all', clipId: null });
    expect(pixelExportStart('doc-a', base, 1 / 8, true)).toBe(base);
  });
  it('leaves other workspaces and drawings without an art size alone', () => {
    expect(pixelExportStart('doc-b', base, 1 / 8, false)).toBe(base);
    expect(pixelExportStart('doc-c', base, null, true)).toBe(base);
  });
});

describe('the Preview', () => {
  it('is real size for pixel art: one art pixel per screen pixel', () => {
    expect(previewBase(pixelDoc())).toBe(1 / 8);
    expect(previewBase(newDoc())).toBe(1);
  });

  it('plays the whole animation, or the clip the playhead is in', () => {
    const d = pixelDoc();
    d.clips = [{ id: 'c', name: 'run', start: 2, end: 4, loop: true }];
    expect(previewFrames(d, 'all', 3)).toEqual({ start: 0, end: 5, clip: null });
    expect(previewFrames(d, 'clip', 3)).toMatchObject({ start: 2, end: 4, clip: 'run' });
    expect(previewFrames(d, 'clip', 0)).toEqual({ start: 0, end: 5, clip: null });
  });

  it('steps, loops, or stops after one play-through', () => {
    const r = { start: 2, end: 4 };
    expect(nextPreviewFrame(2, r, true)).toBe(3);
    expect(nextPreviewFrame(4, r, true)).toBe(2);
    expect(nextPreviewFrame(4, r, false)).toBeNull();
    expect(nextPreviewFrame(9, r, true)).toBe(2);
  });

  it('sizes 1x, 2x and 3x exactly, and Fit in whole steps', () => {
    expect(previewScale(3, 32, 32, 10, 10)).toBe(3);
    expect(previewScale('fit', 32, 32, 200, 150)).toBe(4);
    expect(previewScale('fit', 32, 32, 40, 40)).toBe(1);
    expect(previewScale('fit', 1280, 720, 256, 256)).toBe(0.2);
  });

  it('keeps time at the frame rate and never races to catch up', () => {
    expect(framesDue(50, 12)).toEqual({ steps: 0, rest: 50 });
    const a = framesDue(100, 12);
    expect(a.steps).toBe(1);
    expect(a.rest).toBeCloseTo(100 - 1000 / 12);
    expect(framesDue(60_000, 12)).toEqual({ steps: 12, rest: 0 });
  });

  it('remembers its settings and ignores nonsense', () => {
    setPreview({ zoom: 3, range: 'clip' });
    expect(previewSettings.get()).toMatchObject({ zoom: 3, range: 'clip' });
    setPreview({ zoom: 7 as unknown as 3 });
    expect(previewSettings.get().zoom).toBe('fit');
    expect(JSON.parse(localStorage.getItem('frameling.preview')!).range).toBe('clip');
  });
});

describe('the pixel bar', () => {
  it('knows which size each tool uses', () => {
    expect(BAR_SIZES).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(sizeSettingFor('brush')).toBe('pixelBrushSize');
    expect(sizeSettingFor('shade')).toBe('pixelBrushSize');
    expect(sizeSettingFor('eraser')).toBe('eraserPixelSize');
    expect(sizeSettingFor('dither')).toBe('ditherSize');
    expect(sizeSettingFor('pencil')).toBe('pencil');
    expect(sizeSettingFor('fill')).toBeNull();
    expect(hasShape('fill')).toBe(false);
    expect(hasPerfect('pencil')).toBe(true);
    expect(hasMirror('rect')).toBe(true);
    expect(hasMirror('pixel-select')).toBe(false);
  });

  it('reads the palette colour being painted with, or the one it snaps to', () => {
    const p: DocPalette = { name: 'T', colors: ['#000000', '#ff0000', '#00ff00'] };
    expect(paletteIndexOf(p, '#ff0000')).toEqual({ index: 1, exact: true });
    expect(paletteIndexOf(p, '#ff0000ff')).toEqual({ index: 1, exact: true });
    expect(paletteIndexOf(p, '#10ee10')).toEqual({ index: 2, exact: false });
    expect(paletteIndexOf({ name: 'E', colors: [] }, '#ff0000')).toBeNull();
    expect(paletteIndexOf(p, 'nope')).toBeNull();
  });
});
