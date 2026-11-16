import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { offerSwatchPalette, paletteFromSwatches } from '../../src/pixel/palette';
import { resetStore, store } from '../../src/core/store';
import { paletteFromSwatchesNow } from '../../src/pixel/palette-files';
import { docPalette } from '../../src/pixel/palette';

const own = () => {
  const d = newDoc({ name: 'Quill' });
  d.swatches = [
    { id: 'a', name: 'Feather', color: '#3b2f6b' },
    { id: 'b', name: 'Beak', color: '#ffb347' },
    { id: 'c', name: 'Feather again', color: '#3B2F6B' },
    { id: 'd', name: 'Eye', color: '#ffffff' },
  ];
  return d;
};

describe('a palette from the file\'s swatches', () => {
  it('says nothing for a new file, whose swatches are the ten everyone starts with', () => {
    const d = newDoc({ name: 'New' });
    expect(paletteFromSwatches(d)).toBeNull();
    expect(offerSwatchPalette(d)).toBe(false);
  });

  it('says nothing for a file with no swatches', () => {
    const d = newDoc();
    d.swatches = [];
    expect(paletteFromSwatches(d)).toBeNull();
  });

  it('keeps the order and names, drops repeated colours', () => {
    const p = paletteFromSwatches(own())!;
    expect(p.colors).toEqual(['#3b2f6b', '#ffb347', '#ffffff']);
    expect(p.names).toEqual(['Feather', 'Beak', 'Eye']);
    expect(p.name).toBe('Quill swatches');
  });

  it('skips colours that are not colours, and stops at 256', () => {
    const d = own();
    d.swatches.push({ id: 'z', name: 'Oops', color: 'not a colour' });
    expect(paletteFromSwatches(d)!.colors).toHaveLength(3);
    d.swatches = Array.from({ length: 300 }, (_, i) => ({ id: `s${i}`, name: `c${i}`, color: `#${(i + 1).toString(16).padStart(6, '0')}` }));
    expect(paletteFromSwatches(d)!.colors).toHaveLength(256);
  });

  it('offers while the file has no palette of its own, and stops once it has one', () => {
    const d = own();
    expect(offerSwatchPalette(d)).toBe(true);
    d.palette = { name: 'Mine', colors: ['#000000'] };
    expect(offerSwatchPalette(d)).toBe(false);
  });

  it('makes the palette in one undo step, and opening the file changes nothing', () => {
    resetStore(own());
    expect(store().get().ui.dirty).toBe(false);
    expect(docPalette(store().get().doc).name).not.toBe('Quill swatches');
    paletteFromSwatchesNow();
    expect(docPalette(store().get().doc).colors).toEqual(['#3b2f6b', '#ffb347', '#ffffff']);
    store().undo();
    expect(store().get().doc.palette).toBeUndefined();
  });
});
