import { describe, expect, it } from 'vitest';
import { fitRect, kilobytes, STICKER_SERVICES, stickerHeight, stickerTable } from '../../src/export/icons';
import { bodies } from '../../src/export/help.bodies';

// What each app allows, checked 2026-11-14. If an app changes its rules, change the number here and in icons.ts together.
const KB = 1024;
const PINNED: Record<string, { size: number; height?: number; type: 'png' | 'webp'; maxBytes: number }> = {
  slack: { size: 128, type: 'png', maxBytes: 128 * KB },
  teams: { size: 128, type: 'png', maxBytes: 256 * KB },
  'discord-emoji': { size: 128, type: 'png', maxBytes: 256 * KB },
  'discord-sticker': { size: 320, type: 'png', maxBytes: 512 * KB },
  telegram: { size: 512, type: 'webp', maxBytes: 512 * KB },
  whatsapp: { size: 512, type: 'webp', maxBytes: 100 * KB },
  signal: { size: 512, type: 'webp', maxBytes: 300 * KB },
  'telegram-emoji': { size: 100, type: 'webp', maxBytes: 64 * KB },
  imessage: { size: 618, type: 'png', maxBytes: 500 * KB },
  line: { size: 370, height: 320, type: 'png', maxBytes: 1024 * KB },
};

describe('sticker and emoji limits, pinned per app', () => {
  it('lists exactly the apps we have checked', () => {
    expect(STICKER_SERVICES.map((s) => s.id).sort()).toEqual(Object.keys(PINNED).sort());
  });
  for (const [id, want] of Object.entries(PINNED)) {
    it(`${id} stays at ${want.size} x ${want.height ?? want.size} px, ${want.type}, ${want.maxBytes / KB} KB`, () => {
      const s = STICKER_SERVICES.find((x) => x.id === id)!;
      expect({ size: s.size, ...(s.height === undefined ? {} : { height: s.height }), type: s.type, maxBytes: s.maxBytes }).toEqual(want);
    });
  }
  it('says the same numbers in the help topic', () => {
    const t = stickerTable();
    for (const s of STICKER_SERVICES) expect(t).toContain(`| ${s.title} | ${s.size} x ${stickerHeight(s)} | ${s.type === 'webp' ? 'WebP' : 'PNG'} | ${kilobytes(s.maxBytes)} |`);
    expect(bodies['export-stickers']).toContain(t);
    expect(bodies['export-stickers']).toContain('| WhatsApp sticker | 512 x 512 | WebP | 100 KB |');
    expect(bodies['export-stickers']).toContain('| LINE sticker | 370 x 320 | PNG | 1.0 MB |');
  });
});

// LINE is the only app that wants a picture that is not square, so the fitting maths has to hold for both shapes.
describe('a sticker that is not square', () => {
  it('says every app but LINE is square', () => {
    for (const s of STICKER_SERVICES) expect(stickerHeight(s)).toBe(s.id === 'line' ? 320 : s.size);
  });
  it('fits a square drawing inside LINE\'s wider box, centred, with room at the sides', () => {
    const box = fitRect(100, 100, 370, 320, 'fit');
    expect({ width: box.width, height: box.height }).toEqual({ width: 320, height: 320 });
    expect(box.x).toBe(25);
    expect(box.y).toBe(0);
  });
  it('fills LINE\'s box when asked to fill, cutting off what sticks out', () => {
    const box = fitRect(100, 100, 370, 320, 'fill');
    expect({ width: box.width, height: box.height }).toEqual({ width: 370, height: 370 });
    expect(box.y).toBe(-25);
  });
  it('matches the old square maths when the box is square', () => {
    expect(fitRect(80, 40, 512, 512, 'fit')).toEqual({ scale: 6.4, width: 512, height: 256, x: 0, y: 128 });
    expect(fitRect(80, 40, 512, 512, 'fill')).toEqual({ scale: 12.8, width: 1024, height: 512, x: -256, y: 0 });
  });
});
