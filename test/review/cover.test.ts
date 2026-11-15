// A reviewer's name and words while you stream: covered unless your viewers see only the capture window. And the reviewer's
// own view maths, and what the link bar says.
import { describe, expect, it } from 'vitest';
import { COVERED_NAME, coverReviewers, coveredCount, streamingNow } from '../../src/livereview/cover';
import { ReviewBus, linkWords } from '../../src/popout/reviewBus';
import { MAX_ZOOM, MIN_ZOOM, NO_VIEW, viewRect, zoomedAbout } from '../../src/popout/show';
import { cleanReviewText, cleanReviewerName } from '../../src/audience/cleanText';

const quiet = { streamSafe: false, audienceOn: false, obsOnAir: false };

describe('covering a reviewer on stream', () => {
  it('shows plainly when you are not streaming at all', () => {
    expect(streamingNow(quiet)).toBe(false);
    expect(coverReviewers(quiet, undefined)).toBe(false);
    expect(coverReviewers(quiet, 'screen')).toBe(false);
  });
  it('covers when any of the three says you are streaming, and the answer is not "capture"', () => {
    for (const k of ['streamSafe', 'audienceOn', 'obsOnAir'] as const) {
      expect(coverReviewers({ ...quiet, [k]: true }, 'screen'), k).toBe(true);
      // Unanswered counts as "screen": nothing is out in the open before the question has been put.
      expect(coverReviewers({ ...quiet, [k]: true }, undefined), k).toBe(true);
      expect(coverReviewers({ ...quiet, [k]: true }, 'capture'), k).toBe(false);
    }
  });
  it('says the same thing whatever the name was, so even its length stays private', () => {
    expect(COVERED_NAME).toBe('A reviewer');
    expect(coveredCount(1)).toBe('1 new comment');
    expect(coveredCount(3)).toBe('3 new comments');
  });
});

describe('the reviewer\'s own zoom and pan', () => {
  it('leaves the fitted page alone until they move it', () => {
    const r = { x: 10, y: 20, w: 100, h: 50 };
    expect(viewRect(r, NO_VIEW, 200, 200, 1)).toBe(r);
  });
  it('scales about the middle of the window, then pans', () => {
    const r = viewRect({ x: 50, y: 50, w: 100, h: 100 }, { k: 2, dx: 10, dy: -5 }, 200, 200, 1);
    expect(r).toEqual({ x: 0 + 10, y: 0 - 5, w: 200, h: 200 });
  });
  it('keeps the spot under the pointer still while zooming, and stops at the limits', () => {
    const v0 = NO_VIEW;
    const v1 = zoomedAbout(v0, 2, 150, 120, 400, 300);
    // A point at the pointer before and after the zoom lands in the same place.
    const before = { x: 150, y: 120 };
    const after = { x: 200 + (before.x - 200) * v1.k + v1.dx, y: 150 + (before.y - 150) * v1.k + v1.dy };
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(zoomedAbout({ ...v0, k: MAX_ZOOM }, 2, 0, 0, 100, 100).k).toBe(MAX_ZOOM);
    expect(zoomedAbout({ ...v0, k: MIN_ZOOM }, 0.5, 0, 0, 100, 100).k).toBe(MIN_ZOOM);
  });
});

describe('what the window says about the link', () => {
  it('says nothing while it is working, and what to do when it is not', () => {
    expect(linkWords({ link: 'in', secondsLeft: null, name: '', waiting: 0 })).toBeNull();
    expect(linkWords({ link: 'dropped', secondsLeft: 40, name: '', waiting: 2 })!.text).toMatch(/Trying again for 40 seconds.*2 of your notes are waiting/);
    expect(linkWords({ link: 'lost', secondsLeft: null, name: '', waiting: 1 })!.text).toMatch(/save your comments/);
    expect(linkWords({ link: 'noOne', secondsLeft: null, name: '', waiting: 0 })!.text).toMatch(/strict networks/);
    for (const l of ['starting', 'looking', 'checking', 'knocking', 'offline', 'noOne', 'wrong', 'refused', 'full', 'dropped', 'lost', 'stopped', 'ended', 'removed'] as const) {
      expect(linkWords({ link: l, secondsLeft: null, name: '', waiting: 0 })!.text, l).not.toMatch(/—/);
    }
  });
  it('keeps the link, the sharer\'s pointer and what is waiting', () => {
    const bus = new ReviewBus();
    expect(bus.handle({ t: 'status', state: 'knocking' })).toBe(true);
    expect(bus.snapshot().link).toBe('knocking');
    bus.handle({ t: 'admitted', seat: 2, name: 'Doc' });
    expect(bus.snapshot()).toMatchObject({ link: 'in', seat: 2, name: 'Doc' });
    bus.handle({ t: 'pointer', n: 1, x: 5, y: 6 });
    expect(bus.sharer.visible(performance.now())[0].dot).toMatchObject({ x: 5, y: 6 });
    bus.handle({ t: 'waiting', count: 3 });
    bus.handle({ t: 'ack', ids: ['a'] });
    expect(bus.snapshot().waiting).toBe(3);
    expect(bus.arrived.has('a')).toBe(true);
    bus.handle({ t: 'bye', why: 'ended' });
    expect(bus.snapshot().link).toBe('ended');
    // A picture message is not ours: the picture's copy must see it.
    expect(bus.handle({ t: 'patch', seq: 1, patches: [] })).toBe(false);
  });
});

describe('cleaning a reviewer\'s words', () => {
  it('keeps links and emoji in a note, takes out hidden characters, shortens long runs and cuts to the limit', () => {
    expect(cleanReviewText('see https://example.com 👍', 100)).toBe('see https://example.com 👍');
    expect(cleanReviewText('a‮b​c\u0007d', 100)).toBe('abcd');
    expect(cleanReviewText('x'.repeat(100), 200)).toBe('x'.repeat(20));
    expect(cleanReviewText('abcdefgh', 4)).toBe('abcd');
    expect(cleanReviewText('   ', 10)).toBeNull();
    expect(cleanReviewText(5, 10)).toBeNull();
    expect(cleanReviewText('line one\r\nline two\n\n\n\n\n\nthree', 100)).toBe('line one\nline two\n\n\nthree');
  });
  it('makes a name one short plain line, with a fallback', () => {
    expect(cleanReviewerName('  Sam  ')).toBe('Sam');
    expect(cleanReviewerName('@everyone https://x.io')).toBe('Reviewer');
    expect(cleanReviewerName(undefined)).toBe('Reviewer');
    expect(cleanReviewerName('')).toBe('Reviewer');
  });
});
