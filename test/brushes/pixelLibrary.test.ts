// The pixel side of the brush library: the starters, saving and updating pixel brushes beside vector ones, which brush is
// lit, sharing both kinds in one file, and old files and old lists still reading as they did.
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import { DEFAULT_DAB } from '../../src/dab/maths';
import { cleanSpec, sameSpec, type PixelSpec } from '../../src/dab/spec';
import {
  addShared,
  allPresets,
  brushesToText,
  matchPixelPreset,
  matchPreset,
  onSide,
  parseBrushesText,
  PIXEL_STARTERS,
  pixelPresetState,
  sanitizeList,
  sanitizePreset,
  savePixelPreset,
  savePreset,
  STARTERS,
  stepPreset,
  updatePixelPreset,
  updatePreset,
  type BrushPreset,
} from '../../src/brushes/model';
import { groupOf } from '../../src/brushes/library';
import { PIXEL_GROUPS, softPicture } from '../../src/brushes/pixelStarters';

const wide = { ...DEFAULT_BRUSH, size: 40 };
const dab = (size: number): PixelSpec => ({ kind: 'dab', dab: { ...DEFAULT_DAB, size } });
let n = 0;
const id = () => `t${++n}`;

describe('the pixel starters', () => {
  it('are built in, on the pixel side, with their own ids and names, in groups that exist', () => {
    const all = [...STARTERS, ...PIXEL_STARTERS];
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    // A name can be on both sides (Leaves, Mechanical pencil): that is how the two lists pair up. Within a side it is one brush.
    expect(new Set(STARTERS.map((s) => s.name.toLowerCase())).size).toBe(STARTERS.length);
    expect(new Set(PIXEL_STARTERS.map((s) => s.name.toLowerCase())).size).toBe(PIXEL_STARTERS.length);
    expect(new Set(PIXEL_STARTERS.map((s) => s.group))).toEqual(new Set(PIXEL_GROUPS));
    for (const s of PIXEL_STARTERS) {
      expect(s.builtin).toBe(true);
      expect(s.tool).toBe('pixel');
      expect(s.id.startsWith('starter:')).toBe(true);
      expect(s.pixel).toBeTruthy();
    }
  });

  it('are already clean: reading one back changes nothing', () => {
    for (const s of PIXEL_STARTERS) expect(sameSpec(cleanSpec(JSON.parse(JSON.stringify(s.pixel)))!, s.pixel!), s.name).toBe(true);
  });

  it('start with sharp pixels for the plain brushes, smooth for the smooth ones, and a real picture for the picture tips', () => {
    const by = (g: string) => PIXEL_STARTERS.filter((s) => s.group === g);
    for (const s of by('Pixel basics')) expect(s.pixel).toMatchObject({ kind: 'dab', dab: { aliased: true } });
    for (const s of by('Smooth edges')) expect(s.pixel).toMatchObject({ kind: 'dab', dab: { aliased: false } });
    for (const s of by('Picture tips')) {
      expect(s.pixel).toMatchObject({ kind: 'dab', dab: { tip: 'picture' } });
      if (s.pixel?.kind === 'dab') expect(s.pixel.dab.picture?.cells.some((c) => c > 0)).toBe(true);
    }
  });

  it('include the soft paint tools and the dry media as ready-made brushes', () => {
    expect(by('Soft paint').map((s) => s.pixel?.kind)).toEqual(['soft', 'soft', 'soft']);
    expect(by('Dry media').every((s) => s.pixel?.kind === 'dry')).toBe(true);
    function by(g: string) {
      return PIXEL_STARTERS.filter((s) => s.group === g);
    }
  });

  it('have a sketch and ink group: smooth edged pens, pencils and paint brushes, with the bristle and marker tips drawn the same every time', () => {
    const ink = PIXEL_STARTERS.filter((s) => s.group === 'Sketch and ink');
    expect(ink.map((s) => s.name)).toEqual(['Inking pen', 'Dry ink', 'Ink bleed', 'Colouring pen', 'Soft 6B pencil', 'Light sketch pencil', 'Felt marker', 'Dry bristle brush', 'Canvas brush']);
    for (const s of ink) expect(s.pixel).toMatchObject({ kind: 'dab', dab: { aliased: false } });
    const pictures = ink.flatMap((s) => (s.pixel?.kind === 'dab' && s.pixel.dab.picture ? [s.pixel.dab.picture] : []));
    expect(pictures).toHaveLength(2);
    for (const p of pictures) {
      expect(p.soft).toBe(true);
      // Several strengths of paint, not one flat colour, or the stroke would show no bristles or felt.
      expect(new Set(p.cells.filter((c) => c > 0)).size).toBeGreaterThan(2);
    }
    expect(softPicture(3, 1, (x) => x / 2).cells).toEqual([0, 4, 8]);
  });

  it('sit in their own groups and never show on the vector side', () => {
    const all = allPresets([]);
    expect(onSide(all, 'pixel')).toEqual([...PIXEL_STARTERS]);
    expect(onSide(all, 'vector')).toEqual([...STARTERS]);
    for (const s of PIXEL_STARTERS) expect(groupOf(s)).toBe(s.group);
  });
});

describe('saving a pixel brush', () => {
  it('adds it on the pixel side, leaving the vector brushes alone', () => {
    const r = savePixelPreset([], 'Dots', dab(3), id())!;
    expect(r.replaced).toBe(false);
    expect(r.preset).toMatchObject({ name: 'Dots', tool: 'pixel', pixel: dab(3) });
    expect(onSide(r.list, 'vector')).toHaveLength(0);
  });

  it('replaces a pixel brush of the same name, but never a vector one', () => {
    const vector = savePreset([], 'Mine', wide, id())!.list;
    const a = savePixelPreset(vector, 'Mine', dab(3), id())!;
    expect(a.replaced).toBe(false);
    expect(a.preset.name).toBe('Mine 2');
    expect(a.list).toHaveLength(2);
    const b = savePixelPreset(a.list, 'mine 2', dab(5), id())!;
    expect(b.replaced).toBe(true);
    expect(b.preset.pixel).toEqual(dab(5));
    expect(b.list).toHaveLength(2);
  });

  it('gives a name a pixel starter has a number after it', () => {
    const r = savePixelPreset([], PIXEL_STARTERS[0].name, dab(2), id())!;
    expect(r.preset.name).toBe(`${PIXEL_STARTERS[0].name} 2`);
  });

  it('updates only the pixel brush asked for, and a vector brush is never touched by it', () => {
    const list = savePixelPreset(savePreset([], 'V', wide, 'v1')!.list, 'P', dab(3), 'p1')!.list;
    expect(updatePixelPreset(list, 'p1', dab(9)).find((p) => p.id === 'p1')?.pixel).toEqual(dab(9));
    expect(updatePixelPreset(list, 'v1', dab(9)).find((p) => p.id === 'v1')?.pixel).toBeUndefined();
    expect(updatePreset(list, 'p1', { ...wide, size: 2 }).find((p) => p.id === 'p1')?.brush).toEqual(DEFAULT_BRUSH);
  });
});

describe('which pixel brush is lit', () => {
  const mine = savePixelPreset([], 'Mine', dab(7), 'p1')!.list;

  it('lights the one that matches, yours before a starter, and the picked one when it was changed', () => {
    expect(pixelPresetState(dab(7), mine, null)).toEqual({ activeId: 'p1', changed: false });
    expect(pixelPresetState(dab(8), mine, 'p1')).toEqual({ activeId: 'p1', changed: true });
    expect(matchPixelPreset(PIXEL_STARTERS[1].pixel!, [])?.id).toBe(PIXEL_STARTERS[1].id);
  });

  it('lights nothing when the tool is not a pixel brush or nothing matches', () => {
    expect(pixelPresetState(null, mine, 'p1')).toEqual({ activeId: null, changed: false });
    expect(pixelPresetState(dab(77), mine, null)).toEqual({ activeId: null, changed: false });
  });

  it('keeps the vector side from lighting a pixel brush, and the other way round', () => {
    const v: BrushPreset = { id: 'v', name: 'V', tool: 'brush', brush: wide };
    expect(matchPreset(wide, [...mine, v])?.id).toBe('v');
    expect(matchPreset(DEFAULT_BRUSH, mine)?.tool).not.toBe('pixel');
    expect(pixelPresetState(dab(7), [{ id: 'v', name: 'V', tool: 'brush', brush: wide }], 'v')).toEqual({ activeId: null, changed: false });
  });

  it('steps through one side only', () => {
    const side = onSide(allPresets(mine), 'pixel');
    expect(stepPreset(side, side[0].id, -1)?.id).toBe(side.at(-1)!.id);
    expect(stepPreset(side, side.at(-1)!.id, 1)?.tool).toBe('pixel');
  });
});

describe('reading saved brushes with pixel ones in them', () => {
  const plain = { id: 'a', name: 'Plain', brush: wide };

  it('reads a pixel brush, and still reads an old one with no tool at all as a vector brush', () => {
    const p = sanitizePreset({ id: 'x', name: 'Dots', tool: 'pixel', pixel: dab(3) }, 'x')!;
    expect(p).toMatchObject({ tool: 'pixel', pixel: dab(3), brush: DEFAULT_BRUSH });
    expect(sanitizePreset(plain, 'a')).toMatchObject({ tool: 'brush', brush: wide });
    expect(sanitizePreset(plain, 'a')?.pixel).toBeUndefined();
  });

  it('turns away a pixel brush whose settings are rubbish, and keeps the rest of the list', () => {
    const list = sanitizeList([{ name: 'Bad', tool: 'pixel', pixel: { kind: 'nope' } }, { name: 'Bad 2', tool: 'pixel' }, plain, { name: 'Dots', tool: 'pixel', pixel: dab(3) }]);
    expect(list.map((p) => p.name)).toEqual(['Plain', 'Dots']);
  });

  it('keeps pixel and vector brushes in the order saved, with names that do not clash', () => {
    const list = sanitizeList([{ name: 'Same', tool: 'pixel', pixel: dab(3) }, { name: 'same', brush: wide }]);
    expect(list.map((p) => [p.name, p.tool])).toEqual([['Same', 'pixel'], ['same 2', 'brush']]);
  });

  it('shares both kinds in one file, leaves the starters out, and reads it back the same', () => {
    const mixed: BrushPreset[] = [
      ...savePreset([], 'Mine ink', wide, 'v1')!.list,
      ...savePixelPreset([], 'Dots', dab(3), 'p1', 'Mine')!.list,
      ...PIXEL_STARTERS.slice(0, 2),
    ];
    const text = brushesToText(mixed);
    expect(JSON.parse(text).presets.map((p: { name: string; tool: string }) => [p.name, p.tool])).toEqual([['Mine ink', 'brush'], ['Dots', 'pixel']]);
    expect(JSON.parse(text).presets[1].brush).toBeUndefined();
    const r = parseBrushesText(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const back = addShared([], r.presets, id).list;
    expect(back.map((p) => [p.name, p.tool, p.group])).toEqual([['Mine ink', 'brush', undefined], ['Dots', 'pixel', 'Mine']]);
    expect(back[1].pixel).toEqual(dab(3));
  });

  it('counts a pixel brush it could not read as left out', () => {
    const r = parseBrushesText(JSON.stringify({ format: 'frameling-brushes', version: 1, presets: [{ name: 'Bad', tool: 'pixel', pixel: 3 }, { name: 'Ok', tool: 'pixel', pixel: dab(2) }] }));
    expect(r.ok && r.skipped).toBe(1);
    expect(r.ok && r.presets.map((p) => p.name)).toEqual(['Ok']);
  });
});
