// Zipping and PNG decoding on worker threads: the same bytes as doing them here, and a plain fallback when a worker
// is missing or fails. The worker is faked (it copies and hands over buffers the way a real one does).
import { afterEach, describe, expect, it } from 'vitest';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { newDoc, newPixelDrawing, newPixelLayer } from '../../src/core/doc';
import { loadFile, loadFileAsync, saveFile, saveFileAsync } from '../../src/io/file';
import { setIoPool, pngPixels } from '../../src/io/ioClient';
import { runJob, type IoRequest } from '../../src/io/ioJobs';
import { encodePng, decodePng } from '../../src/io/png';
import { WorkerPool, type WorkerLike } from '../../src/io/workerPool';

class FakeWorker implements WorkerLike {
  onmessage: ((e: { data: any }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  terminated = false;
  constructor(private mode: 'ok' | 'error' | 'throw' = 'ok') {}
  postMessage(msg: unknown, transfer: Transferable[] = []): void {
    // What a real worker would see: a copy, with the handed over buffers moved.
    const req = structuredClone(msg, { transfer }) as IoRequest;
    if (this.mode === 'throw') throw new Error('cannot post');
    setTimeout(() => {
      if (this.mode === 'error') return void this.onerror?.(new Error('boom'));
      const { reply, transfer: back } = runJob(req);
      this.onmessage?.({ data: structuredClone(reply, { transfer: back }) });
    }, 0);
  }
  terminate(): void {
    this.terminated = true;
  }
}

function pool(mode: 'ok' | 'error' | 'throw' = 'ok', max = 2) {
  const made: FakeWorker[] = [];
  const p = new WorkerPool(() => (made[made.push(new FakeWorker(mode)) - 1]), max, 50);
  return { p, made };
}

function bigPixelDoc(frames = 2, w = 1100, h = 1000) {
  const doc = newDoc({ width: 64, height: 64, length: frames, pixel: { pixelSize: 1 } });
  doc.drawings = {};
  const l = newPixelLayer('P', 1);
  for (let f = 0; f < frames; f++) {
    const d = { ...newPixelDrawing(w, h), id: 'p' + f };
    for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 5) d.pixels.set([(x + f) & 255, y & 255, 90, 255], (y * w + x) * 4);
    doc.drawings[d.id] = d;
    l.cels.push({ id: 'c' + f, start: f, length: 1, drawingId: d.id });
  }
  doc.layers = [l];
  return doc;
}

afterEach(() => setIoPool(undefined));

describe('runJob', () => {
  it('zips the same entries as zipSync', () => {
    const files = { 'a.txt': new TextEncoder().encode('hello hello hello'), 'b/c.bin': [new Uint8Array([1, 2, 3]), { level: 0 }] as any };
    const r = runJob({ id: 1, kind: 'zip', files, level: 6 });
    expect(r.reply.ok).toBe(true);
    const got = unzipSync((r.reply as any).zip);
    expect(strFromU8(got['a.txt'])).toBe('hello hello hello');
    expect(Array.from(got['b/c.bin'])).toEqual([1, 2, 3]);
    expect(Object.keys(got).sort()).toEqual(Object.keys(unzipSync(zipSync(files))).sort());
  });
  it('decodes a PNG like decodePng does, and reports a broken one', () => {
    const img = { width: 3, height: 2, pixels: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 0, 1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255]) };
    const bytes = encodePng(img);
    const r = runJob({ id: 2, kind: 'png', bytes });
    expect((r.reply as any).image.pixels).toEqual(decodePng(bytes).pixels);
    const bad = runJob({ id: 3, kind: 'png', bytes: new Uint8Array([1, 2, 3]) });
    expect(bad.reply.ok).toBe(false);
  });
  it('reads the size of a PNG from its header', () => {
    expect(pngPixels(encodePng({ width: 7, height: 5, pixels: new Uint8ClampedArray(7 * 5 * 4) }))).toBe(35);
    expect(pngPixels(new Uint8Array(3))).toBe(0);
  });
});

describe('WorkerPool', () => {
  it('runs more jobs than workers, never more at once than allowed, and reuses workers', async () => {
    const { p, made } = pool('ok', 2);
    const png = encodePng({ width: 2, height: 2, pixels: new Uint8ClampedArray(16) });
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => p.run<any>({ kind: 'png', bytes: png.slice() })));
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(made.length).toBeLessThanOrEqual(2);
    p.release();
    expect(made.every((w) => w.terminated)).toBe(true);
  });
  it('lets idle workers go after a while', async () => {
    const { p, made } = pool();
    await p.run({ kind: 'png', bytes: encodePng({ width: 1, height: 1, pixels: new Uint8ClampedArray(4) }) });
    expect(made[0].terminated).toBe(false);
    await new Promise((r) => setTimeout(r, 120));
    expect(made[0].terminated).toBe(true);
  });
  it('rejects when a worker fails or cannot start, and keeps going with the rest', async () => {
    const bad = pool('error');
    await expect(bad.p.run({ kind: 'png', bytes: new Uint8Array(30) })).rejects.toBeDefined();
    expect(bad.made[0].terminated).toBe(true);
    const none = new WorkerPool(() => {
      throw new Error('no workers here');
    }, 2);
    await expect(none.run({ kind: 'png', bytes: new Uint8Array(30) })).rejects.toThrow('no workers');
    const post = pool('throw');
    await expect(post.p.run({ kind: 'png', bytes: new Uint8Array(30) })).rejects.toThrow('cannot post');
  });
});

describe('saving on a worker', () => {
  it('writes the same entries as the plain save', async () => {
    const doc = bigPixelDoc(2, 200, 100);
    const now = new Date('2026-01-01T00:00:00Z');
    const { p, made } = pool();
    setIoPool(p);
    const a = unzipSync(await saveFileAsync(doc, 't', now));
    expect(made.length).toBe(1);
    const b = unzipSync(saveFile(doc, 't', now));
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    for (const k of Object.keys(b)) expect(Buffer.from(a[k]).equals(Buffer.from(b[k])), k).toBe(true);
    // The handed over buffer was doc.json's own: saving again works and the document is untouched.
    expect(Buffer.from(unzipSync(await saveFileAsync(doc, 't', now))['doc.json']).equals(Buffer.from(b['doc.json']))).toBe(true);
    p.release();
  });
  it('still saves when the worker fails', async () => {
    const doc = bigPixelDoc(1, 50, 50);
    const now = new Date('2026-01-01T00:00:00Z');
    setIoPool(pool('error').p);
    const a = unzipSync(await saveFileAsync(doc, 't', now));
    expect(Buffer.from(a['doc.json']).equals(Buffer.from(unzipSync(saveFile(doc, 't', now))['doc.json']))).toBe(true);
    setIoPool(pool('throw').p);
    const b = unzipSync(await saveFileAsync(doc, 't', now));
    expect(Buffer.from(b['doc.json']).equals(Buffer.from(a['doc.json']))).toBe(true);
  });
});

describe('opening on workers', () => {
  it('gives the same document as the plain open, with the big pictures decoded by workers', async () => {
    const bytes = saveFile(bigPixelDoc(3));
    const { p, made } = pool('ok', 3);
    setIoPool(p);
    const a = await loadFileAsync(bytes);
    expect(made.length).toBeGreaterThan(0);
    const b = loadFile(bytes);
    expect(Object.keys(a.doc.drawings).sort()).toEqual(Object.keys(b.doc.drawings).sort());
    for (const id of Object.keys(b.doc.drawings)) {
      const x = a.doc.drawings[id];
      const y = b.doc.drawings[id];
      if (x.kind !== 'pixel' || y.kind !== 'pixel') throw new Error('pixel expected');
      expect([x.width, x.height, x.x, x.y]).toEqual([y.width, y.height, y.x, y.y]);
      expect(Buffer.from(x.pixels.buffer).equals(Buffer.from(y.pixels.buffer))).toBe(true);
    }
    p.release();
  });
  it('small pictures are not sent anywhere', async () => {
    const { p, made } = pool();
    setIoPool(p);
    await loadFileAsync(saveFile(bigPixelDoc(2, 30, 30)));
    expect(made.length).toBe(0);
  });
  it('a worker that fails leaves the picture to be decoded here, with the same result', async () => {
    const bytes = saveFile(bigPixelDoc(2));
    setIoPool(pool('error').p);
    const a = await loadFileAsync(bytes);
    const b = loadFile(bytes);
    const x = a.doc.drawings.p1;
    const y = b.doc.drawings.p1;
    expect(x.kind === 'pixel' && y.kind === 'pixel' && Buffer.from(x.pixels.buffer).equals(Buffer.from(y.pixels.buffer))).toBe(true);
  });
  it('a damaged picture is still reported as a damaged file', async () => {
    const doc = bigPixelDoc(1);
    const zipped = unzipSync(saveFile(doc));
    const name = Object.keys(zipped).find((k) => k.startsWith('pixels/'))!;
    zipped[name] = zipped[name].slice(0, 40);
    const bytes = zipSync(zipped);
    setIoPool(pool().p);
    await expect(loadFileAsync(bytes)).rejects.toThrow(/damaged/);
  });
});
