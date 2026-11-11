// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { ALL_CUES, createLimiter, CUES, cueLength, synthCue, toWav } from '../../src/ui/sounds/synth';
import { cueWanted, resetSounds } from '../../src/ui/sounds';
import { DEFAULT_PREFS, migratePrefs, resetPrefs, setPrefs } from '../../src/ui/prefs';

beforeEach(() => {
  resetPrefs();
  resetSounds();
});

describe('the sounds', () => {
  it('every cue is short, soft and never clips', () => {
    for (const cue of ALL_CUES) {
      const s = synthCue(cue, 8000);
      expect(s.length, cue).toBeGreaterThan(0);
      expect(cueLength(cue), cue).toBeLessThan(2.5);
      let peak = 0;
      for (const v of s) peak = Math.max(peak, Math.abs(v));
      expect(peak, cue).toBeGreaterThan(0.01);
      expect(peak, cue).toBeLessThanOrEqual(1);
      // Ends in silence, so nothing clicks off.
      expect(Math.abs(s[s.length - 1]), cue).toBeLessThan(0.001);
    }
  });

  it('comes out the same every time', () => {
    expect(synthCue('tick', 8000)).toEqual(synthCue('tick', 8000));
  });

  it("Quill's goodbye goes down in pitch: a little sad", () => {
    const notes = CUES.goodbye.notes;
    for (let i = 1; i < notes.length; i++) expect(notes[i].hz).toBeLessThan(notes[i - 1].hz);
  });

  it('writes a playable WAV', () => {
    const w = toWav(new Float32Array([0, 0.5, -0.5]), 8000);
    expect(String.fromCharCode(...w.slice(0, 4))).toBe('RIFF');
    expect(w.length).toBe(44 + 6);
  });
});

describe('rate limits', () => {
  it('a held key does not buzz', () => {
    const allow = createLimiter();
    let n = 0;
    for (let t = 0; t < 1000; t += 16) if (allow('tick', t)) n++;
    expect(n).toBeLessThanOrEqual(Math.ceil(1000 / CUES.tick.gap));
    expect(n).toBeGreaterThan(5);
  });

  it('two different sounds do not land on top of each other', () => {
    const allow = createLimiter();
    expect(allow('refused', 0)).toBe(true);
    expect(allow('nothingToUndo', 10)).toBe(false);
    expect(allow('nothingToUndo', 100)).toBe(true);
  });
});

describe('when they play', () => {
  it('off by default, and nothing plays then', () => {
    expect(DEFAULT_PREFS.sounds).toBe(false);
    expect(cueWanted('step', 0)).toBe(false);
  });

  it('plays once turned on, unless the volume is all the way down', () => {
    setPrefs({ sounds: true });
    expect(cueWanted('step', 0)).toBe(true);
    setPrefs({ soundVolume: 0 });
    expect(cueWanted('step', 10_000)).toBe(false);
  });

  it('leaves out the just-for-fun tick when calm is asked for', () => {
    setPrefs({ sounds: true, reduceMotion: true });
    expect(cueWanted('tick', 0)).toBe(false);
    expect(cueWanted('refused', 0)).toBe(true);
  });

  it('keeps the volume between 0 and 1 when reading saved preferences', () => {
    expect(migratePrefs({ soundVolume: 4 }).soundVolume).toBe(1);
    expect(migratePrefs({ soundVolume: 'loud' }).soundVolume).toBe(DEFAULT_PREFS.soundVolume);
  });
});
