import { describe, expect, it } from 'vitest';
import { isOgg, oggCodec, playableKinds, soundProblem } from '../../src/audio/problem';

const ogg = (codec: 'vorbis' | 'opus') => {
  const b = new Uint8Array(128);
  b.set([0x4f, 0x67, 0x67, 0x53]);
  b.set([...(codec === 'opus' ? 'OpusHead' : '\u0001vorbis')].map((c) => c.charCodeAt(0)), 28);
  return b;
};
const safari = (t: string) => !/ogg/.test(t);
const chrome = () => true;

describe('telling an OGG file apart', () => {
  it('knows OGG by its first bytes and which sound it carries', () => {
    expect(isOgg(ogg('vorbis'))).toBe(true);
    expect(isOgg(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0]))).toBe(false);
    expect(isOgg(new Uint8Array([]))).toBe(false);
    expect(oggCodec(ogg('opus'))).toBe('opus');
    expect(oggCodec(ogg('vorbis'))).toBe('vorbis');
  });
});

describe('what to say when a sound cannot be read', () => {
  it('a browser that cannot play OGG (older Safari) gets a kind message of its own naming a way out', () => {
    const m = soundProblem(ogg('vorbis'), safari);
    expect(m).toMatch(/can't open OGG sound files/);
    expect(m).toMatch(/Safari/);
    expect(m).toMatch(/MP3, M4A or WAV/);
  });
  it('checks the sound the file really has: an Opus file in a browser that plays Vorbis only is also refused', () => {
    expect(soundProblem(ogg('opus'), (t) => t.includes('vorbis'))).toMatch(/can't open OGG/);
    expect(soundProblem(ogg('vorbis'), (t) => t.includes('vorbis'))).not.toMatch(/can't open OGG/);
  });
  it('an OGG that a capable browser still cannot read is called damaged, not unsupported', () => {
    expect(soundProblem(ogg('vorbis'), chrome)).toMatch(/may be damaged/);
  });
  it('lists only the kinds that open here', () => {
    expect(playableKinds(chrome)).toBe('WAV, MP3, M4A, OGG and FLAC');
    expect(playableKinds(safari)).toBe('WAV, MP3, M4A and FLAC');
    expect(playableKinds((t) => t === 'audio/wav')).toBe('WAV, MP3 and M4A');
    expect(soundProblem(new Uint8Array([1, 2, 3, 4, 5]), safari)).toBe("That file couldn't be read as a sound. It may be damaged. WAV, MP3, M4A and FLAC files work here.");
  });
  it('has no dashes in what people read', () => {
    for (const m of [soundProblem(ogg('vorbis'), safari), soundProblem(new Uint8Array(8), chrome)]) expect(m).not.toMatch(/[–—]/);
  });
});
