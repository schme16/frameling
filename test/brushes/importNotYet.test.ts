// A Procreate brush is a zip, exactly like a Krita bundle, so it used to be read as a damaged Krita bundle and the
// person was told their Krita bundle had no presets in it. These hold the refusal to naming the app the file is from.
import { describe, expect, it } from 'vitest';
import { knownButUnread, readBrushFile } from '../../src/brushes/import';

const zip = (inner: string): Uint8Array => {
  const text = `PK\x03\x04${'\0'.repeat(26)}${inner}`;
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
};

describe('brush files we know of but cannot read', () => {
  it('names the app from the file ending', () => {
    for (const [name, app] of [
      ['Sequins.brush', 'Procreate'],
      ['Set.brushset', 'Procreate'],
      ['pack.sut', 'Clip Studio Paint'],
      ['pack.afbrushes', 'Affinity'],
    ] as const) {
      expect(knownButUnread(zip('x'), name)).toBe(app);
    }
  });

  it('names the app from the bytes when the ending says nothing', () => {
    expect(knownButUnread(zip('Brush.archive'), 'mystery')).toBe('Procreate');
    expect(knownButUnread(Uint8Array.from('SQLite format 3\0rest', (c) => c.charCodeAt(0)), 'mystery')).toBe('Clip Studio Paint');
  });

  it('leaves the formats we do read alone', () => {
    expect(knownButUnread(zip('mimetype'), 'pack.bundle')).toBe(null);
    expect(knownButUnread(Uint8Array.from('GIMP-VBR\n', (c) => c.charCodeAt(0)), 'one.vbr')).toBe(null);
  });

  it('says which app it is, instead of blaming a Krita bundle', () => {
    const r = readBrushFile(zip('Brush.archive'), 'Sequins.brush');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('Procreate');
      expect(r.error).not.toContain('Krita bundle');
    }
  });
});
