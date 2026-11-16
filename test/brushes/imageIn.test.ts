// A picture the person supplies is untrusted: the size is read from the header and refused before anything is unpacked.
import { describe, expect, it } from 'vitest';
import { encodePng } from '../../src/io/png';
import { imageRefusal, ImageProblem, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, peekImageSize, readImageBytes, readImageFile } from '../../src/brushes/imageIn';

const bytes = (...n: number[]): Uint8Array => Uint8Array.from(n);
const be32 = (v: number): number[] => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const le16 = (v: number): number[] => [v & 255, v >> 8];
const le32 = (v: number): number[] => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255];
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const png = (w: number, h: number): Uint8Array => Uint8Array.from([0x89, ...ascii('PNG'), 13, 10, 26, 10, ...be32(13), ...ascii('IHDR'), ...be32(w), ...be32(h), 8, 6, 0, 0, 0]);
const gif = (w: number, h: number): Uint8Array => Uint8Array.from([...ascii('GIF89a'), ...le16(w), ...le16(h), 0, 0, 0]);

describe('reading a picture size from its header', () => {
  it('PNG, GIF, BMP, WebP and JPEG', () => {
    expect(peekImageSize(png(640, 480))).toEqual({ width: 640, height: 480 });
    expect(peekImageSize(gif(20, 30))).toEqual({ width: 20, height: 30 });
    const bmp = new Uint8Array(30);
    bmp.set([0x42, 0x4d]);
    bmp.set(le32(40), 14);
    bmp.set(le32(100), 18);
    bmp.set(le32(-60), 22);
    expect(peekImageSize(bmp)).toEqual({ width: 100, height: 60 });
    const webp = new Uint8Array(30);
    webp.set([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii('VP8X'), 10, 0, 0, 0, 0, 0, 0, 0, 99, 0, 0, 49, 0, 0], 0);
    expect(peekImageSize(webp)).toEqual({ width: 100, height: 50 });
    const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x01, 0xf4, 0x02, 0x58, 3, 1, 0x22, 0]);
    expect(peekImageSize(jpg)).toEqual({ width: 600, height: 500 });
  });

  it('is null for anything else, and for a header cut short', () => {
    expect(peekImageSize(bytes())).toBeNull();
    expect(peekImageSize(bytes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30))).toBeNull();
    expect(peekImageSize(png(5, 5).subarray(0, 20))).toBeNull();
    expect(peekImageSize(Uint8Array.from([0xff, 0xd8, 0xff]))).toBeNull();
  });

  it('does not loop forever on a JPEG with nothing sensible in it', () => {
    expect(peekImageSize(new Uint8Array(100000).fill(0xff).fill(0xd8, 1, 2))).toBeNull();
    expect(peekImageSize(Uint8Array.from([0xff, 0xd8, ...new Array(50).fill(0)]))).toBeNull();
  });
});

describe('turning a picture down before anything is unpacked for it', () => {
  it('says yes to a normal picture', () => {
    expect(imageRefusal(png(300, 300))).toBeNull();
    expect(imageRefusal(png(4000, 4000))).toBeNull();
  });

  it('turns down a picture whose header claims a huge size, however small the file is', () => {
    expect(imageRefusal(png(60000, 60000))).toMatch(/too big/);
    expect(imageRefusal(png(4001, 4000))).toMatch(/too big/);
    expect(imageRefusal(png(9000, 10))).toMatch(/too big/);
    expect(imageRefusal(gif(65535, 65535))).toMatch(/too big/);
    expect(imageRefusal(png(0, 10))).toMatch(/no size/);
    expect(MAX_IMAGE_PIXELS).toBe(16_000_000);
  });

  it('turns down a file that is too long to be read, and one that is not a picture', () => {
    expect(imageRefusal(new Uint8Array(MAX_IMAGE_BYTES + 1))).toMatch(/12 MB/);
    expect(imageRefusal(bytes(80, 75, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0))).toMatch(/PNG, GIF, JPEG, WebP and BMP/);
  });

  it('refuses before decoding: a bomb header gives a plain message and never gets to the decoder', async () => {
    await expect(readImageBytes(png(60000, 60000))).rejects.toThrow(ImageProblem);
    await expect(readImageBytes(png(60000, 60000))).rejects.toThrow(/too big/);
  });

  it('refuses a file by its size before reading it into memory', async () => {
    const f = { size: MAX_IMAGE_BYTES + 1, arrayBuffer: () => Promise.reject(new Error('read it')) } as unknown as File;
    await expect(readImageFile(f)).rejects.toThrow(/12 MB/);
  });
});

describe('reading a picture', () => {
  it('gives back the pixels of a real PNG, and says whether any are see-through', async () => {
    const w = 6;
    const h = 4;
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) pixels.set([10, 20, 30, 255], i * 4);
    const solid = await readImageBytes(encodePng({ width: w, height: h, pixels }));
    expect([solid.width, solid.height, solid.clear]).toEqual([6, 4, false]);
    expect(Array.from(solid.rgba.subarray(0, 4))).toEqual([10, 20, 30, 255]);
    pixels[3] = 0;
    expect((await readImageBytes(encodePng({ width: w, height: h, pixels }))).clear).toBe(true);
  });

  it('says in plain words when a picture cannot be read', async () => {
    const broken = png(10, 10);
    await expect(readImageBytes(broken)).rejects.toThrow(ImageProblem);
  });
});
