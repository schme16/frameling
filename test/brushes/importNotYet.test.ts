// A Clip Studio or Affinity file is one we can tell apart but cannot read yet, so the person is told which app it is from
// (a Procreate brush used to be read as a damaged Krita bundle here, which is why this test exists; Procreate is read now).
import { describe, expect, it } from 'vitest';
import { knownButUnread, readBrushFile } from '../../src/brushes/import';

const zip = (inner: string): Uint8Array => {
  const text = `PK\x03\x04${'\0'.repeat(26)}${inner}`;
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
};

describe('brush files we know of but cannot read', () => {
  it('names the app from the file ending', () => {
    for (const [name, app] of [
      ['pack.sut', 'Clip Studio Paint'],
      ['pack.afbrushes', 'Affinity'],
    ] as const) {
      expect(knownButUnread(zip('x'), name)).toBe(app);
    }
  });

  it('names the app from the bytes when the ending says nothing', () => {
    expect(knownButUnread(Uint8Array.from('SQLite format 3\0rest', (c) => c.charCodeAt(0)), 'mystery')).toBe('Clip Studio Paint');
  });

  it('leaves the formats we do read alone', () => {
    expect(knownButUnread(zip('mimetype'), 'pack.bundle')).toBe(null);
    expect(knownButUnread(Uint8Array.from('GIMP-VBR\n', (c) => c.charCodeAt(0)), 'one.vbr')).toBe(null);
  });

  it('does not call a Procreate zip one it cannot read, or a Krita bundle', () => {
    expect(knownButUnread(zip('Brush.archive'), 'Sequins.brush')).toBe(null);
    expect(knownButUnread(zip('x'), 'Set.brushset')).toBe(null);
    const r = readBrushFile(zip('Brush.archive'), 'Sequins.brush');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toContain('Krita bundle');
  });

  it('says which app it is, and what Frameling does read', () => {
    const r = readBrushFile(zip('x'), 'pack.sut');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('Clip Studio Paint');
      expect(r.error).toContain('Procreate (.brush, .brushset)');
    }
  });
});
