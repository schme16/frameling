// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { _resetChoicesForTests, migrateChoices, registerChoice, rememberedChoice, setChoice, setChoiceAsker } from '../../src/core/choices';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { Doc, DocPalette } from '../../src/core/format';
import { registerPanel } from '../../src/core/registry';
import { DEFAULT_SHEET, type ExportSettings } from '../../src/export/types';
import { applyWorkspace, builtinWorkspaces, currentWorkspace, inPixelWorkspace, PIXEL_TOOLS, resetDock, saveWorkspace, stripTools } from '../../src/ui/dock';
import { BAR_SIZES, hasMirror, hasPerfect, hasShape, paletteIndexOf, sizeSettingFor } from '../../src/pixel/bar';
import { framesDue, nextPreviewFrame, previewBase, previewFrames, previewScale, setPreview, previewSettings } from '../../src/pixel/preview';
import { isPixelDoc, madeOnPurpose, FOLLOW_CHOICE, pixelExportStart, pixelStartTool, watchPixelDocs, watchPixelTool } from '../../src/pixel/workspace';

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
    registerChoice({
      id: FOLLOW_CHOICE,
      title: 't',
      question: 'q',
      category: 'Workspace',
      default: 'always',
      dismiss: 'later',
      options: [{ value: 'always', label: 'a' }, { value: 'later', label: 'n', once: true }, { value: 'never', label: 'b' }],
    });
  };

  function watch(doc: Doc) {
    const s = fakeStore(doc);
    const seen = { toPixel: 0, toDraw: 0, keys: 0 };
    const off = watchPixelDocs(s, () => void seen.toPixel++, () => void seen.keys++, () => void seen.toDraw++);
    return { s, seen, off };
  }

  it('new pixel art in Draw switches to Pixel once the answer is Always', () => {
    reRegister();
    applyWorkspace('draw');
    setChoice(FOLLOW_CHOICE, 'always');
    const { s, seen, off } = watch(newDoc());
    s.load(pixelDoc());
    expect(seen.toPixel).toBe(1);
    expect(seen.keys).toBe(1);
    off();
  });

  it('opening pixel art in Draw switches without a question once Always is remembered, never when Never', () => {
    reRegister();
    applyWorkspace('draw');
    const { s, seen, off } = watch(newDoc());
    setChoice(FOLLOW_CHOICE, 'never');
    s.load(pixelDoc());
    expect(seen.toPixel).toBe(0);
    setChoice(FOLLOW_CHOICE, 'always');
    s.load(pixelDoc());
    expect(seen.toPixel).toBe(1);
    off();
  });

  it('opening a drawing in Pixel goes back to Draw, with the same answer', () => {
    reRegister();
    applyWorkspace('pixel');
    const { s, seen, off } = watch(pixelDoc());
    setChoice(FOLLOW_CHOICE, 'never');
    s.load(newDoc());
    expect(seen.toDraw).toBe(0);
    setChoice(FOLLOW_CHOICE, 'always');
    s.load(newDoc());
    expect(seen.toDraw).toBe(1);
    // Pixel art in Pixel, and a drawing in Draw: nothing to do.
    s.load(pixelDoc());
    applyWorkspace('draw');
    s.load(newDoc());
    expect(seen.toDraw).toBe(1);
    expect(seen.toPixel).toBe(0);
    off();
  });

  it('leaves the Animate workspace alone, for pixel art and for drawings', () => {
    reRegister();
    setChoice(FOLLOW_CHOICE, 'always');
    applyWorkspace('animate');
    const { s, seen, off } = watch(newDoc());
    s.load(pixelDoc());
    s.load(newDoc());
    expect(seen.toPixel + seen.toDraw).toBe(0);
    off();
  });

  it('asks the first time when there is a way to ask, and Not now is not remembered', async () => {
    reRegister();
    applyWorkspace('draw');
    const asked: string[] = [];
    let answer: { value: string; remember: boolean } | null = { value: 'later', remember: true };
    setChoiceAsker(async (def) => (asked.push(def.id), answer));
    const { s, seen, off } = watch(newDoc());
    s.load(pixelDoc());
    await Promise.resolve();
    await Promise.resolve();
    expect(asked).toEqual([FOLLOW_CHOICE]);
    expect(seen.toPixel).toBe(0);
    expect(rememberedChoice(FOLLOW_CHOICE)).toBeUndefined();
    // Closing the question counts as Not now too.
    answer = null;
    s.load(pixelDoc());
    await new Promise((r) => setTimeout(r, 0));
    expect(asked.length).toBe(2);
    expect(seen.toPixel).toBe(0);
    // Always is remembered, switches, and is not asked again.
    answer = { value: 'always', remember: true };
    s.load(pixelDoc());
    await new Promise((r) => setTimeout(r, 0));
    expect(seen.toPixel).toBe(1);
    expect(rememberedChoice(FOLLOW_CHOICE)).toBe('always');
    s.load(pixelDoc());
    expect(asked.length).toBe(3);
    expect(seen.toPixel).toBe(2);
    off();
  });

  it('a lesson page switches without asking, whatever the answer', () => {
    reRegister();
    applyWorkspace('pixel');
    setChoice(FOLLOW_CHOICE, 'never');
    const { s, seen, off } = watch(pixelDoc());
    s.load(madeOnPurpose(newDoc()));
    expect(seen.toDraw).toBe(1);
    off();
  });

  it('does not treat the document already there as opening', () => {
    reRegister();
    applyWorkspace('draw');
    setChoice(FOLLOW_CHOICE, 'always');
    const { s, seen, off } = watch(pixelDoc());
    s.load(s.get().doc);
    expect(seen.toPixel).toBe(0);
    off();
  });

  it('folds the two older answers into the one: any keep-my-layout is Never, otherwise a switch is Always', () => {
    const run = (old: Record<string, string>) => {
      _resetChoicesForTests();
      for (const [k, v] of Object.entries(old)) setChoice(k, v);
      migrateChoices(FOLLOW_CHOICE, ['workspace.pixelDocs', 'workspace.vectorDocs'], (a) => (a.includes('stay') ? 'never' : a.includes('switch') ? 'always' : undefined));
      return [rememberedChoice(FOLLOW_CHOICE), rememberedChoice('workspace.pixelDocs'), rememberedChoice('workspace.vectorDocs')];
    };
    expect(run({ 'workspace.pixelDocs': 'stay' })).toEqual(['never', undefined, undefined]);
    expect(run({ 'workspace.pixelDocs': 'switch', 'workspace.vectorDocs': 'stay' })).toEqual(['never', undefined, undefined]);
    expect(run({ 'workspace.vectorDocs': 'switch' })).toEqual(['always', undefined, undefined]);
    expect(run({})).toEqual([undefined, undefined, undefined]);
    // An answer to the new question wins.
    _resetChoicesForTests();
    setChoice(FOLLOW_CHOICE, 'always');
    setChoice('workspace.pixelDocs', 'stay');
    migrateChoices(FOLLOW_CHOICE, ['workspace.pixelDocs'], () => 'never');
    expect(rememberedChoice(FOLLOW_CHOICE)).toBe('always');
    expect(rememberedChoice('workspace.pixelDocs')).toBeUndefined();
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
    expect(sizeSettingFor('pencil')).toBe('pixelBrushSize');
    expect(sizeSettingFor('spray')).toBe('spraySize');
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

describe('the tool a pixel sprite starts on', () => {
  it('is the Pencil unless the tool in hand is already in the rail', () => {
    expect(pixelStartTool('brush', 'pixel')).toBe('pencil');
    expect(pixelStartTool('select', null)).toBe('pencil');
    expect(pixelStartTool('shade', 'pixel')).toBeNull();
    expect(pixelStartTool('eraser', 'pixel')).toBeNull();
    expect(pixelStartTool('brush', 'tilemap')).toBeNull();
  });

  it('is picked when the Pixel workspace is entered or a sprite opens in it, and only then', () => {
    const subs = new Set<() => void>();
    let cur = pixelDoc();
    let tool = 'brush';
    const s = {
      get: () => ({ doc: cur, ui: { tool, activeLayerId: cur.layers[0].id } }),
      subscribe: (fn: () => void) => (subs.add(fn), () => void subs.delete(fn)),
      setUi: (p: { tool: string }) => void (tool = p.tool),
    };
    const fire = () => subs.forEach((f) => f());
    resetDock();
    const off = watchPixelTool(s);
    expect(tool).toBe('brush');
    applyWorkspace('pixel');
    fire();
    expect(tool).toBe('pencil');
    // Their own pick stays on later changes.
    tool = 'brush';
    fire();
    expect(tool).toBe('brush');
    // A new sprite in the same workspace starts on it again; a drawing does not.
    cur = newDoc();
    fire();
    expect(tool).toBe('brush');
    cur = pixelDoc();
    fire();
    expect(tool).toBe('pencil');
    off();
  });
});
