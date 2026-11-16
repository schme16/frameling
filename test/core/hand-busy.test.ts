import { describe, it, expect, beforeEach } from 'vitest';
import { handIsBusy, setHandBusy, whenHandIsFree, resetHandBusy } from '../../src/core/handBusy';

describe('a hand on the canvas', () => {
  beforeEach(() => resetHandBusy());

  it('starts free', () => {
    expect(handIsBusy()).toBe(false);
  });

  it('runs the job straight away when nothing is happening', () => {
    let ran = 0;
    whenHandIsFree(() => ran++);
    expect(ran).toBe(1);
  });

  it('holds the job until the gesture ends', () => {
    setHandBusy(true);
    let ran = 0;
    whenHandIsFree(() => ran++);
    expect(ran).toBe(0);
    setHandBusy(false);
    expect(ran).toBe(1);
  });

  it('runs every waiting job once, and only once', () => {
    setHandBusy(true);
    let a = 0;
    let b = 0;
    whenHandIsFree(() => a++);
    whenHandIsFree(() => b++);
    setHandBusy(false);
    expect([a, b]).toEqual([1, 1]);
    setHandBusy(true);
    setHandBusy(false);
    expect([a, b]).toEqual([1, 1]);
  });

  it('a job added while the waiting ones run waits for the next release, not this one', () => {
    setHandBusy(true);
    const seen: string[] = [];
    whenHandIsFree(() => {
      seen.push('first');
      setHandBusy(true);
      whenHandIsFree(() => seen.push('second'));
    });
    setHandBusy(false);
    expect(seen).toEqual(['first']);
    setHandBusy(false);
    expect(seen).toEqual(['first', 'second']);
  });

  it('saying busy twice is not two gestures', () => {
    setHandBusy(true);
    setHandBusy(true);
    let ran = 0;
    whenHandIsFree(() => ran++);
    setHandBusy(false);
    expect(ran).toBe(1);
  });
});
