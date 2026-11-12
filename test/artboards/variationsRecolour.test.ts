import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing, newVectorLayer } from '../../src/core/doc';
import type { Doc, PathShape, PixelDrawing, VectorDrawing } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import { onBlocked, resetStore, store } from '../../src/core/store';
import { activeId, artboardsOf, findArtboard, switchArtboard } from '../../src/artboards/model';
import { aliasId, listDifferences, makeVariation, recolourOpenVariation, resetDifference } from '../../src/artboards/variations';
import { applyRecolour, recolourDoc } from '../../src/tools/recolour';

const PINK = '#ff6f91';
const BLUE = '#4f9bd1';
const rect = (id: string, fill: string, x = 0): PathShape => ({
  id,
  type: 'path',
  paths: [{ closed: true, points: [{ x, y: 0 }, { x: x + 10, y: 0 }, { x: x + 10, y: 10 }, { x, y: 10 }] }],
  fill,
  stroke: null,
  opacity: 1,
});

const doc = () => store().get().doc;
const update = (label: string, fn: (d: Doc) => void) => store().update(label, (d) => fn(d as Doc));
const fillOf = (drawing: string, i = 0) => ((doc().drawings[drawing] as VectorDrawing).shapes[i] as PathShape).fill;
let blocked: string[] = [];

/** A ball (pink) over a hat (green) on three keys, and a pink swatch. */
beforeEach(() => {
  blocked = [];
  onBlocked((m) => blocked.push(m));
  const d0 = newDoc({ name: 'Hero', width: 100, height: 100, length: 3 });
  const layer = { ...newVectorLayer('Ball'), id: 'L' };
  for (let f = 0; f < 3; f++) {
    d0.drawings[`k${f}`] = { id: `k${f}`, kind: 'vector', shapes: [rect(`b${f}`, PINK), rect(`h${f}`, '#00ff00', 20)] };
    layer.cels.push({ id: `c${f}`, start: f, length: 1, drawingId: `k${f}` });
  }
  d0.layers = [layer];
  d0.swatches = [{ id: 'sw', name: 'Pink', color: PINK }];
  resetStore(d0);
});

const make = (): string => {
  let id: string | null = null;
  update('Make', (d) => void (id = makeVariation(d, activeId(d))));
  return id!;
};
const open = (id: string) => update('Go', (d) => void switchArtboard(d, id));
const recolourDialog = (from: string, to: string, closeness = 0) => {
  const r = recolourDoc(doc(), from, to, { closeness });
  store().update('Recolour the whole animation', (d) => applyRecolour(d as Doc, r));
};

describe('recolouring the whole animation inside a variation', () => {
  it('changes only the variation, never the original, and says nothing is refused', () => {
    const v = make();
    const orig = artboardsOf(doc())[0].id;
    open(v);
    recolourDialog(PINK, BLUE);
    expect(blocked).toEqual([]);
    // The variation shows blue on every key.
    for (let f = 0; f < 3; f++) expect(fillOf(aliasId(`k${f}`, v))).toBe(BLUE);
    // The original's drawings and the swatches are untouched.
    for (let f = 0; f < 3; f++) expect(fillOf(`k${f}`)).toBe(PINK);
    expect(doc().swatches[0].color).toBe(PINK);
    // Back in the original it is still pink, and the variation stays blue when closed.
    open(orig);
    for (let f = 0; f < 3; f++) expect(fillOf(`k${f}`)).toBe(PINK);
    const closed = findArtboard(doc(), v)!.content!;
    for (let f = 0; f < 3; f++) expect(fillOf(closed.layers[0].cels[f].drawingId)).toBe(BLUE);
  });

  it('is one undo step', () => {
    const v = make();
    open(v);
    recolourDialog(PINK, BLUE);
    expect(store().get().doc.layers[0].cels).toHaveLength(3);
    store().undo();
    for (let f = 0; f < 3; f++) expect(fillOf(aliasId(`k${f}`, v))).toBe(PINK);
    expect(listDifferences(doc(), v)).toEqual([]);
    store().redo();
    expect(fillOf(aliasId('k2', v))).toBe(BLUE);
  });

  it('is one line per colour in Differences, and Reset takes the colour back', () => {
    const v = make();
    open(v);
    recolourDialog(PINK, BLUE);
    const list = listDifferences(doc(), v);
    expect(list).toHaveLength(1);
    expect(list[0].colors).toEqual([PINK, BLUE]);
    update('Reset', (d) => void resetDifference(d, v, list[0].reset));
    expect(listDifferences(doc(), v)).toEqual([]);
    for (let f = 0; f < 3; f++) expect(fillOf(aliasId(`k${f}`, v))).toBe(PINK);
  });

  it('recolouring the original afterwards reaches the variation except for the colour it changed', () => {
    const v = make();
    open(v);
    recolourDialog(PINK, BLUE);
    open(artboardsOf(doc())[0].id);
    recolourDialog('#00ff00', '#ffff00');
    expect(blocked).toEqual([]);
    expect(fillOf('k0', 1)).toBe('#ffff00');
    const closed = findArtboard(doc(), v)!.content!;
    expect(fillOf(closed.layers[0].cels[0].drawingId, 0)).toBe(BLUE);
    expect(fillOf(closed.layers[0].cels[0].drawingId, 1)).toBe('#ffff00');
  });
});

describe('Recolour this variation', () => {
  it('changes several colours across all frames in one undo step, one Differences line per colour', () => {
    const v = make();
    open(v);
    const before = store().canUndo();
    expect(before).toBe(true);
    update('Recolour this variation', (d) =>
      void recolourOpenVariation(d, [
        { from: PINK, to: BLUE },
        { from: '#00ff00', to: '#ffff00' },
      ]),
    );
    expect(blocked).toEqual([]);
    for (let f = 0; f < 3; f++) {
      expect(fillOf(aliasId(`k${f}`, v), 0)).toBe(BLUE);
      expect(fillOf(aliasId(`k${f}`, v), 1)).toBe('#ffff00');
      expect(fillOf(`k${f}`, 0)).toBe(PINK);
    }
    const list = listDifferences(doc(), v);
    expect(list.map((x) => x.colors)).toEqual([[PINK, BLUE], ['#00ff00', '#ffff00']]);
    store().undo();
    expect(listDifferences(doc(), v)).toEqual([]);
    expect(fillOf(aliasId('k1', v), 1)).toBe('#00ff00');
  });

  it('recolouring a recoloured colour again keeps one line, from the original colour', () => {
    const v = make();
    open(v);
    update('A', (d) => void recolourOpenVariation(d, [{ from: PINK, to: BLUE }]));
    update('B', (d) => void recolourOpenVariation(d, [{ from: BLUE, to: '#111111' }]));
    const list = listDifferences(doc(), v);
    expect(list.map((x) => x.colors)).toEqual([[PINK, '#111111']]);
    // Back to the original's colour: no difference left.
    update('C', (d) => void recolourOpenVariation(d, [{ from: '#111111', to: PINK }]));
    expect(listDifferences(doc(), v)).toEqual([]);
  });
});

describe('a colourway on vector drawings', () => {
  it('is saved and opened again', () => {
    const v = make();
    open(v);
    update('Recolour this variation', (d) => void recolourOpenVariation(d, [{ from: PINK, to: BLUE }]));
    open(artboardsOf(doc())[0].id);
    const loaded = loadFile(saveFile(doc()));
    expect(loaded.warnings).toEqual([]);
    const a = findArtboard(loaded.doc, v)!;
    expect(a.overrides!.palette).toEqual({ changes: [{ from: PINK, to: BLUE }] });
    expect(fillOf2(loaded.doc, a.content!.layers[0].cels[1].drawingId)).toBe(BLUE);
    expect(fillOf2(loaded.doc, 'k1')).toBe(PINK);
  });

  it('keeps the transparency of a colour it recolours', () => {
    const v = make();
    open(v);
    update('Faint', (d) => {
      ((d.drawings[aliasId('k0', v)] as VectorDrawing).shapes[0] as PathShape).fill = PINK + '80';
    });
    update('Recolour this variation', (d) => void recolourOpenVariation(d, [{ from: PINK, to: BLUE }]));
    expect(fillOf(aliasId('k0', v))).toBe(BLUE + '80');
    expect(fillOf(aliasId('k1', v))).toBe(BLUE);
  });
});

describe('recolouring a pixel variation', () => {
  it('becomes a colour of its colourway and leaves the original alone', () => {
    const d0 = newDoc({ name: 'Px', width: 2, height: 1, length: 1, pixel: { pixelSize: 1 } });
    const p = newPixelDrawing(2, 1);
    p.pixels.set([255, 0, 0, 255, 0, 255, 0, 255], 0);
    d0.drawings[p.id] = p;
    d0.layers[0].cels.push({ id: 'pc', start: 0, length: 1, drawingId: p.id });
    d0.palette = { name: 'P', colors: ['#ff0000', '#00ff00'] };
    resetStore(d0);
    const v = make();
    open(v);
    recolourDialog('#ff0000', '#0000ff');
    expect(blocked).toEqual([]);
    expect([...(doc().drawings[aliasId(p.id, v)] as PixelDrawing).pixels.slice(0, 4)]).toEqual([0, 0, 255, 255]);
    expect([...(doc().drawings[p.id] as PixelDrawing).pixels.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect(findArtboard(doc(), v)!.overrides!.palette!.changes).toEqual([{ from: '#ff0000', to: '#0000ff' }]);
    expect(listDifferences(doc(), v).map((x) => x.colors)).toEqual([['#ff0000', '#0000ff']]);
  });
});

function fillOf2(d: Doc, drawing: string, i = 0) {
  return ((d.drawings[drawing] as VectorDrawing).shapes[i] as PathShape).fill;
}
