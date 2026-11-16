// Saving makes each drawing's PNG on the worker pool instead of on the page. The bytes must be exactly what the page
// makes, because a PNG that differs is a silently changed file format. The worker is faked (copies and hands over
// buffers the way a real one does, and keeps a log of the jobs it was given).
import { afterEach, describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { newDoc, newPixelDrawing, newPixelLayer } from '../../src/core/doc';
import { saveFile, saveFileAsync } from '../../src/io/file';
import { encodePngsInWorkers, setIoPool } from '../../src/io/ioClient';
import { runJob, type IoRequest } from '../../src/io/ioJobs';
import { encodePng } from '../../src/io/png';
import { trimPixels } from '../../src/core/pixelBounds';
import { WorkerPool, type WorkerLike } from '../../src/io/workerPool';

const log: string[] = [];

type Mode = 'ok' | 'error' | 'throw' | 'png-error';

class FakeWorker implements WorkerLike {
  onmessage: ((e: { data: any }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(private mode: Mode = 'ok') {}
  postMessage(msg: unknown, transfer: Transferable[] = []): void {
    const req = structuredClone(msg, { transfer }) as IoRequest;
    if (this.mode === 'throw') throw new Error('cannot post');
    log.push(req.kind);
    setTimeout(() => {
      if (this.mode === 'error' || (this.mode === 'png-error' && req.kind === 'encodepng')) return void this.onerror?.(new Error('boom'));
      const { reply, transfer: back } = runJob(req);
      this.onmessage?.({ data: structuredClone(reply, { transfer: back }) });
    }, 0);
  }
  terminate(): void {}
}

const pool = (mode: Mode = 'ok', max = 4) => new WorkerPool(() => new FakeWorker(mode), max, 50);
const count = (kind: string) => log.filter((k) => k === kind).length;
const NOW = new Date('2026-01-01T00:00:00Z');

/** Frames of w x h, painted `margin` pixels in from every edge (0 = to the edge), so with a margin they save trimmed. */
function pixelDoc(frames: number, w: number, h: number, margin = 0) {
  const doc = newDoc({ width: 64, height: 64, length: frames, pixel: { pixelSize: 1 } });
  doc.drawings = {};
  const l = newPixelLayer('P', 1);
  for (let f = 0; f < frames; f++) {
    const d = { ...newPixelDrawing(w, h), id: 'p' + f };
    for (let y = margin; y < h - margin; y += 3) for (let x = margin; x < w - margin; x += 5) d.pixels.set([(x * 7 + f) & 255, (y * 3) & 255, (x ^ y) & 255, 255 - ((x + y) & 63)], (y * w + x) * 4);
    doc.drawings[d.id] = d;
    l.cels.push({ id: 'c' + f, start: f, length: 1, drawingId: d.id });
  }
  doc.layers = [l];
  return doc;
}

/** The PNG the page would make for each drawing, from scratch (never from the save's cache). */
function expectedPngs(doc: ReturnType<typeof pixelDoc>) {
  const out: Uint8Array[] = [];
  for (const d of Object.values(doc.drawings)) {
    if (d.kind !== 'pixel') continue;
    const t = trimPixels(d.pixels, d.width, d.height);
    if (t.width) out.push(encodePng({ width: t.width, height: t.height, pixels: t.pixels }, { level: 6 }));
  }
  return out;
}

const pngEntries = (zip: Uint8Array) => {
  const files = unzipSync(zip);
  return Object.keys(files)
    .filter((k) => k.startsWith('pixels/'))
    .sort()
    .map((k) => files[k]);
};
const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));

afterEach(() => {
  setIoPool(undefined);
  log.length = 0;
});

describe('encodepng job', () => {
  it('makes the same bytes as encodePng at the save level, for odd sizes and see-through pixels', () => {
    for (const [w, h] of [[1, 1], [3, 2], [17, 31], [64, 5]]) {
      const pixels = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37 + (i >> 3) * 11) & 255;
      const r = runJob({ id: 1, kind: 'encodepng', image: { width: w, height: h, pixels } });
      expect(r.reply.ok).toBe(true);
      expect(same((r.reply as any).png, encodePng({ width: w, height: h, pixels }, { level: 6 }))).toBe(true);
    }
  });
  it('reports a picture whose size and pixels do not match', () => {
    expect(runJob({ id: 1, kind: 'encodepng', image: { width: 4, height: 4, pixels: new Uint8ClampedArray(8) } }).reply.ok).toBe(false);
  });
});

describe('encodePngsInWorkers', () => {
  it('leaves small pictures to the caller, and never touches the pixels it was given', async () => {
    setIoPool(pool());
    const small = { width: 4, height: 4, pixels: new Uint8ClampedArray(64).fill(9) };
    expect(await encodePngsInWorkers([small])).toEqual([null]);
    expect(log.length).toBe(0);
    const big = { width: 1100, height: 1000, pixels: new Uint8ClampedArray(1100 * 1000 * 4).fill(5) };
    const [png] = await encodePngsInWorkers([big]);
    expect(count('encodepng')).toBe(1);
    expect(big.pixels.byteLength).toBe(1100 * 1000 * 4);
    expect(big.pixels[0]).toBe(5);
    expect(same(png!, encodePng(big, { level: 6 }))).toBe(true);
  });
});

describe('saving puts the PNGs on workers', () => {
  it('writes byte for byte what the page writes, one job per drawing', async () => {
    const doc = pixelDoc(3, 1100, 1000);
    setIoPool(pool());
    const zip = await saveFileAsync(doc, 't', NOW);
    expect(count('encodepng')).toBe(3);
    const want = expectedPngs(doc);
    const got = pngEntries(zip);
    expect(got.length).toBe(3);
    want.forEach((w, i) => expect(same(got[i], w), 'drawing ' + i).toBe(true));
    // The live drawings were copied, not shared or emptied.
    for (const d of Object.values(doc.drawings)) if (d.kind === 'pixel') expect(d.pixels.byteLength).toBe(1100 * 1000 * 4);
  });
  it('gives the same whole file as saving on the page, with see-through margins too', async () => {
    const viaWorkers = pixelDoc(3, 1200, 1100, 60);
    const onPage = structuredClone(viaWorkers);
    setIoPool(pool());
    const a = await saveFileAsync(viaWorkers, 't', NOW);
    expect(count('encodepng')).toBe(3);
    const b = saveFile(onPage, 't', NOW);
    const fa = unzipSync(a);
    const fb = unzipSync(b);
    expect(Object.keys(fa).sort()).toEqual(Object.keys(fb).sort());
    for (const k of Object.keys(fb)) expect(same(fa[k], fb[k]), k).toBe(true);
  });
  it('a warm save makes no new job, and a drawing with margins is not cut out or encoded again either', async () => {
    const doc = pixelDoc(3, 1200, 1100, 60);
    setIoPool(pool());
    const first = await saveFileAsync(doc, 't', NOW);
    expect(count('encodepng')).toBe(3);
    log.length = 0;
    const second = await saveFileAsync(doc, 't', NOW);
    expect(count('encodepng')).toBe(0);
    expect(same(first, second)).toBe(true);
    // The page's own save agrees with both.
    expect(same(saveFile(doc, 't', NOW), first)).toBe(true);
    // An edit replaces that drawing's array, and only that one is encoded again.
    const d = doc.drawings.p1;
    if (d.kind !== 'pixel') throw new Error('pixel expected');
    d.pixels = d.pixels.slice();
    d.pixels.set([1, 2, 3, 255], (500 * 1200 + 500) * 4);
    log.length = 0;
    const third = unzipSync(await saveFileAsync(doc, 't', NOW));
    expect(count('encodepng')).toBe(1);
    const t = trimPixels(d.pixels, d.width, d.height);
    expect(same(third['pixels/p1.png'], encodePng({ width: t.width, height: t.height, pixels: t.pixels }, { level: 6 }))).toBe(true);
  });
  it('small drawings stay on the page', async () => {
    setIoPool(pool());
    await saveFileAsync(pixelDoc(2, 200, 100), 't', NOW);
    expect(count('encodepng')).toBe(0);
  });
  it('still saves, with the same PNGs, when workers fail or cannot start', async () => {
    for (const mode of ['error', 'throw', 'png-error'] as const) {
      const doc = pixelDoc(2, 1100, 1000);
      setIoPool(pool(mode));
      const got = pngEntries(await saveFileAsync(doc, 't', NOW));
      const want = expectedPngs(doc);
      expect(got.length, mode).toBe(2);
      want.forEach((w, i) => expect(same(got[i], w), mode + ' ' + i).toBe(true));
    }
  });
  it('still saves with no worker pool at all', async () => {
    const doc = pixelDoc(2, 1100, 1000);
    setIoPool(null);
    const got = pngEntries(await saveFileAsync(doc, 't', NOW));
    expectedPngs(doc).forEach((w, i) => expect(same(got[i], w), String(i)).toBe(true));
  });
});
