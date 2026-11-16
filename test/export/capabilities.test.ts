// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Which codecs this pretend computer can encode, and with see-through backgrounds.
const can = vi.hoisted(() => ({ plain: new Set<string>(), alpha: new Set<string>() }));
vi.mock('mediabunny', () => ({
  canEncodeVideo: async (codec: string, o: { alpha?: string }) => (o.alpha ? can.alpha.has(codec) : can.plain.has(codec)),
}));

import { _resetChoicesForTests, getChoiceDef, registerChoice, setChoice } from '../../src/core/choices';

async function load() {
  vi.resetModules();
  (globalThis as any).VideoEncoder = class {};
  // The module registers the choice when it loads; start each test from a clean slate of answers.
  return import('../../src/export/capabilities');
}

describe('WebM codec preference', () => {
  beforeEach(() => {
    can.plain = new Set(['avc', 'vp8', 'vp9', 'av1']);
    can.alpha = new Set(['vp9']);
    localStorage.clear();
  });

  it('registers a silent Export choice that defaults to AV1, with VP9 as the safe one', async () => {
    const m = await load();
    const choices = await import('../../src/core/choices');
    const def = choices.getChoiceDef('export.webmCodec')!;
    expect(def.silent).toBe(true);
    expect(def.category).toBe('Export');
    expect(def.default).toBe('av1');
    expect(def.options.map((o) => o.value)).toEqual(['av1', 'vp9']);
    expect(def.options.find((o) => o.value === 'av1')!.detail).toMatch(/Smaller files/);
    expect(def.options.find((o) => o.value === 'vp9')!.detail).toMatch(/older/);
    expect(m.webmOrder('av1')).toEqual(['av1', 'vp9', 'vp8']);
    expect(m.webmOrder('vp9')).toEqual(['vp9', 'av1', 'vp8']);
    expect(m.webmOrder('anything else')).toEqual(['vp9', 'av1', 'vp8']);
  });

  it('uses AV1 unless VP9 was picked, and still finds a codec for transparency', async () => {
    const m = await load();
    const c = await m.detectCapabilities(320, 240);
    expect(c.webm.codec).toBe('av1');
    expect(c.webm.ok).toBe(true);
    expect(c.webm.alpha).toBe(true);
    // A see-through background still goes out as VP9, because that is the one players understand with alpha.
    expect(c.webm.alphaCodec).toBe('vp9');
    expect(c.mp4.codec).toBe('avc');
  });

  it('never uses AV1 for a see-through background, even if it claims it can', async () => {
    can.alpha = new Set(['av1', 'vp9']);
    const choices = await import('../../src/core/choices');
    choices.setChoice('export.webmCodec', 'av1');
    const m = await load();
    const c = await m.detectCapabilities(320, 240);
    expect(c.webm.codec).toBe('av1');
    expect(c.webm.alphaCodec).toBe('vp9');
    can.alpha = new Set(['av1']);
    choices.setChoice('export.webmCodec', 'av1');
    const m2 = await load();
    const c2 = await m2.detectCapabilities(320, 240);
    expect(c2.webm.alpha).toBe(false);
    expect(c2.webm.alphaCodec).toBeNull();
  });

  it('falls back to VP9, then VP8, when AV1 is picked but cannot be encoded', async () => {
    const choices = await import('../../src/core/choices');
    choices.setChoice('export.webmCodec', 'av1');
    can.plain = new Set(['vp8', 'vp9']);
    let m = await load();
    expect((await m.detectCapabilities(320, 240)).webm.codec).toBe('vp9');
    can.plain = new Set(['vp8']);
    m = await load();
    const c = await m.detectCapabilities(320, 240);
    expect(c.webm.codec).toBe('vp8');
    expect(c.webm.alpha).toBe(false);
  });

  it('uses VP9 itself for transparency when it is the main codec', async () => {
    can.plain = new Set(['vp9']);
    const m = await load();
    const c = await m.detectCapabilities(320, 240);
    expect(c.webm.codec).toBe('vp9');
    expect(c.webm.alphaCodec).toBe('vp9');
  });

  it('says why when no WebM codec works', async () => {
    can.plain = new Set(['avc']);
    const m = await load();
    const c = await m.detectCapabilities(320, 240);
    expect(c.webm.ok).toBe(false);
    expect(c.webm.reason).toMatch(/WebM/);
  });

  it('uses VP9 when the person chose it, and re-probes after the choice changes', async () => {
    const m = await load();
    const choices = await import('../../src/core/choices');
    expect((await m.detectCapabilities(320, 240)).webm.codec).toBe('av1');
    choices.setChoice('export.webmCodec', 'vp9');
    expect((await m.detectCapabilities(320, 240)).webm.codec).toBe('vp9');
  });

  it('says what this computer cannot do, in plain words', async () => {
    can.plain = new Set();
    let m = await load();
    const c = await m.detectCapabilities(320, 240);
    expect(c.mp4.reason).toMatch(/^This computer can't make H\.264/);
    expect(c.webm.reason).toMatch(/^This computer can't make WebM/);
    m = await load();
    delete (globalThis as any).VideoEncoder;
    const none = await m.detectCapabilities(1, 1);
    expect(none.mp4.reason).toMatch(/^This computer's video encoder isn't available/);
  });

  it('says which codec this WebM is made with, and always what each one is for', async () => {
    const { webmCodecNote, WEBM_CODEC_WORDS } = await import('../../src/export/options/video');
    expect(webmCodecNote('vp9', null)).toBe('Making this one with VP9.');
    expect(webmCodecNote('av1', 'vp9')).toBe('Making this one with AV1 (VP9 for the see-through background).');
    expect(webmCodecNote('vp8', null)).toBe('Making this one with VP8.');
    expect(WEBM_CODEC_WORDS).toMatch(/VP9 plays almost everywhere/);
    expect(WEBM_CODEC_WORDS).toMatch(/AV1 makes smaller files, but some players and browsers cannot play it/);
  });

  it('is not tripped by the unused imports', () => {
    expect([_resetChoicesForTests, getChoiceDef, registerChoice, setChoice].every((f) => typeof f === 'function')).toBe(true);
  });
});
