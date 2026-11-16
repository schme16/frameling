import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { checkFrame, unzstd, ZstdProblem } from '../../src/import/layered/zstdSafe';
import { solidTile, zstdRaw } from './craftBuilder';

const says = (fn: () => unknown, re: RegExp) => {
  let e: unknown = null;
  try {
    fn();
  } catch (x) {
    e = x;
  }
  expect(e).toBeInstanceOf(ZstdProblem);
  expect((e as Error).message).toMatch(re);
};

describe('zstandard tiles from somebody else\'s file', () => {
  it('decodes a real tile from a real Photocraft file, to the 256 x 256 RGBA tile it is', () => {
    const zip = unzipSync(new Uint8Array(readFileSync(new URL('../fixtures/import/test.pcraft', import.meta.url))));
    const tiles = Object.keys(zip).filter((n) => n.endsWith('.zst'));
    expect(tiles.length).toBe(6);
    for (const t of tiles) expect(unzstd(zip[t], 1 << 20).length).toBe(256 * 256 * 4);
  });

  it('decodes a frame of raw blocks, including one bigger than a block, with or without a checksum', () => {
    const data = new Uint8Array(300_000).map((_, i) => i % 251);
    expect([...unzstd(zstdRaw(data), 1 << 20).subarray(0, 5)]).toEqual([0, 1, 2, 3, 4]);
    expect(unzstd(zstdRaw(data, { checksum: true }), 1 << 20).length).toBe(300_000);
  });

  it('refuses what is not zstandard at all', () => {
    says(() => unzstd(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 100), /not a zstandard frame/);
    says(() => unzstd(new Uint8Array(3), 100), /not a zstandard frame/);
  });

  it('refuses a frame that says it is bigger than a tile should be, before anything is allocated', () => {
    // Declares 3 GB of output in a frame a few bytes long: a decompression bomb.
    const bomb = zstdRaw(new Uint8Array(10), { declare: 3_000_000_000 });
    says(() => unzstd(bomb, 1 << 20), /bigger than a tile/);
  });

  it('refuses a frame whose window is huge', () => {
    // Not single segment, window descriptor 0xf8: a window of about 3 GB.
    const f = new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 0x00, 0xf8, 0x01, 0x00, 0x00]);
    says(() => checkFrame(f), /too much memory/);
  });

  it('refuses a frame with no size, with a dictionary, with a reserved bit, or that stops short', () => {
    // (a frame that says nothing about its size is fine, as real files have: it is bounded by its blocks)
    says(() => checkFrame(new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 0xa1, 0, 0, 0, 0, 1, 0, 0, 0])), /dictionary/);
    says(() => checkFrame(new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 0xa8, 0, 0, 0, 0, 1, 0, 0, 0])), /reserved/);
    const whole = zstdRaw(new Uint8Array(100));
    says(() => checkFrame(whole.subarray(0, whole.length - 20)), /stops short/);
  });

  it('bounds a frame that does not say its size by its blocks: ten compressed blocks could be over a megabyte', () => {
    // No size, a 1 KB window, then ten blocks of the compressed kind (the bytes inside do not matter: the header is enough).
    const blocks: number[] = [];
    for (let i = 0; i < 10; i++) blocks.push(((i === 9 ? 1 : 0) | (2 << 1) | (4 << 3)) & 255, 0, 0, 1, 2, 3, 4);
    const f = new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 0x00, 0x00, ...blocks]);
    says(() => unzstd(f, 1000), /bigger than a tile/);
    expect(checkFrame(f, 10_000_000).size).toBeNull();
  });

  it('refuses a second frame hidden after the first, which would be a way round the size check', () => {
    const one = zstdRaw(solidTile(4, [1, 2, 3, 4]));
    says(() => unzstd(new Uint8Array([...one, ...one]), 1 << 20), /more after the end/);
  });

  it('refuses a frame that is not the size it says, and one with a block of a kind that does not exist', () => {
    says(() => unzstd(zstdRaw(new Uint8Array(100), { declare: 90 }), 1 << 20), /damaged|not the size it says/);
    says(() => unzstd(zstdRaw(new Uint8Array(100), { declare: 120 }), 1 << 20), /smaller than it says/);
    const bad = zstdRaw(new Uint8Array(100));
    bad[9] |= 6;
    says(() => checkFrame(bad), /kind that does not exist/);
  });
});
