import { describe, expect, it } from 'vitest';
import { frameAt, parseSheet, poseAt, resolveAnim, scaleFor, toBeats, totalMs } from '../../src/ui/mascot/timing';
import { stepScript, talkFor } from '../../src/ui/mascot/scripts';
import { quillFor } from '../../src/ui/toast';
import { FAKE_SHEET as S } from '../fixtures/quill-sheet';

describe('Quill sheet', () => {
  it('reads a good sheet and refuses broken ones', () => {
    expect(parseSheet(JSON.parse(JSON.stringify(S)))?.anims.wave.frames).toHaveLength(4);
    expect(parseSheet(null)).toBeNull();
    expect(parseSheet({ frameW: 0, frameH: 32, anims: S.anims })).toBeNull();
    expect(parseSheet({ frameW: 32, frameH: 32, anims: {} })).toBeNull();
    // A broken anim is dropped, the rest stay.
    const p = parseSheet({ frameW: 32, frameH: 32, anims: { idle: S.anims.idle, bad: { frames: [{ x: 0, y: 0, ms: 0 }] } } });
    expect(Object.keys(p!.anims)).toEqual(['idle']);
  });

  it('falls back to idle for a missing anim, and idle turns to sleep when bored', () => {
    const only = { ...S, anims: { idle: S.anims.idle } };
    expect(resolveAnim(only, 'wave')).toBe('idle');
    expect(resolveAnim(S, 'idle', true)).toBe('sleep');
    expect(resolveAnim(S, 'wave', true)).toBe('wave');
    expect(resolveAnim(only, 'idle', true)).toBe('idle');
  });

  it('scales by whole numbers, shrinking smoothly only below one frame', () => {
    expect(scaleFor(32, 96)).toBe(3);
    expect(scaleFor(32, 100)).toBe(3);
    expect(scaleFor(32, 32)).toBe(1);
    expect(scaleFor(32, 16)).toBe(0.5);
  });
});

describe('frame at a time', () => {
  it('follows each frame time', () => {
    const idle = S.anims.idle;
    expect(frameAt(idle, 0)).toEqual({ index: 0, next: 400, done: false });
    expect(frameAt(idle, 399).index).toBe(0);
    expect(frameAt(idle, 400)).toEqual({ index: 1, next: 200, done: false });
    expect(frameAt(idle, 650).index).toBe(2);
  });

  it('loops wrap round forever', () => {
    const idle = S.anims.idle;
    expect(totalMs(idle)).toBe(1000);
    expect(frameAt(idle, 1000).index).toBe(0);
    expect(frameAt(idle, 10_450).index).toBe(1);
    expect(frameAt(idle, 10_450).done).toBe(false);
  });

  it('one-shots stop on the last frame and say they are done', () => {
    const wave = S.anims.wave;
    expect(frameAt(wave, 399)).toEqual({ index: 3, next: 1, done: false });
    expect(frameAt(wave, 400)).toEqual({ index: 3, next: Infinity, done: true });
    expect(frameAt(wave, 5000).index).toBe(3);
  });

  it('a hold ends a loop, and keeps a one-shot on its last frame', () => {
    expect(frameAt(S.anims.talk, 500, 1000).done).toBe(false);
    expect(frameAt(S.anims.talk, 1000, 1000).done).toBe(true);
    expect(frameAt(S.anims.wave, 450, 1000)).toMatchObject({ index: 3, done: false });
    // The next change is the hold running out.
    expect(frameAt(S.anims.talk, 990, 1000).next).toBe(10);
  });
});

describe('scripts and fallbacks', () => {
  it('a one-shot falls back to `then`', () => {
    const beats = toBeats('wave', 'idle');
    expect(poseAt(S, beats, 50)).toMatchObject({ anim: 'wave', beat: 0, done: false });
    expect(poseAt(S, beats, 399).anim).toBe('wave');
    const after = poseAt(S, beats, 400);
    expect(after).toMatchObject({ anim: 'idle', beat: 1, done: false });
    expect(after.frame).toEqual(S.anims.idle.frames[0]);
    // Idle loops on and never finishes.
    expect(poseAt(S, beats, 100_000).done).toBe(false);
  });

  it('a looping anim with something after it plays once through', () => {
    const loopy = { ...S, anims: { ...S.anims, wave: { ...S.anims.wave, loop: true } } };
    expect(poseAt(loopy, toBeats('wave', 'idle'), 350).anim).toBe('wave');
    expect(poseAt(loopy, toBeats('wave', 'idle'), 420).anim).toBe('idle');
    expect(poseAt(loopy, toBeats('wave'), 5000)).toMatchObject({ anim: 'wave', done: false });
  });

  it('without `then` a one-shot is done and stays on its last frame', () => {
    const p = poseAt(S, toBeats('oops'), 5000);
    expect(p).toMatchObject({ anim: 'oops', done: true, next: Infinity });
    expect(p.frame).toEqual(S.anims.oops.frames[1]);
  });

  it('plays beats in order with their holds', () => {
    const beats = stepScript('Draw a circle', { pointing: true });
    const talk = talkFor('Draw a circle');
    expect(beats.map((b) => b.anim)).toEqual(['talk', 'point', 'idle']);
    expect(poseAt(S, beats, 10).anim).toBe('talk');
    expect(poseAt(S, beats, talk + 10).anim).toBe('point');
    expect(poseAt(S, beats, talk + 2400 + 10).anim).toBe('idle');
  });

  it('only the resting idle at the end dozes off', () => {
    const beats = toBeats('wave', 'idle');
    expect(poseAt(S, beats, 50, { sleepy: true }).anim).toBe('wave');
    expect(poseAt(S, beats, 500, { sleepy: true }).anim).toBe('sleep');
  });

  it('cheers first when the last step was just done, and points again for a hint', () => {
    expect(stepScript('x', { cheer: true }).map((b) => b.anim)).toEqual(['cheer', 'talk', 'idle']);
    expect(stepScript('x', { hint: true, pointing: true }).map((b) => b.anim)).toEqual(['point', 'idle']);
    expect(talkFor('')).toBe(1200);
    expect(talkFor('x'.repeat(1000))).toBe(4500);
  });
});

describe('less motion', () => {
  it('shows a still first frame, and still moves on to `then`', () => {
    const beats = toBeats('wave', 'idle');
    const a = poseAt(S, beats, 250, { still: true });
    expect(a).toMatchObject({ anim: 'wave', done: false });
    expect(a.frame).toEqual(S.anims.wave.frames[0]);
    // Nothing changes until the wave would have ended.
    expect(a.next).toBe(150);
    const b = poseAt(S, beats, 450, { still: true });
    expect(b.anim).toBe('idle');
    expect(b.frame).toEqual(S.anims.idle.frames[0]);
    expect(b.next).toBe(Infinity);
    expect(poseAt(S, beats, 1250, { still: true }).frame).toEqual(S.anims.idle.frames[0]);
  });
});

describe('toasts', () => {
  it('only refusals and errors get an oops', () => {
    expect(quillFor('warn')).toBe('oops');
    expect(quillFor('error')).toBe('oops');
    expect(quillFor('info')).toBeNull();
    expect(quillFor('success')).toBeNull();
  });
});
