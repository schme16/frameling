// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { agreedNotch, DEFAULT_NOTCH, isUnusualNotch, NotchLearner, resetSharedNotch, sharedNotch } from '../../src/canvas/wheelNotch';
import { wheelZoomFactor } from '../../src/canvas/view';
import { WheelStream } from '../../src/canvas/wheelStream';

const pct = (f: number) => Math.round((f - 1) * 100);
const feed = (l: NotchLearner, px: number, n: number) => {
  for (let i = 0; i < n; i++) l.see(px);
};

describe('how far one event zooms, for the notch this wheel has', () => {
  // name, deltaY, deltaMode, dpr, notch, ctrl-style pinch?, expected percent
  const table: [string, number, number, number, number, 'wheel' | 'pinch', number][] = [
    ['a 45 pixel notch on a 45 pixel wheel', -45, 0, 1, 45, 'wheel', 25],
    ['the same 45 with the old assumption of 100 (what shipped)', -45, 0, 1, 100, 'wheel', 10],
    ['a 100 pixel notch on a 100 pixel wheel', -100, 0, 1, 100, 'wheel', 25],
    ['a 120 pixel notch', -120, 0, 1, 120, 'wheel', 25],
    ['a scaled 45: 78.75 at 1.75 scaling', -78.75, 0, 1.75, 45, 'wheel', 25],
    ['a scaled 100: 175 at 1.75 scaling', -175, 0, 1.75, 100, 'wheel', 25],
    ['half a 45 notch', -22.5, 0, 1, 45, 'wheel', 12],
    ['two 45 notches in one event', -90, 0, 1, 45, 'wheel', 55],
    ['three lines of a line-mode wheel, 48 pixels a notch', -3, 1, 1, 48, 'wheel', 25],
    ['zooming out, 45 pixel notch', 45, 0, 1, 45, 'wheel', -20],
    ['a real pinch ignores the notch (100)', -2.37, 0, 1, 100, 'pinch', 2],
    ['a real pinch ignores the notch (45)', -2.37, 0, 1, 45, 'pinch', 2],
  ];
  for (const [name, dy, mode, dpr, notch, kind, want] of table) {
    it(`${name}: ${want > 0 ? '+' : ''}${want}%`, () => {
      expect(pct(wheelZoomFactor(dy, mode, 'normal', kind, dpr, 1, notch))).toBe(want);
    });
  }

  it('a pinch is exactly the same whatever the notch', () => {
    expect(wheelZoomFactor(-2.37, 0, 'normal', 'pinch', 1, 1, 45)).toBe(wheelZoomFactor(-2.37, 0, 'normal', 'pinch', 1, 1, 100));
  });

  it('the steps and the speed still scale a notch, on any wheel', () => {
    expect(pct(wheelZoomFactor(-45, 0, 'coarse', 'wheel', 1, 1, 45))).toBe(62);
    expect(pct(wheelZoomFactor(-45, 0, 'fine', 'wheel', 1, 1, 45))).toBe(9);
    expect(pct(wheelZoomFactor(-45, 0, 'normal', 'wheel', 1, 0.6, 45))).toBe(14);
  });

  it('leaves the old calls alone: no notch given means 100', () => {
    expect(wheelZoomFactor(-100, 0)).toBe(wheelZoomFactor(-100, 0, 'normal', 'wheel', 1, 1, 100));
  });
});

describe('learning the notch', () => {
  it('starts at the usual 100', () => {
    expect(new NotchLearner().notch).toBe(DEFAULT_NOTCH);
  });

  it('settles on 45 after three of them, whichever way they turn', () => {
    const l = new NotchLearner();
    l.see(-45);
    l.see(45);
    expect(l.notch).toBe(100);
    l.see(-45);
    expect(l.notch).toBe(45);
    expect(l.settled).toBe(true);
  });

  it('stays at 100 for a plain 100 wheel', () => {
    const l = new NotchLearner();
    feed(l, 100, 10);
    expect(l.notch).toBe(100);
  });

  it('ignores a high-resolution wheel own small steps and a trackpad scroll', () => {
    const l = new NotchLearner();
    for (const px of [12, 12, 12, 12, 12, 3, 3, 3, 3, 7, 7, 7]) l.see(px);
    expect(l.notch).toBe(100);
    expect(l.settled).toBe(false);
  });

  it('ignores sizes that cannot be a notch, however often they come', () => {
    const l = new NotchLearner();
    feed(l, 400, 8);
    expect(l.notch).toBe(100);
  });

  it('is not thrown by a few odd events in the run', () => {
    const l = new NotchLearner();
    for (const px of [45, 61, 45, 12, 45, 90, 45]) l.see(px);
    expect(l.notch).toBe(45);
  });

  it('follows a change of mouse', () => {
    const l = new NotchLearner();
    feed(l, 45, 6);
    expect(l.notch).toBe(45);
    feed(l, 100, 12);
    expect(l.notch).toBe(100);
  });

  it('trusts a remembered notch from the first event, and refuses a silly one', () => {
    expect(new NotchLearner(45).notch).toBe(45);
    expect(new NotchLearner(3).notch).toBe(100);
    expect(new NotchLearner(9999).notch).toBe(100);
  });

  it('tells you when the learned size changes', () => {
    const seen: number[] = [];
    const l = new NotchLearner(100, (n) => seen.push(n));
    feed(l, 45, 5);
    feed(l, 45, 5);
    expect(seen).toEqual([45]);
  });

  it('finds the agreed size, or none', () => {
    expect(agreedNotch([45, 45, 45])).toBe(45);
    expect(agreedNotch([45, 46, 47])).toBeNull();
    expect(agreedNotch([])).toBeNull();
  });

  it('calls 45 unusual and 100 or 98 not', () => {
    expect(isUnusualNotch(45)).toBe(true);
    expect(isUnusualNotch(100)).toBe(false);
    expect(isUnusualNotch(96)).toBe(false);
    expect(isUnusualNotch(120)).toBe(true);
  });
});

describe('the wheel stream with a learned notch', () => {
  const wheel = (s: WheelStream, dy: number, t: number, ctrlKey = false, dpr = 1) => s.read({ deltaY: dy, deltaMode: 0, ctrlKey }, t, { dpr });

  it('a 45 pixel wheel zooms a quarter a notch once the wheel is known', () => {
    const s = new WheelStream();
    const first = [0, 1, 2].map((i) => pct(wheel(s, -45, i * 400).factor));
    // The first two are read at the usual 100 (+10%); the third makes it three of a kind, and is +25%.
    expect(first).toEqual([10, 10, 25]);
    expect(pct(wheel(s, -45, 1600).factor)).toBe(25);
  });

  it('a remembered 45 gets the first notch right', () => {
    const s = new WheelStream(new NotchLearner(45));
    expect(pct(wheel(s, -45, 0).factor)).toBe(25);
  });

  it('a plain 100 wheel is +25% every notch, from the start', () => {
    const s = new WheelStream();
    for (let i = 0; i < 5; i++) expect(pct(wheel(s, -100, i * 400).factor)).toBe(25);
  });

  it('the same 100 wheel on a scaled screen: 175 comes out the same', () => {
    const s = new WheelStream();
    for (let i = 0; i < 5; i++) expect(pct(wheel(s, -175, i * 400, false, 1.75).factor)).toBe(25);
  });

  it('a burst of small steps adds up to one notch, because zoom multiplies out', () => {
    const s = new WheelStream();
    let total = 1;
    for (let i = 0; i < 4; i++) total *= wheel(s, -25, i * 8).factor;
    expect(pct(total)).toBe(25);
  });

  it('a real pinch is a pinch and teaches nothing', () => {
    const l = new NotchLearner();
    const s = new WheelStream(l);
    for (let i = 0; i < 8; i++) {
      const r = wheel(s, -40.5, i * 8, true);
      expect(r.kind).toBe('pinch');
    }
    expect(l.notch).toBe(100);
    expect(l.settled).toBe(false);
  });

  it('reports the notch it used', () => {
    const s = new WheelStream(new NotchLearner(45));
    expect(wheel(s, -45, 0).notch).toBe(45);
    expect(s.notch).toBe(45);
  });
});

describe('the shared learner', () => {
  beforeEach(() => resetSharedNotch());

  it('is one learner for the canvas and the readout', () => {
    expect(sharedNotch()).toBe(sharedNotch());
  });

  it('remembers what it learned for next time', () => {
    feed(sharedNotch(), 45, 4);
    expect(localStorage.getItem('frameling.wheelNotch')).toBe('45');
  });

  it('starts from a saved notch', () => {
    resetSharedNotch();
    localStorage.setItem('frameling.wheelNotch', '53');
    expect(sharedNotch().notch).toBe(53);
  });
});
