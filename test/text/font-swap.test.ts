import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import type { Doc, TextShape } from '../../src/core/format';
import { newDoc, newVectorDrawing, newVectorLayer } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { applyFontSwap, collectFontUses, fontKey, placesNote, planSwaps, swapItemCount, swapTargets } from '../../src/text/fontSwap';
import { newTextShape } from '../../src/text/model';
import { fontIsHere } from '../../src/text/fonts';
import { textCommands } from '../../src/text/commands';
import { textChoices } from '../../src/text/choices';

/** Only these are "on this computer" in the tests. */
const HERE = new Set(['nunito', 'inter', 'arial']);
const here = (f: string) => HERE.has(fontKey(f));

const txt = (id: string, text: string, font: string, patch: Partial<TextShape> = {}) => newTextShape(id, { x: 0, y: 0 }, { text, font, ...patch });

/** One layer per name, each with a drawing of the given texts held from frame 0. */
function addLayer(doc: Doc, name: string, shapes: TextShape[]): void {
  const l = newVectorLayer(name);
  const d = newVectorDrawing();
  d.shapes.push(...shapes);
  doc.drawings[d.id] = d;
  l.cels.push({ id: `c-${l.id}`, start: 0, length: doc.length, drawingId: d.id });
  doc.layers.push(l);
}

const fontsOf = (doc: Doc): string[] => Object.values(doc.drawings).flatMap((d) => (d.kind === 'vector' ? d.shapes.filter((s): s is TextShape => s.type === 'text').map((s) => s.font) : []));

describe('collecting the fonts a drawing uses', () => {
  it('finds nothing in a drawing with no text', () => {
    const doc = newDoc({ length: 4 });
    expect(collectFontUses(doc, here)).toEqual([]);
    addLayer(doc, 'Empty', []);
    expect(collectFontUses(doc, here)).toEqual([]);
    expect(swapTargets(doc)).toHaveLength(1);
  });

  it('counts texts per font, names the layers, and marks the missing ones first', () => {
    const doc = newDoc({ length: 4 });
    addLayer(doc, 'Title', [txt('a', 'Big title', 'Nunito'), txt('b', 'Subtitle', 'Brandon Grotesque')]);
    addLayer(doc, 'Captions', [txt('c', 'one', 'Nunito'), txt('d', 'two', 'Nunito')]);
    const uses = collectFontUses(doc, here);
    expect(uses.map((u) => [u.font, u.items, u.missing])).toEqual([
      ['Brandon Grotesque', 1, true],
      ['Nunito', 3, false],
    ]);
    const nunito = uses[1];
    expect(nunito.places).toEqual([
      { label: 'Title', items: 1 },
      { label: 'Captions', items: 2 },
    ]);
    expect(nunito.sample).toBe('Big title');
  });

  it('treats spellings that differ only in case as one font', () => {
    const doc = newDoc({ length: 4 });
    addLayer(doc, 'A', [txt('a', 'x', 'Arial'), txt('b', 'y', 'ARIAL '), txt('c', 'z', 'arial')]);
    const uses = collectFontUses(doc, here);
    expect(uses).toHaveLength(1);
    expect(uses[0].items).toBe(3);
    expect(uses[0].missing).toBe(false);
  });

  it('counts a title held across several keys once', () => {
    const doc = newDoc({ length: 9 });
    const l = newVectorLayer('Title');
    for (const [i, id] of ['t1', 't2', 't3'].entries()) {
      const d = newVectorDrawing();
      d.shapes.push(txt(id, 'Hello', 'Comic Neue', i ? { origin: 't1' } : {}));
      doc.drawings[d.id] = d;
      l.cels.push({ id: `c${i}`, start: i * 3, length: 3, drawingId: d.id });
    }
    doc.layers.push(l);
    const [u] = collectFontUses(doc, here);
    expect(u.items).toBe(1);
    expect(u.places).toEqual([{ label: 'Title', items: 1 }]);
  });

  it('names each board when a font is used on several artboards, and counts inside symbols', () => {
    const doc = newDoc({ length: 4 });
    addLayer(doc, 'Words', [txt('a', 'Intro', 'Lobster')]);
    const outro = newDoc({ length: 4 });
    addLayer(outro, 'Words', [txt('b', 'Outro', 'Lobster'), txt('c', 'Credits', 'Lobster')]);
    Object.assign(doc.drawings, outro.drawings);
    doc.artboards = [
      { id: 'a1', name: 'Intro', x: 0, y: 0 },
      { id: 'a2', name: 'Outro', x: 2000, y: 0, content: { width: 1280, height: 720, background: '#ffffff', length: 4, layers: outro.layers, clips: [], markers: [] } },
    ];
    doc.activeArtboard = 'a1';
    const symLayer = newVectorLayer('Letters');
    const sd = newVectorDrawing();
    sd.shapes.push(txt('s', 'Logo', 'Lobster'));
    doc.drawings[sd.id] = sd;
    symLayer.cels.push({ id: 'sc', start: 0, length: 1, drawingId: sd.id });
    doc.symbols = { sy: { id: 'sy', name: 'Logo', layers: [symLayer], length: 1, origin: { x: 0, y: 0 } } };

    const [u] = collectFontUses(doc, here);
    expect(u.font).toBe('Lobster');
    expect(u.items).toBe(4);
    expect(u.missing).toBe(true);
    expect(u.places).toEqual([
      { label: 'Intro, Words', items: 1 },
      { label: 'Outro, Words', items: 2 },
      { label: 'Symbol Logo, Letters', items: 1 },
    ]);
  });
});

describe('planning and applying a swap', () => {
  const build = () => {
    const doc = newDoc({ length: 4 });
    addLayer(doc, 'Title', [txt('a', 'Hello', 'Brandon Grotesque', { weight: 900, size: 99, italic: true }), txt('b', 'World', 'Nunito')]);
    addLayer(doc, 'Notes', [txt('c', 'Small', 'Brandon Grotesque'), txt('d', 'Other', 'Arial')]);
    return doc;
  };

  it('plans only the fonts that have a different pick, and only the missing ones in that scope', () => {
    const uses = collectFontUses(build(), here);
    const picked = { 'Brandon Grotesque': 'Inter', Nunito: 'Arial', Arial: 'ARIAL' };
    expect([...planSwaps(uses, picked, 'all')]).toEqual([
      ['brandon grotesque', 'Inter'],
      ['nunito', 'Arial'],
    ]);
    expect([...planSwaps(uses, picked, 'missing')]).toEqual([['brandon grotesque', 'Inter']]);
    expect(planSwaps(uses, {}, 'all').size).toBe(0);
    expect(planSwaps(uses, { Nunito: '   ' }, 'all').size).toBe(0);
  });

  it('swaps every use at once and keeps size, weight and the rest', () => {
    const doc = build();
    const uses = collectFontUses(doc, here);
    const plan = planSwaps(uses, { 'Brandon Grotesque': 'Inter' }, 'missing');
    expect(swapItemCount(uses, plan)).toBe(2);
    const next = produce(doc, (d) => void expect(applyFontSwap(d as Doc, plan)).toBe(2));
    expect(fontsOf(next).sort()).toEqual(['Arial', 'Inter', 'Inter', 'Nunito']);
    const a = Object.values(next.drawings).flatMap((d) => (d.kind === 'vector' ? d.shapes : [])).find((s) => s.id === 'a') as TextShape;
    expect([a.weight, a.size, a.italic, a.text]).toEqual([900, 99, true, 'Hello']);
    // the original is untouched
    expect(fontsOf(doc)).toContain('Brandon Grotesque');
    // and the drawing no longer asks for the missing font
    expect(collectFontUses(next, here).some((u) => u.missing)).toBe(false);
  });

  it('does nothing to a drawing with no text', () => {
    const doc = newDoc({ length: 2 });
    addLayer(doc, 'Art', []);
    const plan = new Map([['lobster', 'Inter']]);
    expect(applyFontSwap(doc, plan)).toBe(0);
  });

  it('is one undo step through the store, and redo does it again', () => {
    const doc = build();
    resetStore(doc);
    const uses = collectFontUses(store().get().doc, here);
    const plan = planSwaps(uses, { 'Brandon Grotesque': 'Inter', Arial: 'Nunito' }, 'all');
    const targets = swapTargets(store().get().doc);
    const before = store().get().doc;
    store().update('Swap 2 fonts', (d) => void applyFontSwap(d as Doc, plan, targets));
    expect(fontsOf(store().get().doc).sort()).toEqual(['Inter', 'Inter', 'Nunito', 'Nunito']);
    store().undo();
    expect(fontsOf(store().get().doc).sort()).toEqual(fontsOf(before).sort());
    expect(fontsOf(store().get().doc)).toContain('Brandon Grotesque');
    store().redo();
    expect(fontsOf(store().get().doc)).not.toContain('Brandon Grotesque');
  });
});

describe('words and wiring', () => {
  it('shortens a long list of places', () => {
    const places = ['A', 'B', 'C', 'D', 'E'].map((label, i) => ({ label, items: i === 1 ? 2 : 1 }));
    expect(placesNote(places)).toBe('A; B (2); C; and 2 more');
    expect(placesNote(places.slice(0, 2))).toBe('A; B (2)');
  });

  it('has a palette command with no em dashes, and a remembered choice for where it starts', () => {
    const c = textCommands.find((x) => x.id === 'text.swapFonts');
    expect(c).toBeTruthy();
    expect(`${c!.label} ${c!.description}`).not.toMatch(/—/);
    expect(textChoices.map((x) => x.id)).toEqual(['text.fontSwapScope']);
    expect(textChoices[0].default).toBe('missing');
  });

  it('knows the shipped and generic fonts are here without a canvas', () => {
    expect(fontIsHere('Nunito')).toBe(true);
    expect(fontIsHere('inter')).toBe(true);
    expect(fontIsHere('sans-serif')).toBe(true);
    expect(fontIsHere('Not A Real Font')).toBe(false);
  });
});
