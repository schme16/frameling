import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readBrushFile, sniff } from '../../src/brushes/import';
import { cleanDab } from '../../src/dab/maths';

const fx = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../fixtures/brushes/gimp/${n}`, import.meta.url)));

/** A .gbr built by hand, version 2, to the published layout. */
function gbr(o: { w: number; h: number; bytes?: number; name?: string; spacing?: number; version?: number; data?: Uint8Array; magic?: string; headerSize?: number }): Uint8Array {
  const name = new TextEncoder().encode((o.name ?? 'Test') + '\0');
  const bytes = o.bytes ?? 1;
  const version = o.version ?? 2;
  const head = version === 1 ? 20 : 28;
  const data = o.data ?? new Uint8Array(o.w * o.h * bytes).fill(255);
  const out = new Uint8Array(head + name.length + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, o.headerSize ?? head + name.length);
  v.setUint32(4, version);
  v.setUint32(8, o.w);
  v.setUint32(12, o.h);
  v.setUint32(16, bytes);
  if (version === 2) {
    for (let i = 0; i < 4; i++) out[20 + i] = (o.magic ?? 'GIMP').charCodeAt(i);
    v.setUint32(24, o.spacing ?? 20);
  }
  out.set(name, head);
  out.set(data, head + name.length);
  return out;
}

describe('GIMP .gbr', () => {
  it('reads a real one: the 1 by 1 pixel brush that comes with GIMP', () => {
    const r = readBrushFile(fx('pixel.gbr'), 'pixel.gbr');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.brushes).toHaveLength(1);
    const b = r.brushes[0];
    expect(b.name).toBe('Pixel (1x1 square)');
    expect(b.dab.tip).toBe('picture');
    expect(b.dab.picture).toMatchObject({ w: 1, h: 1, soft: true });
    expect(b.dab.size).toBe(1);
    expect(b.dropped).toEqual([]);
  });

  it('keeps the shading of a real grey brush as a soft tip, and its spacing', () => {
    const r = readBrushFile(fx('Charcoal-01.gbr'), 'Charcoal-01.gbr');
    if (!r.ok) throw new Error(r.error);
    const b = r.brushes[0];
    expect(b.name).toBe('Charcoal 01');
    expect(b.dab.picture?.soft).toBe(true);
    expect(b.dab.picture!.w).toBeLessThanOrEqual(32);
    // Several different shades, not a flat shape.
    expect(b.dab.picture!.colours.length).toBeGreaterThan(4);
    expect(b.dab.spacing).toBeGreaterThan(0.05);
    // 64 by 64 in the file, shrunk to 32, and the note says so.
    expect(b.changed.join(' ')).toMatch(/shrunk from 64 by 64/);
  });

  it('reads a real brush that is bigger than a picture tip can be', () => {
    const r = readBrushFile(fx('Oils-01.gbr'), 'Oils-01.gbr');
    if (!r.ok) throw new Error(r.error);
    expect(r.brushes[0].dab.picture!.w).toBeLessThanOrEqual(32);
    expect(r.brushes[0].dab.size).toBeLessThanOrEqual(300);
    expect(r.brushes[0].changed.length).toBe(1);
  });

  it('reads a version 1 file (no marker, no spacing)', () => {
    const r = readBrushFile(gbr({ w: 4, h: 4, version: 1, name: 'Old' }), 'old.gbr');
    if (!r.ok) throw new Error(r.error);
    expect(r.brushes[0].name).toBe('Old');
    expect(r.brushes[0].dab.spacing).toBe(0.2);
  });

  it('keeps the colours of a colour brush, with their see-through', () => {
    const data = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < 16; i++) data.set(i % 2 ? [255, 0, 0, 255] : [0, 0, 255, 128], i * 4);
    const r = readBrushFile(gbr({ w: 4, h: 4, bytes: 4, data, name: 'Colour' }), 'c.gbr');
    if (!r.ok) throw new Error(r.error);
    const p = r.brushes[0].dab.picture!;
    expect(p.keep).toBe(true);
    expect(p.soft).toBeUndefined();
    expect(p.colours).toContain('#ff0000');
    expect(p.colours.some((c) => /^#0000ff[0-9a-f]{2}$/.test(c))).toBe(true);
  });

  it('cuts the colours of a very colourful brush to what a saved brush can hold', () => {
    const w = 32;
    const data = new Uint8Array(w * w * 4);
    for (let i = 0; i < w * w; i++) data.set([(i * 7) & 255, Math.floor(i / 4) * 3 & 255, (i * 29 + (i >> 5) * 41) & 255, 255], i * 4);
    const r = readBrushFile(gbr({ w, h: w, bytes: 4, data }), 'x.gbr');
    if (!r.ok) throw new Error(r.error);
    expect(r.brushes[0].dab.picture!.colours.length).toBeLessThanOrEqual(256);
    expect(r.brushes[0].changed.join(' ')).toMatch(/colours were cut down/);
  });

  it('trims the empty margin so the size is the part you can see', () => {
    const data = new Uint8Array(20 * 20);
    for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) data[y * 20 + x] = 255;
    const r = readBrushFile(gbr({ w: 20, h: 20, data }), 'sq.gbr');
    if (!r.ok) throw new Error(r.error);
    expect(r.brushes[0].dab.picture).toMatchObject({ w: 10, h: 10 });
    expect(r.brushes[0].dab.size).toBe(10);
  });

  it('refuses an empty brush', () => {
    const r = readBrushFile(gbr({ w: 8, h: 8, data: new Uint8Array(64) }), 'empty.gbr');
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/empty/);
  });

  describe('a damaged or hostile file is refused in plain words', () => {
    const good = gbr({ w: 8, h: 8 });
    it('cut short', () => {
      const r = readBrushFile(good.subarray(0, good.length - 10), 'cut.gbr');
      expect(r).toMatchObject({ ok: false });
      if (!r.ok) expect(r.error).toMatch(/ends before its picture/);
    });
    it('says it is enormous but is not', () => {
      const r = readBrushFile(gbr({ w: 4000000, h: 4000000, data: new Uint8Array(4) }), 'big.gbr');
      expect(r).toMatchObject({ ok: false });
    });
    it('says it is a few thousand pixels across with no pixels behind it', () => {
      const r = readBrushFile(gbr({ w: 9000, h: 9000, data: new Uint8Array(16) }), 'big.gbr');
      expect(r).toMatchObject({ ok: false });
      if (!r.ok) expect(r.error).toMatch(/ends before its picture/);
    });
    it('has no GIMP marker', () => {
      expect(readBrushFile(gbr({ w: 4, h: 4, magic: 'NOPE' }), 'x.gbr')).toMatchObject({ ok: false });
    });
    it('has a header size that runs off the end', () => {
      expect(readBrushFile(gbr({ w: 4, h: 4, headerSize: 99999 }), 'x.gbr')).toMatchObject({ ok: false });
    });
    it('has odd pixel sizes', () => {
      expect(readBrushFile(gbr({ w: 4, h: 4, bytes: 9, data: new Uint8Array(200) }), 'x.gbr')).toMatchObject({ ok: false });
    });
    it('is a 16-bit float CinePaint brush', () => {
      const r = readBrushFile(gbr({ w: 4, h: 4, version: 3 }), 'x.gbr');
      expect(r).toMatchObject({ ok: false });
    });
    it('is random bytes', () => {
      const junk = new Uint8Array(500).map((_, i) => (i * 131 + 7) & 255);
      expect(() => readBrushFile(junk, 'junk.gbr')).not.toThrow();
      expect(readBrushFile(junk, 'junk.gbr')).toMatchObject({ ok: false });
    });
    it('is a name that is not a brush at all', () => {
      expect(readBrushFile(new Uint8Array(100).fill(65), 'notes.txt')).toMatchObject({ ok: false });
    });
    it('is too small to be anything', () => {
      expect(readBrushFile(new Uint8Array(3), 'x.gbr')).toMatchObject({ ok: false });
    });
  });

  it('every brush that comes out is already clean', () => {
    for (const [n, f] of [['pixel.gbr', 'pixel.gbr'], ['Charcoal-01.gbr', 'c.gbr'], ['Oils-01.gbr', 'o.gbr']] as const) {
      const r = readBrushFile(fx(n), f);
      if (!r.ok) throw new Error(r.error);
      expect(cleanDab(r.brushes[0].dab)).toEqual(r.brushes[0].dab);
    }
  });
});

describe('GIMP .gih', () => {
  it('takes the first picture of a real pipe and says what was left', () => {
    const r = readBrushFile(fx('confetti.gih'), 'confetti.gih');
    if (!r.ok) throw new Error(r.error);
    expect(r.brushes).toHaveLength(1);
    expect(r.brushes[0].name).toBe('Animated Confetti');
    expect(r.brushes[0].dropped).toHaveLength(1);
    expect(r.brushes[0].dropped[0]).toMatch(/pipe of 10 pictures/);
    expect(r.brushes[0].dab.tip).toBe('picture');
  });
  it('refuses a pipe that says it has more pictures than it does', () => {
    const f = fx('confetti.gih');
    const r = readBrushFile(f.subarray(0, f.length - 50), 'confetti.gih');
    expect(r).toMatchObject({ ok: false });
  });
  it('refuses a pipe whose header never ends', () => {
    expect(readBrushFile(new Uint8Array(5000).fill(65), 'x.gih')).toMatchObject({ ok: false });
  });
});

describe('GIMP .vbr', () => {
  it('reads a round soft one', () => {
    const r = readBrushFile(fx('Hardness-050.vbr'), 'h.vbr');
    if (!r.ok) throw new Error(r.error);
    const b = r.brushes[0];
    expect(b.name).toBe('2. Hardness 050');
    expect(b.dab).toMatchObject({ tip: 'round', size: 50, hardness: 0.5, spacing: 0.1, aliased: false });
    expect(b.dropped).toEqual([]);
  });
  it('reads a square one', () => {
    const r = readBrushFile(fx('Block-01.vbr'), 'b.vbr');
    if (!r.ok) throw new Error(r.error);
    expect(r.brushes[0].dab).toMatchObject({ tip: 'square', size: 50, hardness: 0.95, roundness: 0.25 });
    expect(r.brushes[0].dropped).toEqual([]);
  });
  it('turns a flattened star into a flat rectangle and says so', () => {
    const r = readBrushFile(fx('Star.vbr'), 's.vbr');
    if (!r.ok) throw new Error(r.error);
    expect(r.brushes[0].dab.tip).toBe('square');
    expect(r.brushes[0].dab).toMatchObject({ roundness: 0.4, angle: 343 });
    expect(r.brushes[0].dropped[0]).toMatch(/5 points/);
    expect(r.brushes[0].changed[0]).toMatch(/flat rectangle/);
  });
  it('stands a round diamond on its corner', () => {
    const text = 'GIMP-VBR\n1.5\nDiamond\ndiamond\n20\n10\n2\n1\n1\n0\n';
    const r = readBrushFile(new TextEncoder().encode(text), 'd.vbr');
    if (!r.ok) throw new Error(r.error);
    expect(r.brushes[0].dab).toMatchObject({ tip: 'square', angle: 315, roundness: 1 });
    expect(r.brushes[0].dropped).toEqual([]);
  });
  it('refuses text that is not a generated brush', () => {
    expect(readBrushFile(new TextEncoder().encode('hello there, this is not one'), 'x.vbr')).toMatchObject({ ok: false });
  });
  it('holds hostile numbers in range', () => {
    const text = 'GIMP-VBR\n1.0\nBad\n-5\n1e99\nNaN\n-3\n99999\n';
    const r = readBrushFile(new TextEncoder().encode(text), 'bad.vbr');
    if (!r.ok) throw new Error(r.error);
    const d = r.brushes[0].dab;
    expect(d.size).toBeLessThanOrEqual(300);
    expect(d.spacing).toBeGreaterThanOrEqual(0.05);
    expect(d.roundness).toBeGreaterThanOrEqual(0.05);
    expect(d.hardness).toBeLessThanOrEqual(1);
  });
});

describe('sniff', () => {
  it('goes by the first bytes when the ending is missing', () => {
    expect(sniff(fx('pixel.gbr'), 'download')).toBe('gbr');
    expect(sniff(fx('Hardness-050.vbr'), 'download')).toBe('vbr');
    expect(sniff(new Uint8Array(40), 'download')).toBeNull();
    expect(sniff(new Uint8Array([0, 6, 0, 2, 0x38, 0x42, 0x49, 0x4d, 0, 0, 0, 0]), 'download')).toBe('abr');
  });
});
