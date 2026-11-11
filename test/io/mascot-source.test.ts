import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { newDoc, newPixelLayer } from '../../src/core/doc';
import type { Doc, PixelDrawing } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import { decodePng } from '../../src/io/png';
import { blankImage, docToIcons, docToSheet, iconSvg, sameImage, scaleNearest, sheetToDoc, MASCOT_FPS } from '../../scripts/mascot/sheet';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => new Uint8Array(readFileSync(join(ROOT, rel)));
const png = (rel: string) => decodePng(read(rel));
const json = (rel: string) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));

describe('mascot.frameling (the source of the app mascot)', () => {
  const { doc, warnings, manifest } = loadFile(read('brand/mascot/mascot.frameling'));
  // Until someone saves it from Frameling, the file is exactly what the one-time conversion wrote.
  const unedited = manifest.app === 'convert-from-quill';

  it('opens cleanly with one clip per animation', () => {
    expect(warnings).toEqual([]);
    expect(doc.width).toBe(48);
    expect(doc.fps).toBe(MASCOT_FPS);
    expect(doc.clips.map((c) => c.name)).toEqual(['idle', 'wave', 'talk', 'point', 'cheer', 'think', 'draw', 'sleep', 'oops']);
    expect(doc.clips.find((c) => c.name === 'cheer')!.loop).toBe(false);
  });

  it.runIf(unedited)('builds a sheet pixel identical to the old generator, with the same frame list', () => {
    const built = docToSheet(doc);
    expect(built.warnings).toEqual([]);
    expect(sameImage(built.image, png('brand/quill/b/quill.png'))).toBe(true);
    expect(built.meta).toEqual(json('brand/quill/b/quill.json'));
  });

  it('the committed public/mascot files are up to date with it', () => {
    const built = docToSheet(doc);
    expect(sameImage(png('public/mascot/mascot.png'), built.image)).toBe(true);
    expect(json('public/mascot/mascot.json')).toEqual(built.meta);
  });
});

describe('mascot-icon.frameling', () => {
  const file = loadFile(read('brand/mascot/mascot-icon.frameling'));
  const icons = docToIcons(file.doc);

  it.runIf(file.manifest.app === 'convert-from-quill')('gives the old icon art back at 1x', () => {
    expect(sameImage(icons.pngs['public/mascot/logo.png'], png('brand/quill/icons/icon32.png'))).toBe(true);
    expect(sameImage(icons.pngs['build/icons/16x16.png'], png('brand/quill/icons/icon16.png'))).toBe(true);
  });

  it('the committed icon files are up to date with it', () => {
    for (const [rel, img] of Object.entries(icons.pngs)) expect(sameImage(png(rel), img), rel).toBe(true);
    expect(readFileSync(join(ROOT, 'build/icon.svg'), 'utf8')).toBe(icons.svg);
    expect(icons.pngs['build/icon.png'].width).toBe(1024);
    expect(icons.pngs['build/icons/48x48.png'].width).toBe(48);
  });
});

// ---------------------------------------------------------------- the maths, on small made-up documents

function solid(w: number, h: number, rgba: number[]): PixelDrawing['pixels'] {
  const p = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < p.length; i += 4) p.set(rgba, i);
  return p;
}

function tiny(): Doc {
  const doc = newDoc({ name: 't', width: 2, height: 2, fps: 10, length: 6 });
  const layer = newPixelLayer('Art', 1);
  doc.layers = [layer];
  doc.drawings = {
    red: { id: 'red', kind: 'pixel', width: 2, height: 2, pixels: solid(2, 2, [255, 0, 0, 255]) },
    blue: { id: 'blue', kind: 'pixel', width: 2, height: 2, pixels: solid(2, 2, [0, 0, 255, 255]) },
  };
  layer.cels = [
    { id: 'a', start: 0, length: 2, drawingId: 'red' },
    { id: 'b', start: 2, length: 1, drawingId: 'blue' },
    { id: 'c', start: 3, length: 3, drawingId: 'red' },
  ];
  doc.clips = [
    { id: 'c1', name: 'go', start: 0, end: 3, loop: true },
    { id: 'c2', name: 'stop', start: 4, end: 5, loop: false },
  ];
  return doc;
}

describe('docToSheet', () => {
  it('one frame per cel within a clip, ms from the exposure, drawings shared across clips', () => {
    const { meta, image } = docToSheet(tiny(), 4);
    expect(meta.anims.go).toEqual({ loop: true, frames: [{ x: 0, y: 0, ms: 200 }, { x: 2, y: 0, ms: 100 }, { x: 0, y: 0, ms: 100 }] });
    // A cel cut by the clip boundary counts only its frames inside the clip.
    expect(meta.anims.stop).toEqual({ loop: false, frames: [{ x: 0, y: 0, ms: 200 }] });
    expect(image.width).toBe(8);
    expect(image.height).toBe(2);
  });

  it('wraps tiles onto new rows', () => {
    const { meta, image } = docToSheet(tiny(), 1);
    expect(meta.anims.go.frames[1]).toEqual({ x: 0, y: 2, ms: 100 });
    expect(image.height).toBe(4);
  });

  it('flattens visible pixel layers, skips hidden ones and warns about vector ones', () => {
    const doc = tiny();
    const top = newPixelLayer('Top', 2);
    top.cels = [{ id: 't', start: 0, length: 1, drawingId: 'dot' }];
    doc.drawings.dot = { id: 'dot', kind: 'pixel', width: 1, height: 1, pixels: new Uint8ClampedArray([0, 255, 0, 255]) };
    const hidden = { ...newPixelLayer('Ref', 1), visible: false, cels: [{ id: 'h', start: 0, length: 6, drawingId: 'blue' }] };
    doc.layers.push(top, hidden, { id: 'v', name: 'Sketch', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [] });
    const { meta, image, warnings } = docToSheet(doc, 8);
    expect(warnings.some((w) => w.includes('Sketch'))).toBe(true);
    // Frame 0 has the green dot over red (scaled up 2x to cover the stage); frame 1 is plain red again, a new tile.
    expect(Array.from(image.pixels.subarray(0, 4))).toEqual([0, 255, 0, 255]);
    expect(meta.anims.go.frames.map((f) => f.x)).toEqual([0, 2, 4, 2]);
  });

  it('a document with no clips is one looping "idle"', () => {
    const doc = tiny();
    doc.clips = [];
    expect(Object.keys(docToSheet(doc).meta.anims)).toEqual(['idle']);
  });

  it('warns when a hold is not a whole ms', () => {
    const doc = tiny();
    doc.fps = 3;
    expect(docToSheet(doc).warnings.length).toBeGreaterThan(0);
  });
});

describe('sheetToDoc round trip', () => {
  it('a sheet goes to a document, through a saved file, and back unchanged', () => {
    const sheet = blankImage(6, 3);
    sheet.pixels.set([10, 20, 30, 255], 0);
    sheet.pixels.set([40, 50, 60, 255], 3 * 4);
    const meta = { frameW: 3, frameH: 3, anims: { a: { loop: true, frames: [{ x: 0, y: 0, ms: 70 }, { x: 3, y: 0, ms: 500 }, { x: 0, y: 0, ms: 10 }] }, b: { loop: false, frames: [{ x: 3, y: 0, ms: 120 }] } } };
    const doc = loadFile(saveFile(sheetToDoc(sheet, meta))).doc;
    expect(Object.keys(doc.drawings)).toHaveLength(2);
    expect(doc.length).toBe(7 + 50 + 1 + 12);
    const back = docToSheet(doc, 2);
    expect(back.meta).toEqual(meta);
    expect(sameImage(back.image, sheet)).toBe(true);
  });
});

describe('icon helpers', () => {
  it('scales by whole pixels and writes one rect per run', () => {
    const img = blankImage(2, 1);
    img.pixels.set([255, 0, 0, 255, 255, 0, 0, 255]);
    expect(scaleNearest(img, 3).width).toBe(6);
    expect(iconSvg(img)).toContain('<rect x="0" y="0" width="2" height="1" fill="#ff0000"/>');
  });
});
