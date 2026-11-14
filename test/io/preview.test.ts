// The little picture inside a .frameling file and how lists read it: written on save, found without reading the
// drawing, missing from older files, never taken from a file that changed, kept for a file that had none.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { newDoc } from '../../src/core/doc';
import { loadFileAsync, saveFile } from '../../src/io/file';
import { isBlankPicture, previewDimensions, previewFrameOrder, PREVIEW_MAX_BYTES } from '../../src/io/preview';
import { cacheName, embeddedPreview, forgetSeen, keepPreview, MAX_PREVIEW_BYTES, previewOf, pruneCopies, staleCopies } from '../../src/main/preview';
import { isPng, peekZipEntry } from '../../src/shared/zipTail';

// A real (tiny) PNG: one red pixel.
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64'));

let dir = '';
beforeAll(() => void (dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-preview-'))));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const write = (name: string, bytes: Uint8Array) => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, bytes);
  return f;
};

describe('choosing the picture', () => {
  it('tries the first frame, then where you are, the middle and the last, once each', () => {
    expect(previewFrameOrder(12, 5)).toEqual([0, 5, 11]);
    expect(previewFrameOrder(1, 0)).toEqual([0]);
    expect(previewFrameOrder(10, 99)).toEqual([0, 9, 4]);
  });
  it('knows an empty picture from one with something drawn', () => {
    expect(isBlankPicture(new Uint8ClampedArray([9, 9, 9, 0, 1, 1, 1, 0]))).toBe(true);
    expect(isBlankPicture(new Uint8ClampedArray([0, 0, 0, 0, 1, 1, 1, 3]))).toBe(false);
  });
  it('keeps the shape: the longest side is the size asked for', () => {
    expect(previewDimensions(1920, 1080, 160)).toMatchObject({ w: 160, h: 90 });
    expect(previewDimensions(100, 400, 160)).toMatchObject({ w: 40, h: 160 });
    expect(previewDimensions(0, 0, 160).w).toBeGreaterThanOrEqual(1);
  });
  it('stays small: a few KB is the aim, 40 KB the ceiling', () => expect(PREVIEW_MAX_BYTES).toBeLessThanOrEqual(40_000));
});

describe('in the file', () => {
  it('is written on save, stored, and read back without the drawing', () => {
    const bytes = saveFile(newDoc({ name: 'Ball' }), 'test', new Date(), { preview: PNG });
    const f = write('with.frameling', bytes);
    expect(embeddedPreview(f)).toEqual(PNG);
  });

  it('is left out when there is none (older files and web saves look like this)', () => {
    const f = write('without.frameling', saveFile(newDoc({ name: 'Ball' }), 'test'));
    expect(embeddedPreview(f)).toBeNull();
    expect(previewOf(f, path.join(dir, 'kept'))).toEqual({ state: 'none' });
  });

  it('never gets in the way of opening: the document reads the same with or without it', async () => {
    const a = await loadFileAsync(saveFile(newDoc({ name: 'Ball', length: 9 }), 'test', new Date(2026, 10, 14), { preview: PNG }));
    const b = await loadFileAsync(saveFile(newDoc({ name: 'Ball', length: 9 }), 'test', new Date(2026, 10, 14)));
    expect(a.doc.length).toBe(9);
    expect(a.warnings).toEqual(b.warnings);
    expect(Object.keys(a.doc).sort()).toEqual(Object.keys(b.doc).sort());
  });

  it('is read from the end of the file: a big drawing is not read, only the directory and the picture', () => {
    const big = new Uint8Array(6_000_000);
    for (let i = 0; i < big.length; i += 7) big[i] = (i * 31) & 255;
    const zip = zipSync({ 'manifest.json': strToU8('{}'), 'doc.json': [big, { level: 0 }], 'preview.png': [PNG, { level: 0 }] });
    let read = 0;
    const got = peekZipEntry((pos, len) => {
      const out = zip.subarray(pos, pos + len);
      read += out.length;
      return out;
    }, zip.length, 'preview.png');
    expect(got && new Uint8Array(got.data)).toEqual(PNG);
    expect(read).toBeLessThan(10_000);
  });

  it('reads a compressed entry too, and refuses one that is not a PNG or is too big', () => {
    const packed = zipSync({ 'preview.png': [PNG, { level: 9 }] });
    expect(embeddedPreview(write('packed.frameling', packed))).toEqual(PNG);
    expect(embeddedPreview(write('text.frameling', zipSync({ 'preview.png': strToU8('not a picture, honest') })))).toBeNull();
    const huge = new Uint8Array(MAX_PREVIEW_BYTES + 10);
    huge.set(PNG);
    expect(embeddedPreview(write('huge.frameling', zipSync({ 'preview.png': [huge, { level: 0 }] })))).toBeNull();
  });

  it('copes with a file that is not a zip, is empty, or is cut short', () => {
    expect(embeddedPreview(write('nope.frameling', strToU8('hello')))).toBeNull();
    expect(embeddedPreview(write('empty.frameling', new Uint8Array(0)))).toBeNull();
    const zip = saveFile(newDoc(), 'test', new Date(), { preview: PNG });
    expect(embeddedPreview(write('cut.frameling', zip.subarray(0, zip.length - 40)))).toBeNull();
    expect(isPng(PNG)).toBe(true);
  });
});

describe('what the list shows', () => {
  it('the file has gone: missing', () => expect(previewOf(path.join(dir, 'gone.frameling'), dir)).toEqual({ state: 'missing' }));

  it('its own picture, as a data address', () => {
    const f = write('own.frameling', saveFile(newDoc(), 'test', new Date(), { preview: PNG }));
    const r = previewOf(f, path.join(dir, 'kept'));
    expect(r.state).toBe('picture');
    if (r.state === 'picture') expect(r.url.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('an older file gets the picture kept for it, until the file changes', () => {
    const kept = path.join(dir, 'kept2');
    const f = write('old.frameling', saveFile(newDoc({ name: 'Old' }), 'test'));
    expect(previewOf(f, kept).state).toBe('none');
    keepPreview(kept, f, PNG);
    forgetSeen(f);
    expect(previewOf(f, kept).state).toBe('picture');
    // The file changed (another save elsewhere): the old picture no longer belongs to it.
    fs.writeFileSync(f, saveFile(newDoc({ name: 'Changed', length: 40 }), 'test'));
    forgetSeen(f);
    expect(previewOf(f, kept).state).toBe('none');
  });

  it('keeps one picture per file, refuses what is not a picture, and tidies those whose file left the list', () => {
    const kept = path.join(dir, 'kept3');
    const f = write('a.frameling', saveFile(newDoc(), 'test'));
    keepPreview(kept, f, PNG);
    keepPreview(kept, f, PNG);
    expect(fs.readdirSync(kept).length).toBe(1);
    keepPreview(kept, f, strToU8('not a picture'));
    expect(fs.readdirSync(kept).length).toBe(1);
    pruneCopies(kept, [path.resolve(f)]);
    expect(fs.readdirSync(kept).length).toBe(1);
    pruneCopies(kept, []);
    expect(fs.readdirSync(kept).length).toBe(0);
    expect(staleCopies([cacheName('/a', 1, 2), cacheName('/b', 1, 2)], ['/a'])).toEqual([cacheName('/b', 1, 2)]);
    expect(cacheName('/a', 1, 2)).not.toBe(cacheName('/a', 1, 3));
  });
});
