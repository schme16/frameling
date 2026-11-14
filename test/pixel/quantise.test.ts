import { afterEach, describe, expect, it } from 'vitest';
import { clampColours, DEFAULT_COLOURS, EXACT_LIMIT, Histogram, MAX_COLOURS, MIN_COLOURS, pickColours, tableOf } from '../../src/pixel/quantise';
import { paletteFromPixels } from '../../src/pixel/palette-io';
import { Cancelled, setQuantiseWorker, startScan } from '../../src/pixel/quantiseRun';
import { pickSteps } from '../../src/pixel/quantise';

/** Packed colour to its three channels. */
const rgb = (k: number): [number, number, number] => [(k >> 16) & 255, (k >> 8) & 255, k & 255];
const dist = (a: number, b: number): number => {
  const [r, g, bl] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r - r2, g - g2, bl - b2);
};

/** A seeded random number maker, so the pictures are the same every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** RGBA pixels from a list of packed colours (opaque). */
function pixelsOf(colours: number[]): Uint8ClampedArray {
  const p = new Uint8ClampedArray(colours.length * 4);
  colours.forEach((c, i) => {
    const [r, g, b] = rgb(c);
    p.set([r, g, b, 255], i * 4);
  });
  return p;
}

/** A photo-like picture: a smooth gradient with noise, thousands of distinct colours. */
function photo(n: number, seed = 1): Uint8ClampedArray {
  const r = rng(seed);
  const p = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    p[i * 4] = 40 + 180 * t + r() * 20;
    p[i * 4 + 1] = 200 - 120 * t + r() * 20;
    p[i * 4 + 2] = 90 + 60 * Math.sin(t * 9) + r() * 20;
    p[i * 4 + 3] = 255;
  }
  return p;
}

/** The average distance from each pixel to the nearest of the colours: how well they stand for the picture. */
function error(pixels: Uint8ClampedArray, colours: number[]): number {
  let sum = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const k = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
    let best = Infinity;
    for (const c of colours) best = Math.min(best, dist(k, c));
    sum += best;
  }
  return sum / (pixels.length / 4);
}

describe('Histogram', () => {
  it('counts each solid colour exactly, most used first', () => {
    const t = tableOf(pixelsOf([0xff0000, 0x00ff00, 0xff0000, 0xff0000, 0x00ff00, 0x0000ff]));
    expect([...t.keys]).toEqual([0xff0000, 0x00ff00, 0x0000ff]);
    expect([...t.weights]).toEqual([3, 2, 1]);
    expect(t.exact).toBe(true);
    expect(t.solid).toBe(6);
  });

  it('skips see-through pixels and takes half-solid ones', () => {
    const t = tableOf(Uint8ClampedArray.of(255, 0, 0, 0, 0, 255, 0, 127, 0, 0, 255, 128));
    expect([...t.keys]).toEqual([0x0000ff]);
  });

  it('gives the same table however the pixels are cut into chunks', () => {
    const p = photo(6000);
    const whole = tableOf(p);
    const h = new Histogram();
    for (let at = 0; at < p.length; at += 4 * 777) h.add(p.subarray(at, at + 4 * 777));
    const parts = h.table();
    expect([...parts.keys]).toEqual([...whole.keys]);
    expect([...parts.weights]).toEqual([...whole.weights]);
  });

  it('groups colours into bins past the exact limit, keeping every pixel counted', () => {
    // Every colour different: more than the exact limit, so it falls back to bins of their average colours.
    const n = EXACT_LIMIT + 5000;
    const p = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      // An odd multiplier is a one-to-one map on 24 bits, so every colour is different.
      const k = (i * 37) & 0xffffff;
      p.set([(k >> 16) & 255, (k >> 8) & 255, k & 255, 255], i * 4);
    }
    const t = tableOf(p);
    expect(t.exact).toBe(false);
    expect(t.solid).toBe(n);
    expect(t.weights.reduce((a, b) => a + b, 0)).toBe(n);
    expect(t.keys.length).toBeLessThanOrEqual(32768);
  });

  it('keeps a picture with a few colours exact even when it is big', () => {
    const p = new Uint8ClampedArray(4 * 300000);
    for (let i = 0; i < 300000; i++) p.set([(i % 7) * 30, 5, 5, 255], i * 4);
    const t = tableOf(p);
    expect(t.exact).toBe(true);
    expect(t.keys.length).toBe(7);
  });
});

describe('pickColours', () => {
  it('keeps every colour when the picture has no more than the limit', () => {
    const t = tableOf(pixelsOf([0x112233, 0x445566, 0x778899, 0x112233]));
    expect(pickColours(t, 32).sort()).toEqual([0x112233, 0x445566, 0x778899]);
    expect(pickColours(t, 3).sort()).toEqual([0x112233, 0x445566, 0x778899]);
  });

  it('never gives more than the limit, at any limit', () => {
    const t = tableOf(photo(20000));
    expect(t.keys.length).toBeGreaterThan(1000);
    for (const max of [1, 2, 3, 5, 8, 16, 32, 100, 256]) {
      const got = pickColours(t, max);
      expect(got.length).toBeLessThanOrEqual(max);
      // A busy picture uses the room it is given.
      expect(got.length).toBeGreaterThanOrEqual(Math.max(1, Math.floor(max * 0.8)));
      expect(new Set(got).size).toBe(got.length);
    }
  });

  it('is the same every time', () => {
    const t = tableOf(photo(5000));
    expect(pickColours(t, 12)).toEqual(pickColours(t, 12));
  });

  it('finds the colours a picture is made of', () => {
    // Three patches of a colour each, with a little noise.
    const r = rng(7);
    const base = [0x2040c0, 0xe0a020, 0x30a050];
    const px: number[] = [];
    for (let i = 0; i < 6000; i++) {
      const b = base[i % 3];
      const [cr, cg, cb] = rgb(b);
      const j = () => Math.round((r() - 0.5) * 16);
      px.push(((cr + j()) << 16) | ((cg + j()) << 8) | (cb + j()));
    }
    const got = pickColours(tableOf(pixelsOf(px)), 3);
    expect(got).toHaveLength(3);
    for (const b of base) expect(Math.min(...got.map((c) => dist(c, b)))).toBeLessThan(12);
  });

  it('keeps a small bright accent that a plain population cut would lose', () => {
    const r = rng(3);
    const px: number[] = [];
    for (let i = 0; i < 20000; i++) px.push(i % 2 ? (30 + ((r() * 40) | 0)) * 65536 + 90 * 256 + 160 : 40 * 65536 + (140 + ((r() * 40) | 0)) * 256 + 60);
    for (let i = 0; i < 120; i++) px.push(0xff2020);
    const got = pickColours(tableOf(pixelsOf(px)), 4);
    expect(Math.min(...got.map((c) => dist(c, 0xff2020)))).toBeLessThan(30);
  });

  it('stands for the picture well even at a low limit', () => {
    const p = photo(20000);
    const t = tableOf(p);
    const at8 = error(p, pickColours(t, 8));
    const at32 = error(p, pickColours(t, 32));
    expect(at32).toBeLessThan(at8);
    expect(at8).toBeLessThan(26);
    expect(at32).toBeLessThan(10);
  });

  it('gives the same answer whether it is run in one go or in steps', () => {
    const t = tableOf(photo(3000));
    const g = pickSteps(t, 10);
    let r = g.next();
    let last = 0;
    while (!r.done) {
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThanOrEqual(1);
      last = r.value;
      r = g.next();
    }
    expect(last).toBeGreaterThan(0.5);
    expect(r.value).toEqual(pickColours(t, 10));
  });

  it('survives a table of one colour and of nothing', () => {
    expect(pickColours(tableOf(pixelsOf([0x123456, 0x123456])), 4)).toEqual([0x123456]);
    expect(pickColours(tableOf(new Uint8ClampedArray(8)), 4)).toEqual([]);
  });
});

describe('paletteFromPixels (the palette made from the picks)', () => {
  it('honours the limit and keeps a small picture whole', () => {
    expect(paletteFromPixels(photo(5000), 'x', 10).colors.length).toBeLessThanOrEqual(10);
    expect(paletteFromPixels(pixelsOf([0xff0000, 0x000000]), 'x', 10).colors.sort()).toEqual(['#000000', '#ff0000']);
  });
});

describe('the limit a person sets', () => {
  it('is a whole number in range', () => {
    expect(clampColours('48')).toBe(48);
    expect(clampColours(48.9)).toBe(48);
    expect(clampColours(0)).toBe(MIN_COLOURS);
    expect(clampColours(9999)).toBe(MAX_COLOURS);
    expect(clampColours('abc')).toBe(DEFAULT_COLOURS);
    expect(clampColours(undefined, 7)).toBe(7);
  });
});

describe('startScan, with no worker (the page does it in steps)', () => {
  afterEach(() => setQuantiseWorker(undefined));

  it('gives the same colours as doing it in one go, and reports progress up to 1', async () => {
    setQuantiseWorker(null);
    const a = photo(700000, 4);
    const b = photo(1000, 9);
    const seen: number[] = [];
    const scan = startScan([a, b], (f) => seen.push(f));
    await scan.done;
    const r = await scan.pick(16);
    const direct = new Histogram();
    direct.add(a);
    direct.add(b);
    expect(r.colours).toEqual(pickColours(direct.table(), 16));
    expect(r.solid).toBe(a.length / 4 + b.length / 4);
    expect(seen.length).toBeGreaterThan(1);
    expect(seen).toEqual([...seen].sort((x, y) => x - y));
    expect(seen[seen.length - 1]).toBe(1);
  });

  it('picks again for a new limit without counting again', async () => {
    setQuantiseWorker(null);
    const scan = startScan([photo(5000)]);
    await scan.done;
    expect((await scan.pick(4)).colours.length).toBeLessThanOrEqual(4);
    expect((await scan.pick(64)).colours.length).toBeLessThanOrEqual(64);
  });

  it('can be cancelled part way', async () => {
    setQuantiseWorker(null);
    const scan = startScan([photo(900000)]);
    const done = scan.done.then(
      () => 'done',
      (e) => (e instanceof Cancelled ? 'cancelled' : 'other'),
    );
    scan.cancel();
    expect(await done).toBe('cancelled');
    await expect(scan.pick(8)).rejects.toBeInstanceOf(Cancelled);
  });
});

/** A worker that behaves like quantise.worker.ts, and remembers what it was asked. */
function fakeWorker(opts: { fail?: boolean } = {}) {
  const log = { added: [] as number[], inFlightMax: 0, terminated: false, unacked: 0 };
  const hist = new Histogram();
  const w = {
    onmessage: null as ((e: { data: any }) => void) | null,
    onerror: null as ((e: unknown) => void) | null,
    postMessage(m: any) {
      if (opts.fail) {
        setTimeout(() => w.onerror?.(new Error('boom')), 0);
        return;
      }
      if (m.t === 'add') {
        log.added.push(m.pixels.length);
        log.unacked++;
        log.inFlightMax = Math.max(log.inFlightMax, log.unacked);
        hist.add(m.pixels);
        setTimeout(() => {
          log.unacked--;
          w.onmessage?.({ data: { t: 'ack' } });
        }, 1);
      } else {
        const t = hist.table();
        setTimeout(() => w.onmessage?.({ data: { t: 'picked', id: m.id, colours: pickColours(t, m.max), distinct: t.keys.length, exact: t.exact, solid: t.solid } }), 0);
      }
    },
    terminate() {
      log.terminated = true;
    },
  };
  return { w, log };
}

describe('startScan, with a worker', () => {
  afterEach(() => setQuantiseWorker(undefined));

  it('hands the pixels over in small pieces, a few at a time, and reports what the worker has counted', async () => {
    const { w, log } = fakeWorker();
    setQuantiseWorker(() => w);
    const p = photo(1500000); // 6 MB
    const seen: number[] = [];
    const scan = startScan([p], (f) => seen.push(f));
    await scan.done;
    expect(log.added.length).toBeGreaterThan(4);
    expect(Math.max(...log.added)).toBeLessThanOrEqual(1 << 20);
    expect(log.added.reduce((a, b) => a + b, 0)).toBe(p.length);
    expect(log.inFlightMax).toBeLessThanOrEqual(4);
    expect(seen[seen.length - 1]).toBe(1);
    const r = await scan.pick(20);
    expect(r.colours).toEqual(pickColours(tableOf(p), 20));
  });

  it('stops the worker when cancelled', async () => {
    const { w, log } = fakeWorker();
    setQuantiseWorker(() => w);
    const scan = startScan([photo(1500000)]);
    const done = scan.done.catch((e) => e);
    scan.cancel();
    expect(await done).toBeInstanceOf(Cancelled);
    expect(log.terminated).toBe(true);
  });

  it('carries on on the page when the worker fails', async () => {
    const { w } = fakeWorker({ fail: true });
    setQuantiseWorker(() => w);
    const p = photo(20000);
    const scan = startScan([p]);
    await scan.done;
    expect((await scan.pick(10)).colours).toEqual(pickColours(tableOf(p), 10));
  });
});
