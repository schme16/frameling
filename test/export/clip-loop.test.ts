// A GIF, APNG or animated SVG of a clip repeats the way the clip plays, unless the loop box was set by hand.
import { describe, expect, it } from 'vitest';
import { clipLoopWords, defaultSettings, exportLoop, planExport } from '../../src/export/plan';
import { docWith } from '../timeline/helpers';

const doc = docWith([[0, 5]], 6);
doc.clips.push(
  { id: 'fe', name: 'idle', start: 0, end: 2, loop: true },
  { id: 'n3', name: 'thrice', start: 0, end: 1, loop: false, repeat: 3 },
  { id: 'one', name: 'hit', start: 2, end: 4, loop: false },
  { id: 'pp', name: 'swing', start: 1, end: 3, loop: true, direction: 'pingpong' },
);
const s = (format: 'gif' | 'apng' | 'svganim' | 'mp4' | 'pngseq', clipId: string | null, extra = {}) => ({ ...defaultSettings(doc), format, range: clipId ? ('clip' as const) : ('all' as const), clipId, ...extra });

describe('the loop setting follows the clip', () => {
  it('loops for ever when the clip loops, and stops when it plays N times or once', () => {
    for (const f of ['gif', 'apng', 'svganim'] as const) {
      expect(planExport(doc, s(f, 'fe'), 0)).toMatchObject({ loop: true, loopFromClip: true });
      expect(planExport(doc, s(f, 'n3'), 0)).toMatchObject({ loop: false, loopFromClip: true });
      expect(planExport(doc, s(f, 'one'), 0)).toMatchObject({ loop: false, loopFromClip: true });
    }
  });

  it('a looping back and forth clip loops one trip for ever', () => {
    const p = planExport(doc, s('gif', 'pp'), 0);
    expect(p.loop).toBe(true);
    expect(p.order).toEqual([0, 1, 2, 1]);
  });

  it('a clip that plays 3 times bakes 3 passes and then stops', () => {
    const p = planExport(doc, s('apng', 'n3'), 0);
    expect(p.order).toEqual([0, 1, 0, 1, 0, 1]);
    expect(p.loop).toBe(false);
  });

  it('leaves the box alone when the whole animation or a still format is exported', () => {
    expect(planExport(doc, s('gif', null), 0)).toMatchObject({ loop: true, loopFromClip: false });
    expect(planExport(doc, s('gif', null, { loop: false }), 0)).toMatchObject({ loop: false, loopFromClip: false });
    expect(planExport(doc, s('mp4', 'n3'), 0).loopFromClip).toBe(false);
  });

  it('a loop set by hand wins over the clip, both ways', () => {
    expect(exportLoop(doc, s('gif', 'n3', { loop: true, loopTouched: true }))).toEqual({ loop: true, fromClip: false });
    expect(exportLoop(doc, s('gif', 'fe', { loop: false, loopTouched: true }))).toEqual({ loop: false, fromClip: false });
    expect(planExport(doc, s('gif', 'n3', { loop: true, loopTouched: true }), 0).loop).toBe(true);
  });

  it('says what the clip does in plain words', () => {
    expect(clipLoopWords(doc, s('gif', 'fe'))).toEqual({ name: 'idle', plays: 'loops for ever' });
    expect(clipLoopWords(doc, s('gif', 'n3'))).toEqual({ name: 'thrice', plays: 'plays 3 times' });
    expect(clipLoopWords(doc, s('gif', 'one'))).toEqual({ name: 'hit', plays: 'plays once' });
    expect(clipLoopWords(doc, s('gif', null))).toBeNull();
    expect(clipLoopWords(doc, s('mp4', 'n3'))).toBeNull();
  });
});
