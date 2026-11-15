// What the second window is given while you are still drawing: the taps, the pace of big pieces, the queue on the other side,
// and (the one that matters) that the pieces a pixel stroke hands over, put on a copy one after the other, make the same
// picture the stroke finally commits.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubCanvas } from './canvas-stub';
import { newDoc } from '../../src/core/doc';
import type { PixelDrawing, PixelLayer } from '../../src/core/format';
import { gridPixels } from '../../src/core/pixelBounds';
import { resetStore, store } from '../../src/core/store';
import { setLive } from '../../src/canvas/controller';
import { PixelSession } from '../../src/tools/pixelSession';
import { inkWanted, noteInk, noteLive, notePixels, pixelsWanted, setInkTap, setLiveTap, setPixelTap, type PixelFeed } from '../../src/popout/ink';
import { offerWholePixels } from '../../src/popout/pixelFeed';
import { BYTES_PER_MS, MAX_WAIT_MS, waitAfter } from '../../src/popout/pace';
import { Replica, MAX_QUEUED } from '../../src/popout/replica';
import { Mirror } from '../../src/popout/mirror';
import type { PixelPatch, ToPopout } from '../../src/popout/protocol';
import { newVectorDrawing } from '../../src/core/doc';

const W = 300;
const H = 200;

beforeEach(() => stubCanvas(vi));
afterEach(() => {
  vi.unstubAllGlobals();
  setInkTap(null);
  setLiveTap(null);
  setPixelTap(null);
  setLive(null);
});

/** The second window's copy of the layer, as plain pixels: what the painter's canvas holds. */
class Copy {
  buf: Uint8ClampedArray | null = null;
  starts = 0;
  put(p: PixelPatch, base: Uint8ClampedArray | null): void {
    if (p.start) {
      this.starts++;
      this.buf = p.base && base ? new Uint8ClampedArray(base) : new Uint8ClampedArray(p.width * p.height * 4);
    }
    const b = this.buf!;
    for (let y = 0; y < p.h; y++) b.set(p.data.subarray(y * p.w * 4, (y + 1) * p.w * 4), ((p.y + y) * p.width + p.x) * 4);
  }
}

function setup() {
  resetStore(newDoc({ width: W, height: H, pixel: { pixelSize: 1 } }));
  const { doc, ui } = store().get();
  return new PixelSession(doc, doc.layers[0] as PixelLayer, ui.frame);
}
const committed = () => gridPixels(Object.values(store().get().doc.drawings).find((d) => d.kind === 'pixel') as PixelDrawing, W, H);

describe('the taps', () => {
  it('cost nothing when nobody listens', () => {
    expect(pixelsWanted()).toBe(false);
    expect(() => notePixels(null)).not.toThrow();
    expect(() => offerWholePixels('L', 4, 4, new Uint8ClampedArray(64))).not.toThrow();
  });

  it('pass on a function that makes the ink, without calling it', () => {
    let made = 0;
    const seen: unknown[] = [];
    setInkTap((s) => void seen.push(s));
    expect(inkWanted()).toBe(true);
    const maker = () => (made++, null);
    noteInk(maker);
    expect(seen).toEqual([maker]);
    expect(made).toBe(0);
  });

  it('send tile maps like vector drawings, leave pixel layers to the pixel tap, and end both on null', () => {
    const lives: unknown[] = [];
    const ends: unknown[] = [];
    setLiveTap((l) => void lives.push(l));
    setPixelTap((f) => void ends.push(f));
    const drawing = newVectorDrawing();
    noteLive({ layerId: 'L', kind: 'tilemap', drawing });
    noteLive({ layerId: 'L', kind: 'pixel' });
    expect(lives).toEqual([{ layerId: 'L', drawing }]);
    expect(ends).toEqual([]);
    noteLive(null);
    expect(lives.at(-1)).toBeNull();
    expect(ends).toEqual([null]);
  });
});

describe('the pace of big pieces', () => {
  it('is no wait for a dab or a screenful of strokes, and grows with size up to a cap', () => {
    expect(waitAfter(0)).toBe(0);
    expect(waitAfter(40_000)).toBe(0);
    expect(waitAfter(BYTES_PER_MS * 16)).toBe(0);
    expect(waitAfter(BYTES_PER_MS * 100)).toBe(100);
    expect(waitAfter(8 * 1024 * 1024)).toBe(128);
    expect(waitAfter(1e9)).toBe(MAX_WAIT_MS);
  });
});

describe("the second window's queue", () => {
  const patch = (start: boolean): PixelPatch => ({ layerId: 'L', width: 4, height: 4, start, base: false, x: 0, y: 0, w: 1, h: 1, data: new Uint8ClampedArray(4) });
  it('keeps pieces in order, starts over at a start, and ends on null', () => {
    const r = new Replica();
    const a = patch(true);
    const b = patch(false);
    r.apply({ t: 'pixels', patch: a });
    r.apply({ t: 'pixels', patch: b });
    expect(r.pixelQueue).toEqual([a, b]);
    const c = patch(true);
    r.apply({ t: 'pixels', patch: c });
    expect(r.pixelQueue).toEqual([c]);
    r.apply({ t: 'pixels', patch: null });
    expect(r.pixelQueue).toEqual([null]);
  });
  it('asks to start again rather than pile up when the painter is not keeping up', () => {
    const r = new Replica();
    r.apply({ t: 'pixels', patch: patch(true) });
    let asked = false;
    for (let i = 0; i < MAX_QUEUED + 2 && !asked; i++) asked = r.apply({ t: 'pixels', patch: patch(false) });
    expect(asked).toBe(true);
    expect(r.pixelQueue).toEqual([null]);
  });
  it('forgets pieces when a whole drawing comes in', () => {
    const r = new Replica();
    r.apply({ t: 'pixels', patch: patch(true) });
    r.apply({ t: 'doc', seq: 1, doc: newDoc({ width: 4, height: 4 }) });
    expect(r.pixelQueue).toEqual([null]);
  });
  it('is sent by the mirror as it is', () => {
    const out: ToPopout[] = [];
    const m = new Mirror({ get: () => store().get(), lastChange: () => null }, (x) => out.push(x), () => ({}) as never);
    m.setPixels(null);
    expect(out).toEqual([{ t: 'pixels', patch: null }]);
  });
});

describe('a pixel stroke followed from outside', () => {
  const key = (x: number, y: number) => (y * W + x) * 4;

  it('makes the same picture on the copy as the stroke commits, over many frames', () => {
    const s = setup();
    const copy = new Copy();
    let pieces = 0;
    let bytes = 0;
    setPixelTap((f: PixelFeed | null) => {
      if (!f) return;
      // The link calls take once a frame: here, after every few flushes.
      const p = f.take(false);
      if (p) {
        pieces++;
        bytes += p.data.byteLength;
        copy.put(p, null);
      }
    });
    for (let i = 0; i < 120; i++) {
      for (let j = 0; j < 5; j++) s.set(10 + i * 2 + j, 20 + Math.floor(Math.sin(i / 7) * 15) + j, [200, 30, 90, 255]);
      s.flush();
    }
    expect(pieces).toBeGreaterThan(50);
    expect(copy.starts).toBe(1);
    // Each piece is a small rectangle, nothing like the whole 300 x 200 picture.
    expect(bytes / pieces).toBeLessThan(W * H * 4 * 0.1);
    s.commit('Brush');
    expect(Array.from(copy.buf!)).toEqual(Array.from(committed()));
  });

  it('gives all of it at the start, and again when asked to start over (the second window opened half way)', () => {
    const s = setup();
    for (let i = 0; i < 40; i++) {
      s.set(5 + i, 5 + i, [1, 2, 3, 255]);
      s.flush();
    }
    const copy = new Copy();
    let feed: PixelFeed | null = null;
    setPixelTap((f) => void (feed = f));
    s.set(100, 100, [9, 9, 9, 255]);
    s.flush();
    copy.put(feed!.take(false)!, null);
    expect(copy.buf![key(5, 5)]).toBe(1);
    expect(copy.buf![key(100, 100)]).toBe(9);
    const again = new Copy();
    again.put(feed!.take(true)!, null);
    expect(again.starts).toBe(1);
    expect(Array.from(again.buf!)).toEqual(Array.from(copy.buf!));
    expect(feed!.take(false)).toBeNull();
  });

  it('follows a rubber-band line: the old line goes when the new one is drawn', () => {
    const s = setup();
    const copy = new Copy();
    setPixelTap((f) => {
      const p = f?.take(false);
      if (p) copy.put(p, null);
    });
    for (let a = 0; a < 20; a++) {
      s.reset();
      for (let x = 20; x < 120; x++) s.set(x, 20 + Math.floor((x - 20) * (a / 20)), [255, 0, 0, 255]);
      s.flush();
    }
    s.commit('Line');
    expect(Array.from(copy.buf!)).toEqual(Array.from(committed()));
  });

  it('starts from the saved drawing when there is one, and erases on top of it', () => {
    const s0 = setup();
    for (let x = 0; x < 200; x++) s0.set(x, 50, [10, 200, 10, 255]);
    s0.commit('Draw');
    const base = committed();
    const { doc, ui } = store().get();
    const s = new PixelSession(doc, doc.layers[0] as PixelLayer, ui.frame);
    const copy = new Copy();
    setPixelTap((f) => {
      const p = f?.take(false);
      if (p) copy.put(p, base);
    });
    for (let x = 30; x < 60; x++) {
      s.set(x, 50, [0, 0, 0, 0]);
      s.flush();
    }
    s.commit('Erase');
    expect(Array.from(copy.buf!)).toEqual(Array.from(committed()));
    expect(copy.buf![key(10, 50) + 1]).toBe(200);
    expect(copy.buf![key(40, 50) + 3]).toBe(0);
  });

  it('can be asked for the picture so far at any time (the link only asks while a window is open)', () => {
    const s = setup();
    s.set(3, 3, [1, 1, 1, 255]);
    s.flush();
    expect(s.feed.take(false)).toEqual(expect.objectContaining({ start: true }));
  });
});

describe('whole pictures', () => {
  it('are handed over as a start, read only when asked for', () => {
    let feed: PixelFeed | null = null;
    setPixelTap((f) => void (feed = f));
    const px = new Uint8ClampedArray(2 * 2 * 4).fill(7);
    offerWholePixels('L', 2, 2, px);
    const p = feed!.take(false)!;
    expect(p).toMatchObject({ layerId: 'L', start: true, base: false, x: 0, y: 0, w: 2, h: 2, width: 2, height: 2 });
    expect(p.data).toBe(px);
  });
  it('are left alone for a layer too big to copy', () => {
    let feed: PixelFeed | null = null;
    setPixelTap((f) => void (feed = f));
    offerWholePixels('L', 5000, 5000, new Uint8ClampedArray(4));
    expect(feed).toBeNull();
  });
});
