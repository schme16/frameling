import { describe, expect, it } from 'vitest';
import { celParts, frameAtX, frameText, holdWords, labelStep, seconds, visibleFrames, zoomScroll } from '../../src/timeline/geometry';

describe('timeline geometry', () => {
  it('finds the frame under a pixel', () => {
    expect(frameAtX(0, 20)).toBe(0);
    expect(frameAtX(39.9, 20)).toBe(1);
    expect(frameAtX(-30, 20)).toBe(0);
    expect(frameAtX(1000, 20, 23)).toBe(23);
  });
  it('only draws what is on screen, plus a little spare', () => {
    expect(visibleFrames(0, 200, 20, 2)).toEqual({ from: 0, to: 12 });
    expect(visibleFrames(2000, 200, 20, 2)).toEqual({ from: 98, to: 112 });
  });
  it('spaces ruler numbers by zoom', () => {
    expect(labelStep(22)).toBe(5);
    expect(labelStep(12)).toBe(10);
    expect(labelStep(8)).toBe(20);
    expect(labelStep(5)).toBe(50);
  });
  it('keeps the frame under the pointer fixed when zooming', () => {
    const next = zoomScroll(400, 100, 20, 40);
    expect((next + 100) / 40).toBeCloseTo((400 + 100) / 20);
    expect(zoomScroll(0, 0, 20, 10)).toBe(0);
  });
  it('writes frames for people', () => {
    expect(frameText(0, 24)).toBe('1 / 24');
    expect(seconds(6, 12)).toBe('0.50');
    expect(holdWords(2)).toBe('2 frames (on twos)');
    expect(holdWords(1)).toBe('1 frame (on ones)');
    expect(holdWords(7)).toBe('7 frames');
    expect(celParts(3)).toEqual({ key: 1, hold: 2 });
  });
});
