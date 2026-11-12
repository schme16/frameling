import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing } from '../../src/core/doc';
import type { Doc, PixelDrawing } from '../../src/core/format';
import { onBlocked, resetStore, store } from '../../src/core/store';
import { loadFile, saveFile } from '../../src/io/file';
import { setChoice } from '../../src/core/choices';
import { changePaletteColor, setDocPalette } from '../../src/pixel/commands';
import { docPalette } from '../../src/pixel/palette';
import { activeId, artboardDoc, artboardsOf, findArtboard, switchArtboard } from '../../src/artboards/model';
import { aliasId, listDifferences, makeVariation, resetDifference, settleVariations } from '../../src/artboards/variations';
import { changesBetween, migrateLegacy, paletteRenames, recolourDrawing, resolvePalette } from '../../src/artboards/paletteOverride';

const doc = () => store().get().doc;
const update = (label: string, fn: (d: Doc) => void) => store().update(label, (d) => fn(d as Doc));
const open = (id: string) => update('Go', (d) => void switchArtboard(d, id));
const root = () => artboardsOf(doc())[0].id;
const px = (id: string, at = 0) => [...(doc().drawings[id] as PixelDrawing).pixels.slice(at * 4, at * 4 + 4)];
const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];
const BLUE = [0, 0, 255, 255];
const YELLOW = [255, 255, 0, 255];

let pid = '';
let blocked: string[] = [];

/** One pixel drawing: pixel 0 red, pixel 1 green, pixel 2 red again, pixel 3 clear. A palette of red, green, white. */
beforeEach(() => {
  blocked = [];
  onBlocked((m) => blocked.push(m));
  setChoice('palette.recolour', 'recolour');
  const d0 = newDoc({ name: 'Px', width: 4, height: 1, length: 2, pixel: { pixelSize: 1 } });
  const p = newPixelDrawing(4, 1);
  p.pixels.set([...RED, ...GREEN, ...RED], 0);
  pid = p.id;
  d0.drawings[p.id] = p;
  d0.layers[0].cels.push({ id: 'pc', start: 0, length: 2, drawingId: p.id });
  d0.palette = { name: 'P', colors: ['#ff0000', '#00ff00', '#ffffff'], names: ['a', 'b', 'c'] };
  resetStore(d0);
});

const make = (): string => {
  let id: string | null = null;
  update('Make', (d) => void (id = makeVariation(d, activeId(d))));
  return id!;
};
const ovOf = (v: string) => findArtboard(doc(), v)!.overrides!;
const shown = (v: string) => (findArtboard(doc(), v)!.content!.layers[0].cels[0].drawingId);

describe('palette overrides: the pure parts', () => {
  const base = { name: 'B', colors: ['#111111', '#222222', '#333333'] };

  it('keeps only the colours that differ, and everything else follows the original', () => {
    const ch = changesBetween(base, { ...base, colors: ['#111111', '#abcdef', '#333333'] });
    expect(ch).toEqual([{ from: '#222222', to: '#abcdef' }]);
    const ov = { changes: ch };
    expect(resolvePalette(base, ov).colors).toEqual(['#111111', '#abcdef', '#333333']);
    // The original adds, removes and moves colours: the change follows its colour.
    const grown = { ...base, colors: ['#333333', '#222222', '#111111', '#444444'] };
    expect(resolvePalette(grown, ov).colors).toEqual(['#333333', '#abcdef', '#111111', '#444444']);
    expect(resolvePalette(base, { changes: [] })).toBe(base);
    expect(resolvePalette(base, ov)).toBe(resolvePalette(base, ov));
  });

  it('finds the colours an edit recoloured, and not the ones it added, removed or moved', () => {
    const r = (a: string[], b: string[]) => [...paletteRenames(a, b)].map(([k, v]) => [k.toString(16).padStart(6, '0'), v]);
    expect(r(['#111111', '#222222'], ['#111111', '#999999'])).toEqual([['222222', '#999999']]);
    expect(r(['#111111', '#222222'], ['#111111', '#222222', '#999999'])).toEqual([]);
    expect(r(['#111111', '#222222', '#333333'], ['#111111', '#333333'])).toEqual([]);
    expect(r(['#111111', '#222222'], ['#222222', '#111111'])).toEqual([]);
    expect(r(['#111111', '#222222', '#333333'], ['#111111', '#aaaaaa', '#333333'])).toEqual([['222222', '#aaaaaa']]);
  });

  it('turns an older whole palette into changes', () => {
    expect(migrateLegacy(base, { name: 'Night', colors: ['#111111', '#000022', '#333333'] })).toEqual([{ from: '#222222', to: '#000022' }]);
  });

  it('recolours the pixels of a drawing and leaves one with none of them alone', () => {
    const p = newPixelDrawing(2, 1);
    p.pixels.set([...RED, ...GREEN], 0);
    const ov = { changes: [{ from: '#ff0000', to: '#0000ff' }] };
    const out = recolourDrawing(p, ov) as PixelDrawing;
    expect([...out.pixels]).toEqual([...BLUE, ...GREEN]);
    expect(recolourDrawing(p, ov)).toBe(out);
    const q = newPixelDrawing(2, 1);
    q.pixels.set([...GREEN, ...GREEN], 0);
    expect(recolourDrawing(q, ov)).toBe(q);
  });
});

describe('palette overrides: in a document', () => {
  it('a colour changed in a variation is the only thing it stores, and its pixels need no copy', () => {
    const v = make();
    open(v);
    changePaletteColor(0, '#0000ff');
    expect(ovOf(v).palette).toEqual({ changes: [{ from: '#ff0000', to: '#0000ff' }] });
    expect(ovOf(v).drawings).toBeUndefined();
    expect(docPalette(doc()).colors).toEqual(['#0000ff', '#00ff00', '#ffffff']);
    expect(docPalette(doc()).names).toEqual(['a', 'b', 'c']);
    expect(px(aliasId(pid, v))).toEqual(BLUE);
    expect(px(aliasId(pid, v), 2)).toEqual(BLUE);
    expect(px(pid)).toEqual(RED);
    expect(doc().palette!.colors[0]).toBe('#ff0000');
    // Closed again it still shows the colourway, with a copy of the pixels only because they are recoloured.
    open(root());
    expect(px(shown(v))).toEqual(BLUE);
    expect(artboardDoc(doc(), v).palette!.colors[0]).toBe('#0000ff');
    expect(artboardDoc(doc(), root()).palette!.colors[0]).toBe('#ff0000');
  });

  it('later changes to the original reach the variation, except the colours it changed', () => {
    const v = make();
    open(v);
    changePaletteColor(0, '#0000ff');
    open(root());
    // The original recolours another colour: the variation follows, palette and pixels.
    changePaletteColor(1, '#ffff00');
    expect(px(shown(v), 1)).toEqual(YELLOW);
    expect(px(shown(v))).toEqual(BLUE);
    open(v);
    expect(docPalette(doc()).colors).toEqual(['#0000ff', '#ffff00', '#ffffff']);
    open(root());
    // The original recolours the colour the variation changed: the variation keeps its own.
    changePaletteColor(0, '#ff8800');
    expect(px(pid)).toEqual([255, 136, 0, 255]);
    expect(px(shown(v))).toEqual(BLUE);
    expect(ovOf(v).palette).toEqual({ changes: [{ from: '#ff8800', to: '#0000ff' }] });
    // Nothing is left for a full check to do: the incremental settle kept the variation in step.
    expect(settleVariations(doc())).toBeNull();
    // It adds, then moves colours: they flow through.
    setDocPalette({ ...doc().palette!, colors: [...doc().palette!.colors, '#123456'], names: ['a', 'b', 'c', 'd'] });
    setDocPalette({ ...doc().palette!, colors: ['#123456', ...doc().palette!.colors.slice(0, 3)], names: ['d', 'a', 'b', 'c'] });
    open(v);
    expect(docPalette(doc()).colors).toEqual(['#123456', '#0000ff', '#ffff00', '#ffffff']);
    expect(docPalette(doc()).names).toEqual(['d', 'a', 'b', 'c']);
    expect(px(aliasId(pid, v))).toEqual(BLUE);
    expect(ovOf(v).drawings).toBeUndefined();
  });

  it('the pixels of the original follow into every variation, including ones painted in the original later', () => {
    const v = make();
    open(v);
    changePaletteColor(0, '#0000ff');
    open(root());
    update('Paint', (d) => {
      const p = d.drawings[pid] as PixelDrawing;
      const px2 = new Uint8ClampedArray(p.pixels);
      px2.set(RED, 12);
      p.pixels = px2;
    });
    expect(px(shown(v), 3)).toEqual(BLUE);
    expect(settleVariations(doc())).toBeNull();
  });

  it('opening a variation gives every key its own frozen copy that shares the original\'s data, and undo and redo bring it back', () => {
    const v = make();
    open(v);
    const own = doc().drawings[aliasId(pid, v)] as PixelDrawing;
    expect(Object.isFrozen(own)).toBe(true);
    expect(own.pixels).toBe((doc().drawings[pid] as PixelDrawing).pixels);
    store().undo();
    expect(activeId(doc())).toBe(root());
    expect(doc().drawings[aliasId(pid, v)]).toBeUndefined();
    store().redo();
    expect(activeId(doc())).toBe(v);
    expect(px(aliasId(pid, v))).toEqual(RED);
    expect(settleVariations(doc())).toBeNull();
  });

  it('painting in the variation redraws that drawing, and the colourway stays', () => {
    const v = make();
    open(v);
    changePaletteColor(0, '#0000ff');
    update('Paint', (d) => {
      const own = d.drawings[aliasId(pid, v)] as PixelDrawing;
      const px2 = new Uint8ClampedArray(own.pixels);
      px2.set(GREEN, 12);
      own.pixels = px2;
    });
    expect(ovOf(v).drawings![pid].replaced).toBe(true);
    expect(ovOf(v).palette!.changes).toHaveLength(1);
    open(root());
    expect(px(shown(v), 3)).toEqual(GREEN);
    expect(px(shown(v))).toEqual(BLUE);
  });

  it('shows each colour on its own line and takes one back', () => {
    const v = make();
    open(v);
    changePaletteColor(0, '#0000ff');
    changePaletteColor(2, '#eeeeee');
    const items = listDifferences(doc(), v).filter((i) => i.reset.t === 'paletteColour');
    expect(items.map((i) => i.colors)).toEqual([['#ff0000', '#0000ff'], ['#ffffff', '#eeeeee']]);
    expect(items[0].label).toBe('Colour #ff0000 becomes #0000ff on every frame');
    update('Reset', (d) => void resetDifference(d, v, items[0].reset));
    expect(ovOf(v).palette!.changes).toEqual([{ from: '#ffffff', to: '#eeeeee' }]);
    expect(docPalette(doc()).colors).toEqual(['#ff0000', '#00ff00', '#eeeeee']);
    expect(px(aliasId(pid, v))).toEqual(RED);
    update('Reset', (d) => void resetDifference(d, v, { t: 'paletteColour', from: '#ffffff' }));
    expect(ovOf(v).palette).toBeUndefined();
  });

  it('adding, removing and moving colours is refused in a variation, with a plain note', () => {
    const v = make();
    open(v);
    const before = doc();
    setDocPalette({ ...docPalette(doc()), colors: [...docPalette(doc()).colors, '#abcdef'] });
    expect(blocked).toEqual(["A variation keeps the original's list of colours. Add, remove and move colours there. Here you can change a colour."]);
    expect(doc()).toBe(before);
  });

  it('is saved as the changes only and opens again, even with a redrawn drawing', () => {
    const v = make();
    open(v);
    changePaletteColor(0, '#0000ff');
    update('Paint', (d) => {
      const own = d.drawings[aliasId(pid, v)] as PixelDrawing;
      const px2 = new Uint8ClampedArray(own.pixels);
      px2.set(GREEN, 12);
      own.pixels = px2;
    });
    open(root());
    const bytes = saveFile(doc());
    const raw = JSON.parse(strFromU8(unzipSync(bytes)['doc.json']));
    expect(raw.artboards.find((a: { id: string }) => a.id === v).overrides.palette).toEqual({ changes: [{ from: '#ff0000', to: '#0000ff' }] });
    const loaded = loadFile(bytes);
    expect(loaded.warnings).toEqual([]);
    const a = findArtboard(loaded.doc, v)!;
    expect(a.overrides!.palette).toEqual({ changes: [{ from: '#ff0000', to: '#0000ff' }] });
    const shownPx = [...(loaded.doc.drawings[a.content!.layers[0].cels[0].drawingId] as PixelDrawing).pixels];
    expect(shownPx).toEqual([...BLUE, ...GREEN, ...BLUE, ...GREEN]);
  });

  it('a file from before (a whole palette) opens as changes', () => {
    const v = make();
    open(v);
    changePaletteColor(0, '#0000ff');
    open(root());
    const zip = unzipSync(saveFile(doc()));
    const raw = JSON.parse(strFromU8(zip['doc.json']));
    const a = raw.artboards.find((x: { id: string }) => x.id === v);
    a.overrides.palette = { name: 'Night', colors: ['#0000ff', '#00ff00', '#ffffff'] };
    zip['doc.json'] = strToU8(JSON.stringify(raw));
    const loaded = loadFile(zipSync(zip));
    expect(loaded.warnings).toEqual([]);
    const b = findArtboard(loaded.doc, v)!;
    expect(b.overrides!.palette).toEqual({ changes: [{ from: '#ff0000', to: '#0000ff' }] });
    expect([...(loaded.doc.drawings[b.content!.layers[0].cels[0].drawingId] as PixelDrawing).pixels.slice(0, 4)]).toEqual(BLUE);
  });
});
