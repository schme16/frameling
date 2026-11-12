import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStore } from '../../src/core/store';
import * as pb from '../../src/timeline/playback';
import { setTl } from '../../src/timeline/state';
import * as ops from '../../src/timeline/ops';
import { docWith } from './helpers';

/** A clock we advance by hand, so every tick lands exactly where the test says. */
function manual() {
  let t = 1000;
  let cb: ((n: number) => void) | null = null;
  pb.setScheduler({
    now: () => t,
    request: (fn) => ((cb = fn), 1),
    cancel: () => void (cb = null),
  });
  return {
    advance(ms: number) {
      t += ms;
      const f = cb;
      cb = null;
      f?.(t);
    },
    /** Many small ticks, like real animation frames. */
    run(ms: number) {
      for (let left = ms; left > 0; left -= 20) this.advance(Math.min(20, left));
    },
    pending: () => cb !== null,
  };
}

let off: () => void = () => {};
beforeEach(() => setTl({ clipId: null }));
afterEach(() => {
  off();
  pb.setScheduler(null);
  vi.useRealTimers();
});

function start(length = 12, fps = 10) {
  const doc = docWith([[0, 1]], length);
  doc.fps = fps;
  const s = resetStore(doc);
  off = pb.installPlayback(s);
  return s;
}

describe('stepping', () => {
  it('steps and clamps to the animation', () => {
    const s = start(5);
    pb.stepFrame(2);
    expect(s.get().ui.frame).toBe(2);
    pb.stepFrame(-9);
    expect(s.get().ui.frame).toBe(0);
    pb.stepFrame(99);
    expect(s.get().ui.frame).toBe(4);
    pb.firstFrame();
    expect(s.get().ui.frame).toBe(0);
    pb.lastFrame();
    expect(s.get().ui.frame).toBe(4);
  });
  it('jumps between keys on the active layer', () => {
    const s = resetStore(docWith([[1, 2], [5, 1], [9, 3]], 12));
    pb.goTo(6);
    expect(pb.stepKey('prev')).toBe(true);
    expect(s.get().ui.frame).toBe(5);
    expect(pb.stepKey('prev')).toBe(true);
    expect(s.get().ui.frame).toBe(1);
    expect(pb.stepKey('prev')).toBe(false);
    pb.goTo(2);
    expect(pb.stepKey('next')).toBe(true);
    expect(s.get().ui.frame).toBe(5);
    pb.goTo(10);
    expect(pb.stepKey('next')).toBe(false);
  });
  it('stepping while playing stops playback', () => {
    const s = start();
    const clock = manual();
    pb.play();
    expect(s.get().ui.playing).toBe(true);
    clock.advance(0);
    pb.stepFrame(1);
    expect(s.get().ui.playing).toBe(false);
    expect(clock.pending()).toBe(false);
  });
});

describe('playing', () => {
  it('advances at the document frame rate', () => {
    const s = start(12, 10);
    const clock = manual();
    pb.play();
    clock.advance(50);
    expect(s.get().ui.frame).toBe(0);
    clock.advance(60);
    expect(s.get().ui.frame).toBe(1);
    clock.advance(100);
    expect(s.get().ui.frame).toBe(2);
    clock.advance(300);
    expect(s.get().ui.frame).toBe(5);
  });
  it('drops frames instead of drifting when ticks are late', () => {
    const s = start(100, 10);
    const clock = manual();
    pb.play();
    clock.advance(400); // four frames of time in one tick
    expect(s.get().ui.frame).toBe(4);
    clock.advance(16);
    clock.advance(16);
    clock.advance(16);
    clock.advance(16);
    clock.advance(16);
    clock.advance(16); // 400 + 96 = 496ms: still frame 4
    expect(s.get().ui.frame).toBe(4);
    clock.advance(4);
    expect(s.get().ui.frame).toBe(5); // 500ms
  });
  it('follows fps', () => {
    const s = start(100, 24);
    const clock = manual();
    pb.play();
    clock.run(1000);
    expect(s.get().ui.frame).toBe(24);
  });
  it('loops back to the start', () => {
    const s = start(4, 10);
    const clock = manual();
    pb.play();
    clock.advance(350);
    expect(s.get().ui.frame).toBe(3);
    clock.advance(100); // 450ms = frame 4 = back to 0
    expect(s.get().ui.frame).toBe(0);
    expect(s.get().ui.playing).toBe(true);
    clock.run(1000); // 1450ms: 14 % 4 = 2
    expect(s.get().ui.frame).toBe(2);
  });
  it('stops on the last frame when looping is off, and restarts from the top next time', () => {
    const s = start(4, 10);
    s.setUi({ loopPlayback: false });
    const clock = manual();
    pb.play();
    clock.run(500);
    expect(s.get().ui.frame).toBe(3);
    expect(s.get().ui.playing).toBe(false);
    expect(clock.pending()).toBe(false);
    pb.play();
    expect(s.get().ui.frame).toBe(0);
    expect(s.get().ui.playing).toBe(true);
  });
  it('starts from the current frame', () => {
    const s = start(12, 10);
    pb.goTo(6);
    const clock = manual();
    pb.play();
    clock.advance(200);
    expect(s.get().ui.frame).toBe(8);
  });
  it('pause stops the loop and keeps the frame', () => {
    const s = start();
    const clock = manual();
    pb.play();
    clock.advance(250);
    pb.pause();
    expect(s.get().ui.frame).toBe(2);
    expect(clock.pending()).toBe(false);
    clock.advance(1000);
    expect(s.get().ui.frame).toBe(2);
  });
  it('toggle flips', () => {
    const s = start();
    manual();
    pb.togglePlay();
    expect(s.get().ui.playing).toBe(true);
    pb.togglePlay();
    expect(s.get().ui.playing).toBe(false);
  });
  it('carries on from where you scrub to', () => {
    const s = start(50, 10);
    const clock = manual();
    pb.play();
    clock.advance(300);
    s.setUi({ frame: 20 });
    clock.advance(100);
    expect(s.get().ui.frame).toBe(20);
    clock.advance(100);
    expect(s.get().ui.frame).toBe(21);
  });
  it('treats a long stall as a pause, not a jump', () => {
    const s = start(100, 10);
    const clock = manual();
    pb.play();
    clock.advance(200);
    clock.advance(60000);
    expect(s.get().ui.frame).toBe(2);
    clock.advance(100);
    expect(s.get().ui.frame).toBe(3);
  });
  it('stops on any edit', () => {
    const s = start(12, 10);
    const clock = manual();
    pb.play();
    clock.advance(150);
    ops.newBlankKey(undefined, 5);
    expect(s.get().ui.playing).toBe(false);
    expect(clock.pending()).toBe(false);
  });
});

describe('play range', () => {
  it('plays only the chosen clip', () => {
    const s = start(24, 10);
    const id = ops.addClip(4, 7, 'Walk').id!;
    setTl({ clipId: id });
    const clock = manual();
    pb.play();
    expect(s.get().ui.frame).toBe(4);
    clock.advance(300);
    expect(s.get().ui.frame).toBe(7);
    clock.advance(100); // wraps to the clip start
    expect(s.get().ui.frame).toBe(4);
    pb.firstFrame();
    expect(s.get().ui.frame).toBe(4);
    pb.lastFrame();
    expect(s.get().ui.frame).toBe(7);
  });
  it('a clip that does not loop stops at its end even with loop on', () => {
    const s = start(24, 10);
    const id = ops.addClip(2, 4, 'Jump').id!;
    ops.setClipLoop(id, false);
    setTl({ clipId: id });
    const clock = manual();
    pb.play();
    clock.run(1000);
    expect(s.get().ui.frame).toBe(4);
    expect(s.get().ui.playing).toBe(false);
  });
  it('plays the whole animation when no clip is picked, or the picked one is gone', () => {
    const s = start(8, 10);
    expect(pb.playRange(s.get().doc)).toMatchObject({ start: 0, end: 7 });
    setTl({ clipId: 'gone' });
    expect(pb.playRange(s.get().doc)).toMatchObject({ start: 0, end: 7 });
  });
  it('a frame outside the clip starts at the clip', () => {
    const s = start(24, 10);
    setTl({ clipId: ops.addClip(10, 12).id! });
    pb.goTo(2);
    manual();
    pb.play();
    expect(s.get().ui.frame).toBe(10);
  });
});

describe('with the real timer fallback', () => {
  it('keeps time under fake timers', () => {
    vi.useFakeTimers();
    const s = start(100, 10);
    pb.setScheduler(null);
    pb.play();
    vi.advanceTimersByTime(1000);
    // timers tick every 16ms, so a whole second lands on frame 9 or 10 depending on the clock rounding
    expect(s.get().ui.frame).toBeGreaterThanOrEqual(9);
    expect(s.get().ui.frame).toBeLessThanOrEqual(10);
    pb.pause();
    const at = s.get().ui.frame;
    vi.advanceTimersByTime(1000);
    expect(s.get().ui.frame).toBe(at);
  });
});

describe('a clip with a direction and a repeat count', () => {
  /** The frames shown at each of `n` ticks after pressing play, one frame per tick (fps 10, 100 ms steps). */
  function shown(s: ReturnType<typeof start>, n: number) {
    const clock = manual();
    const out = [s.get().ui.frame];
    pb.play();
    out[0] = s.get().ui.frame;
    for (let i = 1; i < n; i++) {
      clock.advance(100);
      out.push(s.get().ui.frame);
    }
    return out;
  }
  it('plays backward from its last frame', () => {
    const s = start(12, 10);
    const id = ops.addClip(2, 5, 'Back').id!;
    ops.setClipDirection(id, 'reverse');
    setTl({ clipId: id });
    expect(shown(s, 5)).toEqual([5, 4, 3, 2, 5]);
  });
  it('plays back and forth, each end once per turn', () => {
    const s = start(12, 10);
    const id = ops.addClip(2, 5, 'Bounce').id!;
    ops.setClipDirection(id, 'pingpong');
    setTl({ clipId: id });
    expect(shown(s, 9)).toEqual([2, 3, 4, 5, 4, 3, 2, 3, 4]);
  });
  it('plays from the end first when it goes back and forth from the end', () => {
    const s = start(12, 10);
    const id = ops.addClip(2, 5, 'Bounce').id!;
    ops.setClipDirection(id, 'pingpong-reverse');
    setTl({ clipId: id });
    expect(shown(s, 8)).toEqual([5, 4, 3, 2, 3, 4, 5, 4]);
  });
  it('plays N times and holds the last frame', () => {
    const s = start(12, 10);
    const id = ops.addClip(2, 3, 'Thrice').id!;
    ops.setClipRepeat(id, 3);
    setTl({ clipId: id });
    const clock = manual();
    pb.play();
    const out = [s.get().ui.frame];
    for (let i = 0; i < 5; i++) {
      clock.advance(100);
      out.push(s.get().ui.frame);
    }
    expect(out).toEqual([2, 3, 2, 3, 2, 3]);
    expect(s.get().ui.playing).toBe(true);
    clock.advance(100);
    expect(s.get().ui.frame).toBe(3);
    expect(s.get().ui.playing).toBe(false);
  });
  it('a backward clip that plays once holds its first frame and starts again from its end', () => {
    const s = start(12, 10);
    const id = ops.addClip(2, 4, 'Back').id!;
    ops.setClipDirection(id, 'reverse');
    ops.setClipRepeat(id, 1);
    setTl({ clipId: id });
    const clock = manual();
    pb.play();
    clock.run(1000);
    expect(s.get().ui.frame).toBe(2);
    expect(s.get().ui.playing).toBe(false);
    pb.play();
    expect(s.get().ui.frame).toBe(4);
  });
  it('the clip repeat count wins over the loop switch, and forever follows it', () => {
    const s = start(12, 10);
    s.setUi({ loopPlayback: false });
    const id = ops.addClip(2, 3, 'Twice').id!;
    ops.setClipRepeat(id, 2);
    setTl({ clipId: id });
    const clock = manual();
    pb.play();
    clock.run(300);
    expect(s.get().ui.playing).toBe(true);
    clock.run(300);
    expect(s.get().ui.playing).toBe(false);
    ops.setClipRepeat(id, 'forever');
    pb.play();
    clock.run(1000);
    expect(s.get().ui.playing).toBe(false);
  });
  it('the toolbar switch plays a clip with no direction back and forth; a clip with its own direction goes its own way', () => {
    const s = start(12, 10);
    s.setUi({ pingPong: true });
    const id = ops.addClip(2, 4, 'Plain').id!;
    setTl({ clipId: id });
    expect(pb.upcomingFrames(s.get().doc, 4, 2, true, id, true)).toEqual([3, 2]);
    ops.setClipDirection(id, 'reverse');
    expect(pb.upcomingFrames(s.get().doc, 4, 2, true, id, true)).toEqual([3, 2]);
  });
  it('tells listeners each time a loop comes round', () => {
    const s = start(12, 10);
    const id = ops.addClip(2, 4, 'Loop').id!;
    ops.setClipDirection(id, 'reverse');
    setTl({ clipId: id });
    let rounds = 0;
    const off2 = pb.onPlayPass(() => rounds++);
    const clock = manual();
    pb.play();
    clock.run(1000);
    off2();
    expect(rounds).toBe(3);
  });
  it('looks ahead the way it plays', () => {
    const s = start(12, 10);
    const id = ops.addClip(2, 5, 'Bounce').id!;
    ops.setClipDirection(id, 'reverse');
    expect(pb.upcomingFrames(s.get().doc, 4, 3, true, id)).toEqual([3, 2, 5]);
  });
});
