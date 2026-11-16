import { describe, expect, it } from 'vitest';
import {
  END_HOLD_SECONDS,
  FORMATS,
  KEEP_DAYS,
  LENGTHS,
  MAX_GAP_MS,
  MAX_PICTURES,
  START_GAP_MS,
  clock,
  exportSize,
  fitInBox,
  fpsFor,
  inOrder,
  latestSession,
  limitsFor,
  overBound,
  parsePictureId,
  pictureBox,
  pictureId,
  pixelHash,
  sessionName,
  speedUp,
  staleIds,
  thin,
  timing,
  whenToTake,
  words,
  type Kept,
} from '../../src/timelapse/plan';

const kept = (n: number, bytes = 1000): Kept[] => Array.from({ length: n }, (_, i) => ({ id: pictureId('000000abc', i), at: i * 1000, bytes }));

describe('when to take a picture', () => {
  const base = { changed: true, lastAt: 0, now: 0, gapMs: 4000, busy: false };
  it('takes the first picture at once', () => {
    expect(whenToTake({ ...base, lastAt: null })).toEqual({ take: true });
  });
  it('does nothing when nothing changed', () => {
    expect(whenToTake({ ...base, changed: false, now: 99999 })).toEqual({ take: false, wait: null });
  });
  it('waits out the gap after a change, then takes it', () => {
    expect(whenToTake({ ...base, now: 1500 })).toEqual({ take: false, wait: 2500 });
    expect(whenToTake({ ...base, now: 4000 })).toEqual({ take: true });
    expect(whenToTake({ ...base, now: 9000 })).toEqual({ take: true });
  });
  it('never takes two at once, and does not take while paused', () => {
    expect(whenToTake({ ...base, now: 9000, busy: true })).toEqual({ take: false, wait: 250 });
    expect(whenToTake({ ...base, now: 9000, paused: true })).toEqual({ take: false, wait: null });
  });
  it('never takes pictures closer together than the gap, however often the drawing changes', () => {
    let last: number | null = null;
    const times: number[] = [];
    // A change every 100 ms for a minute.
    for (let now = 0; now <= 60000; now += 100) {
      const w = whenToTake({ changed: true, lastAt: last, now, gapMs: START_GAP_MS, busy: false });
      if (w.take) {
        times.push(now);
        last = now;
      }
    }
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(START_GAP_MS);
    expect(times.length).toBe(Math.floor(60000 / START_GAP_MS) + 1);
  });
});

describe('the size of a picture', () => {
  it('shrinks big drawings to 1280 on the long side, with even sizes', () => {
    const b = pictureBox(3840, 2160);
    expect(b.width).toBe(1280);
    expect(b.height).toBe(720);
    const odd = pictureBox(1999, 1001);
    expect(odd.width % 2).toBe(0);
    expect(odd.height % 2).toBe(0);
    expect(Math.max(odd.width, odd.height)).toBeLessThanOrEqual(1282);
  });
  it('leaves middling drawings alone and makes tiny pixel art bigger by whole numbers', () => {
    expect(pictureBox(800, 600)).toEqual({ width: 800, height: 600, scale: 1 });
    expect(pictureBox(64, 64)).toEqual({ width: 640, height: 640, scale: 10 });
    expect(pictureBox(100, 50).scale).toBe(6);
  });
  it('fits a drawing of another size inside the box, centred', () => {
    expect(fitInBox(1280, 720, 1280, 720)).toEqual({ scale: 1, x: 0, y: 0 });
    const f = fitInBox(500, 500, 1280, 720);
    expect(f.scale).toBeCloseTo(1.44);
    expect(f.x).toBeCloseTo((1280 - 720) / 2);
    expect(f.y).toBeCloseTo(0);
  });
  it('makes a GIF smaller and leaves a video at the picture size', () => {
    expect(exportSize(1280, 720, 'mp4')).toEqual({ width: 1280, height: 720 });
    expect(exportSize(1280, 720, 'gif')).toEqual({ width: 640, height: 360 });
    expect(exportSize(400, 300, 'gif')).toEqual({ width: 400, height: 300 });
  });
});

describe('pixelHash', () => {
  it('is the same for the same pixels and different when one changes', () => {
    const a = new Uint8ClampedArray(64).fill(7);
    const b = new Uint8ClampedArray(64).fill(7);
    expect(pixelHash(a)).toBe(pixelHash(b));
    b[33] = 8;
    expect(pixelHash(a)).not.toBe(pixelHash(b));
  });
});

describe('names of pictures and sessions', () => {
  it('make ids the library accepts, that sort in the order taken', () => {
    const s = sessionName(1_800_000_000_000);
    const ids = [0, 1, 35, 36, 1295, 1296, 46655].map((n) => pictureId(s, n));
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{1,80}$/);
    expect([...ids].sort()).toEqual(ids);
    expect(parsePictureId(ids[3])).toEqual({ session: s, n: 36 });
    expect(parsePictureId('versions-1')).toBeNull();
  });
  it('find the newest session and the older ones to clear', () => {
    const old = sessionName(1_700_000_000_000);
    const now = sessionName(1_800_000_000_000);
    const entries = [
      { id: pictureId(old, 0), size: 5, modified: 1 },
      { id: pictureId(now, 1), size: 7, modified: 3 },
      { id: pictureId(now, 0), size: 6, modified: 2 },
      { id: 'something-else', size: 1, modified: 1 },
    ];
    const r = latestSession(entries)!;
    expect(r.session).toBe(now);
    expect(r.pictures.map((p) => p.bytes)).toEqual([6, 7]);
    expect(r.others).toEqual([pictureId(old, 0)]);
    expect(latestSession([])).toBeNull();
  });
  it('picks out pictures older than the keep time', () => {
    const day = 86400000;
    const list = [
      { id: pictureId('000000abc', 0), modified: 0 },
      { id: pictureId('000000abc', 1), modified: 20 * day },
      { id: 'other', modified: 0 },
    ];
    expect(staleIds(list, 20 * day + 1)).toEqual([pictureId('000000abc', 0)]);
    expect(KEEP_DAYS).toBeGreaterThan(0);
  });
});

describe('the bounds on what is kept', () => {
  const limits = limitsFor(true);
  it('are well inside what a machine can hold', () => {
    expect(limits.pictures).toBe(MAX_PICTURES);
    expect(limits.bytes).toBeLessThanOrEqual(256 * 1024 * 1024);
    expect(limitsFor(false).bytes).toBeLessThan(limits.bytes);
  });
  it('say when there are too many pictures, or too many bytes', () => {
    expect(overBound(kept(MAX_PICTURES), limits)).toBe(false);
    expect(overBound(kept(MAX_PICTURES + 1), limits)).toBe(true);
    expect(overBound(kept(100, limits.bytes / 50), limits)).toBe(true);
  });
  it('thins by dropping every second picture, keeping the first and last, and doubles the gap', () => {
    const list = kept(MAX_PICTURES + 1);
    const t = thin(list, limits, START_GAP_MS);
    const left = list.filter((k) => !t.drop.includes(k.id));
    expect(left.length).toBeLessThanOrEqual(MAX_PICTURES);
    expect(left[0].id).toBe(list[0].id);
    expect(left[left.length - 1].id).toBe(list[list.length - 1].id);
    expect(t.gapMs).toBe(START_GAP_MS * 2);
    // Evenly spread still: no gap of more than two steps between neighbours.
    const idx = left.map((k) => list.indexOf(k));
    for (let i = 1; i < idx.length - 1; i++) expect(idx[i] - idx[i - 1]).toBe(2);
  });
  it('thins by size too, as many rounds as it takes', () => {
    const big = kept(400, limits.bytes / 100);
    const t = thin(big, limits, START_GAP_MS);
    const left = big.filter((k) => !t.drop.includes(k.id));
    expect(overBound(left, limits)).toBe(false);
    expect(t.gapMs).toBeGreaterThan(START_GAP_MS * 2);
  });
  it('never lets the gap pass its top, and always ends', () => {
    expect(thin(kept(5, limits.bytes), limits, MAX_GAP_MS).gapMs).toBe(MAX_GAP_MS);
    expect(thin(kept(2, limits.bytes), limits, START_GAP_MS).drop).toEqual([]);
  });
  it('stays bounded over a very long session, whatever happens', () => {
    // A picture every gap for 10 days, thinning each time the bound is passed.
    let list: Kept[] = [];
    let gap = START_GAP_MS;
    let t = 0;
    let n = 0;
    let worst = 0;
    while (t < 10 * 86400000) {
      t += gap;
      list = [...list, { id: pictureId('000000abc', n++), at: t, bytes: 150_000 }];
      if (overBound(list, limits)) {
        const r = thin(list, limits, gap);
        const gone = new Set(r.drop);
        list = list.filter((k) => !gone.has(k.id));
        gap = r.gapMs;
      }
      worst = Math.max(worst, list.length, 0);
    }
    expect(worst).toBeLessThanOrEqual(MAX_PICTURES + 1);
    expect(list.reduce((s, k) => s + k.bytes, 0)).toBeLessThanOrEqual(limits.bytes);
    expect(inOrder(list)).toEqual(list);
  });
});

describe('which pictures make the video', () => {
  const fps = 30;
  it('spreads the pictures evenly over the length asked for, first and last always in', () => {
    const t = timing(900, 30, fps, 0);
    expect(t.indices.length).toBe(900);
    expect(t.indices[0]).toBe(0);
    expect(t.indices[t.indices.length - 1]).toBe(899);
    const t2 = timing(3000, 10, fps, 0);
    expect(t2.indices.length).toBe(300);
    expect(t2.indices[0]).toBe(0);
    expect(t2.indices[299]).toBe(2999);
    for (let i = 1; i < t2.indices.length; i++) expect(t2.indices[i]).toBeGreaterThanOrEqual(t2.indices[i - 1]);
  });
  it('lands on the length asked for, with the hold at the end added', () => {
    const t = timing(2000, 20, fps);
    expect(t.seconds).toBeCloseTo(20 + END_HOLD_SECONDS, 5);
    expect(t.indices.slice(-Math.round(END_HOLD_SECONDS * fps)).every((i) => i === 1999)).toBe(true);
  });
  it('holds pictures when there are few, but never into a slideshow', () => {
    const t = timing(20, 30, fps, 0);
    // 20 pictures at most half a second each: 10 seconds, not 30.
    expect(t.seconds).toBeCloseTo(10);
    const counts = new Map<number, number>();
    for (const i of t.indices) counts.set(i, (counts.get(i) ?? 0) + 1);
    for (const c of counts.values()) expect(c).toBeLessThanOrEqual(Math.round(fps * 0.5) + 1);
    expect(new Set(t.indices).size).toBe(20);
  });
  it('plays every picture once for "every picture"', () => {
    const t = timing(100, null, fps, 0);
    expect(t.indices).toEqual(Array.from({ length: 100 }, (_, i) => i));
  });
  it('copes with one picture, or none', () => {
    expect(timing(0, 30, fps).indices).toEqual([]);
    expect(timing(1, 30, fps).indices.every((i) => i === 0)).toBe(true);
    expect(timing(1, 30, fps).indices.length).toBeGreaterThan(0);
  });
  it('uses fewer frames a second for a GIF, so it comes out smaller', () => {
    expect(fpsFor('gif')).toBeLessThan(fpsFor('mp4'));
    expect(timing(900, 10, fpsFor('gif'), 0).indices.length).toBe(150);
  });
  it('says how much faster than real time, never less than 1', () => {
    expect(speedUp(3600, 30)).toBe(120);
    expect(speedUp(5, 30)).toBe(1);
    expect(speedUp(100, 0)).toBe(1);
  });
});

describe('the choices offered', () => {
  it('lead with the file that plays everywhere (H.264)', () => {
    expect(FORMATS[0].id).toBe('mp4');
    expect(FORMATS[0].label).toContain('H.264');
  });
  it('have a medium length that exists, and use plain words', () => {
    expect(LENGTHS.find((l) => l.id === 'medium')?.seconds).toBe(30);
    for (const l of [...LENGTHS, ...FORMATS]) expect(l.label).not.toContain('—');
  });
});

describe('plain words for times', () => {
  it('say minutes and hours like a person', () => {
    expect(words(1)).toBe('1 second');
    expect(words(30)).toBe('30 seconds');
    expect(words(47 * 60)).toBe('47 minutes');
    expect(words(3900)).toBe('1 hour 5 minutes');
    expect(words(7200)).toBe('2 hours');
  });
  it('make a clock for the badge', () => {
    expect(clock(65)).toBe('1:05');
    expect(clock(3723)).toBe('1:02:03');
    expect(clock(-3)).toBe('0:00');
  });
});
