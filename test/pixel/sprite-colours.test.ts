import { afterEach, describe, expect, it } from 'vitest';
import { sampledFrames, spriteDoc, spriteInto, spritePalette, type Sprite } from '../../src/pixel/import/build';
import { isSmall, pickSpritePalette, SMALL_BYTES, spritePixels } from '../../src/pixel/import/spriteColours';
import { setQuantiseWorker } from '../../src/pixel/quantiseRun';
import { paletteFromPixels } from '../../src/pixel/palette-io';
import { newDoc } from '../../src/core/doc';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** A photo-like frame: smooth gradients with a little noise, so it has thousands of colours. Alpha 255 unless `solid` is false. */
function photoFrame(w: number, h: number, seed: number, solid = true): Uint8ClampedArray {
  const r = rng(seed);
  const p = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const y = Math.floor(i / w);
    p[i * 4] = (x * 255) / w + r() * 12;
    p[i * 4 + 1] = (y * 255) / h + r() * 12;
    p[i * 4 + 2] = ((x + y) * 127) / (w + h) + r() * 12;
    p[i * 4 + 3] = solid ? 255 : 0;
  }
  return p;
}

function spriteOf(frames: Uint8ClampedArray[], w: number, h: number): Sprite {
  return {
    width: w,
    height: h,
    frames: frames.map((pixels, i) => ({ image: { width: w, height: h, pixels }, row: i })),
    tags: [],
    slices: [],
    groups: frames.map((_, i) => ({ name: `Frame ${i + 1}`, frames: [i] })),
    notes: [],
  };
}

const big = (seed = 1, solid = true) => spriteOf([photoFrame(300, 300, seed, solid)], 300, 300); // 360 KB of pixels
const tiny = () => spriteOf([photoFrame(8, 8, 2)], 8, 8);
const opts = { way: 'picture' as const, name: 'Pic', rowsAsSprites: false, palette: true };

describe('picking a sprite palette off the page', () => {
  afterEach(() => setQuantiseWorker(undefined));

  it('tells small from big by the pixel bytes of the sampled frames', () => {
    expect(isSmall(tiny())).toBe(true);
    expect(big().frames[0].image.pixels.length).toBeGreaterThan(SMALL_BYTES);
    expect(isSmall(big())).toBe(false);
  });

  it('a small sprite gives exactly what the one-go pick gives', async () => {
    const s = tiny();
    expect(await pickSpritePalette(s, 'x')).toEqual(spritePalette(s, 'x'));
  });

  it('a big sprite gives at most 256 colours, the same ones the one-go pick gives', async () => {
    setQuantiseWorker(null);
    const s = big();
    const p = (await pickSpritePalette(s, 'Pic'))!;
    expect(p.name).toBe('Pic');
    expect(p.colors.length).toBeGreaterThan(100);
    expect(p.colors.length).toBeLessThanOrEqual(256);
    expect([...p.colors].sort()).toEqual([...paletteFromPixels(s.frames[0].image.pixels, 'Pic', 256).colors].sort());
  });

  it('a picture with no solid pixels gives no palette, small or big', async () => {
    setQuantiseWorker(null);
    expect(await pickSpritePalette(big(1, false), 'x')).toBeNull();
    expect(await pickSpritePalette(spriteOf([photoFrame(8, 8, 1, false)], 8, 8), 'x')).toBeNull();
  });

  it('counts several frames together, and samples a long animation', async () => {
    setQuantiseWorker(null);
    const many = spriteOf(Array.from({ length: 130 }, (_, i) => photoFrame(20, 20, i)), 20, 20);
    expect(sampledFrames(many).length).toBeLessThanOrEqual(65);
    expect(spritePixels(many).length).toBe(sampledFrames(many).length);
    const p = (await pickSpritePalette(many, 'Anim'))!;
    expect(p.colors.length).toBeLessThanOrEqual(256);
  });

  it('keeps the page alive: timers fire while a big picture is being counted', async () => {
    setQuantiseWorker(null);
    let ticks = 0;
    const t = setInterval(() => ticks++, 1);
    await pickSpritePalette(spriteOf([photoFrame(1200, 1200, 3)], 1200, 1200), 'Huge');
    clearInterval(t);
    expect(ticks).toBeGreaterThan(0);
  });

  it('reports progress up to 1', async () => {
    setQuantiseWorker(null);
    const seen: number[] = [];
    await pickSpritePalette(spriteOf([photoFrame(1200, 1200, 4)], 1200, 1200), 'Huge', (f) => seen.push(f));
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toBe(1);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });
});

describe('the builders use colours they are handed', () => {
  const given = { name: 'Given', colors: ['#112233', '#445566'] };

  it('a new drawing takes the handed palette and does not pick its own', () => {
    const { doc } = spriteDoc(tiny(), { ...opts, colours: given });
    expect(doc.palette).toEqual(given);
  });
  it('null means no colours to take, so the drawing keeps the default palette', () => {
    expect(spriteDoc(tiny(), { ...opts, colours: null }).doc.palette).toBeUndefined();
  });
  it('without colours it still picks them itself', () => {
    const { doc } = spriteDoc(tiny(), opts);
    expect(doc.palette!.colors.length).toBeGreaterThan(5);
  });
  it('added to an open drawing, the handed colours are merged into its palette', () => {
    const d = newDoc({ name: 'x', width: 20, height: 20 });
    d.palette = { name: 'Mine', colors: ['#ffffff'] };
    spriteInto(d, tiny(), { ...opts, colours: given });
    expect(d.palette!.colors).toEqual(['#ffffff', '#112233', '#445566']);
  });
});
