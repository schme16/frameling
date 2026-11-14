// The animated PNG reader against real files made by Pillow and ffmpeg (scripts/fixtures/make-apng-fixtures.py), with what
// Pillow's own reader says each frame looks like, and against Frameling's own APNG writer.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ApngWriter } from '../../src/export/apng';
import { encodePng, ihdr, joinBytes, makeChunk, PNG_SIGNATURE, pngImageData, put32, readChunks } from '../../src/io/png';
import { apngDelayMs, ApngProblem, decodeApng, isApng } from '../../src/pixel/import/apng';
import { cutPicture, defaultCut, spriteDoc } from '../../src/pixel/import/build';
import { decodePicture } from '../../src/pixel/import/picture';
import { drawingAt } from '../../src/core/doc';
import type { PixelDrawing, PixelLayer } from '../../src/core/format';

const dir = new URL('../fixtures/apng/', import.meta.url);
const load = (name: string) => new Uint8Array(readFileSync(new URL(name + '.png', dir)));
const want = (name: string): { width: number; height: number; frames: { delay: number; rgba: string }[] } => JSON.parse(readFileSync(new URL(name + '.expected.json', dir), 'utf8'));
const hex = (a: Uint8ClampedArray) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('hex');

describe('APNG reader on real files', () => {
  for (const name of ['blocks', 'dispose', 'hidden', 'ffmpeg']) {
    it(`${name}.png: size, delays and every frame match Pillow`, () => {
      const bytes = load(name);
      expect(isApng(bytes)).toBe(true);
      const g = decodeApng(bytes);
      const e = want(name);
      expect([g.width, g.height]).toEqual([e.width, e.height]);
      expect(g.frames.length).toBe(e.frames.length);
      g.frames.forEach((f, i) => {
        expect(f.delay).toBe(e.frames[i].delay);
        // Opaque pixels exactly (a soft pixel may differ by one in the rounding), see-through ones by being see-through.
        const a = hex(f.pixels);
        const b = e.frames[i].rgba;
        for (let p = 0; p < a.length; p += 8) {
          const aa = parseInt(a.slice(p + 6, p + 8), 16);
          const ba = parseInt(b.slice(p + 6, p + 8), 16);
          expect(Math.abs(aa - ba), `frame ${i} pixel ${p / 8} alpha`).toBeLessThanOrEqual(1);
          if (aa === 255) expect(a.slice(p, p + 8), `frame ${i} pixel ${p / 8}`).toBe(b.slice(p, p + 8));
          else if (aa > 0) for (let k = 0; k < 3; k++) expect(Math.abs(parseInt(a.slice(p + k * 2, p + k * 2 + 2), 16) - parseInt(b.slice(p + k * 2, p + k * 2 + 2), 16)), `frame ${i} pixel ${p / 8} colour`).toBeLessThanOrEqual(2);
        }
      });
    });
  }

  it('reads the play count', () => {
    expect(decodeApng(load('blocks')).loops).toBe(2);
    expect(decodeApng(load('dispose')).loops).toBe(0);
  });

  it('leaves out the picture meant for viewers that cannot animate', () => {
    const g = decodeApng(load('hidden'));
    expect(g.frames).toHaveLength(3);
    // Frame 0 is the first stripe on see-through, not the white stand-in picture.
    expect(g.frames[0].pixels[3]).toBe(255);
    expect(g.frames[0].pixels[(0 * 10 + 5) * 4 + 3]).toBe(0);
  });

  it('delays: hundredths and thousandths, 0 and 10 ms show as a tenth of a second', () => {
    expect(apngDelayMs(1, 10)).toBe(100);
    expect(apngDelayMs(1, 100)).toBe(100);
    expect(apngDelayMs(0, 0)).toBe(100);
    expect(apngDelayMs(5, 0)).toBe(50);
    expect(apngDelayMs(25, 100)).toBe(250);
    expect(apngDelayMs(40, 1000)).toBe(40);
  });
});

describe('APNG from Frameling\'s own writer', () => {
  it('comes back frame for frame', () => {
    const w = new ApngWriter({ width: 5, height: 4, fps: 10, loop: true }, 3);
    const imgs = [0, 1, 2].map((i) => {
      const px = new Uint8ClampedArray(5 * 4 * 4);
      px.set([i * 100, 20, 30, 40 + i * 80], (i * 3 + 1) * 4);
      return { width: 5, height: 4, pixels: px };
    });
    imgs.forEach((im) => w.addFrame(im));
    const g = decodeApng(w.finish());
    expect(g.frames.map((f) => f.delay)).toEqual([100, 100, 100]);
    g.frames.forEach((f, i) => expect([...f.pixels]).toEqual([...imgs[i].pixels]));
  });
});

/** A hand-made APNG: a 2 x 1 canvas and frames given as region, pixels, dispose and blend. */
function handmade(frames: { x: number; w: number; px: number[]; dispose: number; blend: number }[]): Uint8Array {
  const parts: Uint8Array[] = [PNG_SIGNATURE, makeChunk('IHDR', ihdr(2, 1))];
  const actl = new Uint8Array(8);
  put32(actl, 0, frames.length);
  parts.push(makeChunk('acTL', actl));
  let seq = 0;
  frames.forEach((f, i) => {
    const c = new Uint8Array(26);
    put32(c, 0, seq++);
    put32(c, 4, f.w);
    put32(c, 8, 1);
    put32(c, 12, f.x);
    c[23] = 100; // 10 / 100 s
    c[21] = 10;
    c[24] = f.dispose;
    c[25] = f.blend;
    parts.push(makeChunk('fcTL', c));
    const data = pngImageData({ width: f.w, height: 1, pixels: new Uint8ClampedArray(f.px) }, 'none', 1);
    if (i === 0) parts.push(makeChunk('IDAT', data));
    else {
      const d = new Uint8Array(4 + data.length);
      put32(d, 0, seq++);
      d.set(data, 4);
      parts.push(makeChunk('fdAT', d));
    }
  });
  parts.push(makeChunk('IEND', new Uint8Array(0)));
  return joinBytes(parts);
}

describe('APNG dispose and blend steps (hand-made file, worked out by hand)', () => {
  it('blend over mixes with what is there, dispose previous puts the canvas back, dispose background clears the region', () => {
    const g = decodeApng(
      handmade([
        { x: 0, w: 2, px: [255, 0, 0, 255, 0, 0, 0, 0], dispose: 0, blend: 0 },
        { x: 1, w: 1, px: [0, 0, 255, 128], dispose: 2, blend: 1 },
        { x: 1, w: 1, px: [0, 255, 0, 128], dispose: 0, blend: 1 },
        { x: 0, w: 1, px: [0, 0, 255, 128], dispose: 1, blend: 1 },
        { x: 1, w: 1, px: [9, 9, 9, 255], dispose: 0, blend: 0 },
      ]),
    );
    const px = (i: number) => [...g.frames[i].pixels];
    expect(px(0)).toEqual([255, 0, 0, 255, 0, 0, 0, 0]);
    expect(px(1)).toEqual([255, 0, 0, 255, 0, 0, 255, 128]);
    // The blue pixel went away with its frame, so green lands on nothing.
    expect(px(2)).toEqual([255, 0, 0, 255, 0, 255, 0, 128]);
    // Half blue over red is a purple that is fully solid.
    expect(px(3)).toEqual([127, 0, 128, 255, 0, 255, 0, 128]);
    // That frame cleared its own pixel afterwards, so the next one has nothing there.
    expect(px(4)).toEqual([0, 0, 0, 0, 9, 9, 9, 255]);
    expect(g.frames.map((f) => f.delay)).toEqual([100, 100, 100, 100, 100]);
  });
});

describe('APNG problems and the picture reader', () => {
  it('a plain PNG is not animated', () => {
    expect(isApng(encodePng({ width: 2, height: 2, pixels: new Uint8ClampedArray(16) }))).toBe(false);
    expect(() => decodeApng(encodePng({ width: 2, height: 2, pixels: new Uint8ClampedArray(16) }))).toThrow(ApngProblem);
  });

  it('a frame outside the picture is said in plain words', () => {
    const bytes = load('blocks');
    const bad = new Uint8Array(bytes);
    // Find the first fcTL and push its x offset past the picture (the crc no longer matches, so rebuild the chunk).
    const at = bad.findIndex((_, i) => bad[i] === 0x66 && bad[i + 1] === 0x63 && bad[i + 2] === 0x54 && bad[i + 3] === 0x4c);
    const data = bad.slice(at + 4, at + 4 + 26);
    data[15] = 200;
    const fixed = joinBytes([bad.slice(0, at - 4), makeChunk('fcTL', data), bad.slice(at + 4 + 26 + 4)]);
    expect(() => decodeApng(fixed)).toThrow(/outside the picture/);
  });

  it('decodePicture gives every frame with its delay, as a GIF does', async () => {
    const pic = await decodePicture(load('blocks'));
    expect(pic.kind).toBe('apng');
    expect(pic.frames.map((f) => f.delay)).toEqual([20, 50, 100, 300]);
    expect(pic.frames).toHaveLength(4);
  });

  it('a damaged animation still gives its first picture, with a note', async () => {
    // A real APNG whose second frame's picture data is rubbish (the chunk's crc is right, so only the frame is bad).
    const chunks = readChunks(load('blocks'));
    let n = 0;
    const parts = [PNG_SIGNATURE, ...chunks.map((c) => makeChunk(c.type, c.type === 'fdAT' && n++ === 0 ? joinBytes([c.data.subarray(0, 4), new Uint8Array(30).fill(7)]) : c.data))];
    const pic = await decodePicture(joinBytes(parts));
    expect(pic.frames).toHaveLength(1);
    expect(pic.notes.join(' ')).toMatch(/first picture/);
  });

  it('builds a sprite with one cel per frame and the delays as timing', async () => {
    const pic = await decodePicture(load('dispose'));
    const { doc } = spriteDoc(cutPicture(pic, defaultCut()), { way: 'animation', name: 'Anim', rowsAsSprites: true, palette: false });
    const layer = doc.layers[0] as PixelLayer;
    expect(layer.cels.length).toBeGreaterThan(1);
    expect(doc.length).toBe(5);
    expect(drawingAt(doc, layer, 0)).toBeDefined();
    expect((drawingAt(doc, layer, 0) as PixelDrawing).kind).toBe('pixel');
  });
});

describe('interlaced (Adam7) pictures', () => {
  const same = (name: string, got: { width: number; height: number; pixels: Uint8ClampedArray }, e: ReturnType<typeof want>, i = 0) => {
    expect([got.width, got.height], name).toEqual([e.width, e.height]);
    const a = hex(got.pixels);
    const b = e.frames[i].rgba;
    for (let p = 0; p < a.length; p += 8) {
      const aa = parseInt(a.slice(p + 6, p + 8), 16);
      expect(Math.abs(aa - parseInt(b.slice(p + 6, p + 8), 16)), `${name} pixel ${p / 8} alpha`).toBeLessThanOrEqual(1);
      if (aa === 255) expect(a.slice(p, p + 8), `${name} pixel ${p / 8}`).toBe(b.slice(p, p + 8));
    }
  };

  it('an interlaced animated PNG gives every frame, the same as the plain file', () => {
    const bytes = load('interlaced');
    expect(readChunks(bytes).find((c) => c.type === 'IHDR')!.data[12]).toBe(1);
    expect(isApng(bytes)).toBe(true);
    const g = decodeApng(bytes);
    const e = want('interlaced');
    expect(g.frames.length).toBe(e.frames.length);
    g.frames.forEach((f, i) => {
      same(`frame ${i}`, { width: g.width, height: g.height, pixels: f.pixels }, e, i);
      expect(f.delay).toBe([20, 50, 100, 300].map((d) => apngDelayMs(d, 1000))[i]);
    });
    expect(g.notes).toEqual([]);
  });

  it('decodePicture takes all of an interlaced animated PNG, not only its first picture', async () => {
    const p = await decodePicture(load('interlaced'));
    expect(p.kind).toBe('apng');
    expect(p.frames).toHaveLength(4);
    expect(p.notes).toEqual([]);
  });

  it('interlaced 16-bit grey reads as the same picture without interlacing', async () => {
    const a = await decodePicture(load('interlaced-gray16'));
    const b = await decodePicture(load('plain-gray16'));
    expect(readChunks(load('plain-gray16')).find((c) => c.type === 'IHDR')!.data[12]).toBe(0);
    expect([a.width, a.height]).toEqual([b.width, b.height]);
    expect(hex(a.frames[0].pixels)).toBe(hex(b.frames[0].pixels));
  });

  // Written by ImageMagick, judged by Pillow: RGBA, a 4-bit palette and 1-bit.
  for (const name of ['rgba', 'pal', 'mono']) {
    it(`interlaced-${name}.png is read as a still picture`, async () => {
      const bytes = load('interlaced-' + name);
      expect(readChunks(bytes).find((c) => c.type === 'IHDR')!.data[12]).toBe(1);
      const p = await decodePicture(bytes);
      expect(p.kind).toBe('png');
      same(name, { width: p.width, height: p.height, pixels: p.frames[0].pixels }, want('interlaced-' + name));
    });
  }
});
