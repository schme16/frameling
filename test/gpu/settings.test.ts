// @vitest-environment jsdom
// The performance settings: what is kept, what a bad saved value turns into, the memory the layer cache really holds to,
// and the playback limit.
import { afterEach, describe, expect, it } from 'vitest';
import { BUDGET_PIXELS } from '../../src/canvas/pipeline';
import { DEFAULT_PERF, PERF_KEY, budgetPixels, cachePixels, capEffect, cleanPerf, frameDue, getPerf, isDefaultPerf, resetPerf, roughNow, setPerf, setScrubbing } from '../../src/gpu/settings';

afterEach(() => {
  resetPerf();
  setScrubbing(false);
});

describe('saved settings', () => {
  it('start as the app always behaved', () => {
    expect(DEFAULT_PERF).toEqual({ cacheMb: 160, scrub: 'full', fpsCap: 0 });
    expect(cachePixels(DEFAULT_PERF.cacheMb)).toBe(BUDGET_PIXELS);
  });
  it('turn anything odd into the default', () => {
    expect(cleanPerf(null)).toEqual(DEFAULT_PERF);
    expect(cleanPerf({ cacheMb: 'lots', scrub: 'fast', fpsCap: 'x' })).toEqual(DEFAULT_PERF);
    expect(cleanPerf({ cacheMb: 99999, fpsCap: -5 })).toMatchObject({ cacheMb: 2048, fpsCap: 0 });
    expect(cleanPerf({ cacheMb: 1 }).cacheMb).toBe(40);
    expect(cleanPerf({ scrub: 'quick', fpsCap: 24.4 })).toMatchObject({ scrub: 'quick', fpsCap: 24 });
  });
  it('are written to storage and put back', () => {
    setPerf({ cacheMb: 320, scrub: 'quick', fpsCap: 12 });
    expect(JSON.parse(localStorage.getItem(PERF_KEY)!)).toEqual({ cacheMb: 320, scrub: 'quick', fpsCap: 12 });
    expect(isDefaultPerf()).toBe(false);
    resetPerf();
    expect(getPerf()).toEqual(DEFAULT_PERF);
    expect(isDefaultPerf()).toBe(true);
  });
});

describe('the memory for kept drawings', () => {
  it('is what the cache holds to', () => {
    expect(budgetPixels()).toBe(40_000_000);
    setPerf({ cacheMb: 80 });
    expect(budgetPixels()).toBe(20_000_000);
    setPerf({ cacheMb: 640 });
    expect(budgetPixels()).toBe(160_000_000);
  });
});

describe('quick scrubbing', () => {
  it('only leaves things out while a drag is under way, and only when it is on', () => {
    expect(roughNow()).toBe(false);
    setScrubbing(true);
    expect(roughNow()).toBe(false);
    setPerf({ scrub: 'quick' });
    expect(roughNow()).toBe(true);
    setScrubbing(false);
    expect(roughNow()).toBe(false);
  });
});

describe('the playback limit', () => {
  it('lets every frame through with no limit', () => {
    expect(frameDue(1000, 999, 0)).toBe(true);
  });
  it('holds a frame until its time is up', () => {
    expect(frameDue(1020, 1000, 12)).toBe(false);
    expect(frameDue(1084, 1000, 12)).toBe(true);
    // A 30 limit on a 60 Hz screen: every second refresh (33.3 ms), never every one (16.7 ms).
    expect(frameDue(1016.7, 1000, 30)).toBe(false);
    expect(frameDue(1033.4, 1000, 30)).toBe(true);
  });
  it('says what it does to this animation', () => {
    expect(capEffect(12, 24)).toBe('shows every other frame');
    expect(capEffect(15, 24)).toBe('shows about 15 of every 24 frames');
    expect(capEffect(30, 24)).toBe('changes nothing for this animation');
    expect(capEffect(0, 24)).toBe('changes nothing for this animation');
  });
});
