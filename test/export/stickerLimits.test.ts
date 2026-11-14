import { describe, expect, it } from 'vitest';
import { kilobytes, STICKER_SERVICES, stickerTable } from '../../src/export/icons';
import { bodies } from '../../src/export/help.bodies';

// What each app allows, checked 2026-11-14. If an app changes its rules, change the number here and in icons.ts together.
const KB = 1024;
const PINNED: Record<string, { size: number; type: 'png' | 'webp'; maxBytes: number }> = {
  slack: { size: 128, type: 'png', maxBytes: 128 * KB },
  teams: { size: 128, type: 'png', maxBytes: 256 * KB },
  'discord-emoji': { size: 128, type: 'png', maxBytes: 256 * KB },
  'discord-sticker': { size: 320, type: 'png', maxBytes: 512 * KB },
  telegram: { size: 512, type: 'webp', maxBytes: 512 * KB },
  whatsapp: { size: 512, type: 'webp', maxBytes: 100 * KB },
  signal: { size: 512, type: 'webp', maxBytes: 300 * KB },
};

describe('sticker and emoji limits, pinned per app', () => {
  it('lists exactly the apps we have checked', () => {
    expect(STICKER_SERVICES.map((s) => s.id).sort()).toEqual(Object.keys(PINNED).sort());
  });
  for (const [id, want] of Object.entries(PINNED)) {
    it(`${id} stays at ${want.size} px, ${want.type}, ${want.maxBytes / KB} KB`, () => {
      const s = STICKER_SERVICES.find((x) => x.id === id)!;
      expect({ size: s.size, type: s.type, maxBytes: s.maxBytes }).toEqual(want);
    });
  }
  it('says the same numbers in the help topic', () => {
    const t = stickerTable();
    for (const s of STICKER_SERVICES) expect(t).toContain(`| ${s.title} | ${s.size} x ${s.size} | ${s.type === 'webp' ? 'WebP' : 'PNG'} | ${kilobytes(s.maxBytes)} |`);
    expect(bodies['export-stickers']).toContain(t);
    expect(bodies['export-stickers']).toContain('| WhatsApp sticker | 512 x 512 | WebP | 100 KB |');
  });
});
