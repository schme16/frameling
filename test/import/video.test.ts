import { describe, expect, it } from 'vitest';
import { DEFAULT_SIDE, estimateBytes, foundSummary, frameCount, frameCountUncapped, frameSize, frameTimes, landingFrames, lastHold, MAX_VIDEO_FRAMES, secondsText, sizeWarning, tidyRequest, videoReport, VIDEO_EXT, type VideoFacts, type VideoRequest } from '../../src/import/video/plan';

const facts: VideoFacts = { name: 'walk.mp4', duration: 10, width: 1920, height: 1080, fps: 30, hasSound: true };
const req: VideoRequest = { start: 2, end: 4, rate: 12, side: 1280, as: 'reference' };

describe('how many pictures a stretch makes', () => {
  it('counts a stretch at a rate, at least one and never past the limit', () => {
    expect(frameCount(2, 4, 12)).toBe(24);
    expect(frameCount(0, 0.01, 12)).toBe(1);
    expect(frameCount(4, 2, 12)).toBe(0);
    expect(frameCount(0, 600, 60)).toBe(MAX_VIDEO_FRAMES);
    expect(frameCountUncapped(0, 600, 60)).toBe(36000);
  });
  it('takes pictures at even moments from the start of the stretch', () => {
    expect(frameTimes(1, 2, 4)).toEqual([1, 1.25, 1.5, 1.75]);
  });
  it('shrinks to the longest side and never grows', () => {
    expect(frameSize(1920, 1080, 960)).toEqual({ width: 960, height: 540 });
    expect(frameSize(640, 480, 1280)).toEqual({ width: 640, height: 480 });
    expect(frameSize(1080, 1920, 320)).toEqual({ width: 180, height: 320 });
  });
  it('puts each picture on the frame its moment falls on, from the frame you are on', () => {
    expect(landingFrames([2, 2 + 1 / 12, 2 + 2 / 12], 2, 24, 5)).toEqual([5, 7, 9]);
    expect(landingFrames([0, 0.25, 0.5], 0, 12, 0)).toEqual([0, 3, 6]);
    expect(lastHold(12, 24)).toBe(2);
    expect(lastHold(30, 24)).toBe(1);
  });
});

describe('what it says before it does anything', () => {
  it('says what was found, how many pictures that makes, and what is left out', () => {
    const s = foundSummary(facts, req);
    expect(s.found).toBe('10 seconds of video, 1920 x 1080, 30 pictures a second. That stretch makes 24 pictures of 1280 x 720.');
    expect(s.left.join(' ')).toMatch(/The sound/);
    expect(s.notes.join(' ')).toMatch(/smaller than the video \(1920 x 1080\)/);
  });
  it('names the pictures past the limit, and a rate faster than the video', () => {
    const s = foundSummary({ ...facts, hasSound: false, duration: 600 }, { ...req, start: 0, end: 600, rate: 60 });
    expect(s.left).toEqual([`${36000 - MAX_VIDEO_FRAMES} pictures past the limit of ${MAX_VIDEO_FRAMES}. Pick a shorter stretch or fewer pictures a second to get them.`]);
    expect(s.notes.join(' ')).toMatch(/only has 30 pictures a second/);
  });
  it('warns when it would be a lot to hold, differently for a reference and pixel frames', () => {
    expect(sizeWarning(24, 1280, 720, 'reference')).toBeNull();
    expect(sizeWarning(1000, 1920, 1080, 'reference')).toMatch(/adds about 593 MB to your file/);
    expect(sizeWarning(1000, 640, 360, 'pixel')).toMatch(/may make Frameling slow/);
    expect(estimateBytes(10, 100, 100, 'pixel')).toBe(400000);
  });
  it('reports what came in', () => {
    const r = videoReport('walk', 24, req, { width: 1280, height: 720 }, ['x'], ['y'], 'Added');
    expect(r.headline).toBe('Added "walk": 24 pictures on a reference layer, from 2 seconds to 4 seconds.');
    expect(videoReport('walk', 24, { ...req, as: 'pixel' }, { width: 320, height: 180 }, [], [], 'Opened').headline).toBe('Opened "walk": 24 frames of 320 x 180, from 2 seconds to 4 seconds.');
    expect(r).toMatchObject({ left: ['x'], info: ['y'] });
  });
  it('says seconds the way a person would', () => {
    expect(secondsText(1)).toBe('1 second');
    expect(secondsText(2.449)).toBe('2.4 seconds');
    expect(secondsText(65)).toBe('1 minute 5 seconds');
  });
});

describe('a request kept inside the video', () => {
  it('pulls the start and end inside it and the rate and size into range', () => {
    expect(tidyRequest({ start: -3, end: 99, rate: 500, side: 99999, as: 'pixel' }, 10)).toEqual({ start: 0, end: 10, rate: 120, side: 2560, as: 'pixel' });
    const t = tidyRequest({ start: 9, end: 2, rate: 0, side: NaN, as: 'reference' }, 10);
    expect(t.end).toBeGreaterThan(t.start);
    expect(t.side).toBe(DEFAULT_SIDE);
    expect(t.rate).toBe(1);
  });
  it('knows a video by its name', () => {
    expect(VIDEO_EXT.test('Clip.MP4')).toBe(true);
    expect(VIDEO_EXT.test('a.png')).toBe(false);
  });
});
