import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { newDoc, newPixelLayer } from '../../src/core/doc';
import type { Doc, PixelDrawing } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import { decodePng } from '../../src/io/png';
import { blankImage, copyClip, crop, docToIcons, docToSheet, iconSvg, sameImage, scaleNearest, sheetToDoc, MASCOT_FPS } from '../../scripts/mascot/sheet';

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
    expect(doc.clips.map((c) => c.name)).toEqual(['idle', 'wave', 'talk', 'point', 'cheer', 'think', 'draw', 'sleep', 'oops', 'sad', 'wave-sad', 'dazed', 'wake']);
    expect(doc.clips.find((c) => c.name === 'cheer')!.loop).toBe(false);
    expect(doc.clips.find((c) => c.name === 'sad')!.loop).toBe(true);
    expect(doc.clips.find((c) => c.name === 'wave-sad')!.loop).toBe(false);
    expect(doc.clips.find((c) => c.name === 'wake')!.loop).toBe(false);
  });

  // Laying the file out as parts changed no picture and no hold: the original animations keep their timing,
  // and the ones without an arm are still the old generator's pixels.
  it.runIf(['mascot.mjs', 'add-sad', 'add-dazed', 'add-wake', 'redraw-arms'].includes(manifest.app))('kept the original animations as they were (bar the arms)', () => {
    const built = docToSheet(doc);
    const old = json('brand/quill/b/quill.json');
    const oldPng = png('brand/quill/b/quill.png');
    for (const [name, a] of Object.entries(old.anims) as [string, { frames: { x: number; y: number; ms: number }[] }][]) {
      const now = built.meta.anims[name];
      expect(now.frames.map((f) => f.ms), name).toEqual(a.frames.map((f) => f.ms));
      if (!['idle', 'talk', 'sleep', 'oops'].includes(name)) continue;
      now.frames.forEach((f, i) => {
        const was = a.frames[i];
        expect(sameImage(crop(built.image, f.x, f.y, 48, 48), crop(oldPng, was.x, was.y, 48, 48)), `${name} ${i}`).toBe(true);
      });
    }
  });

  it.runIf(unedited)('builds a sheet pixel identical to the old generator, with the same frame list', () => {
    const built = docToSheet(doc);
    expect(built.warnings).toEqual([]);
    expect(sameImage(built.image, png('brand/quill/b/quill.png'))).toBe(true);
    expect(built.meta).toEqual(json('brand/quill/b/quill.json'));
  });

  // The file is a drawing, so it is laid out like one: a layer per part of him, in folders, with his own named colours.
  it('is laid out as the parts of a pose, in folders, with a named palette', () => {
    expect(doc.layers.map((l) => l.name)).toEqual(['Body', 'Feet', 'Hood', 'Pencil quills', 'Ear', 'Face', 'Cheeks', 'Eyes', 'Mouth', 'Arms', 'Extras']);
    const folderOf = (name: string) => doc.folders?.[doc.layers.find((l) => l.name === name)!.folder!]?.name;
    expect(['Body', 'Feet'].map(folderOf)).toEqual(['Body', 'Body']);
    expect(['Hood', 'Pencil quills', 'Ear', 'Face'].map(folderOf)).toEqual(['Head', 'Head', 'Head', 'Head']);
    expect(['Cheeks', 'Eyes', 'Mouth'].map(folderOf)).toEqual(['Face', 'Face', 'Face']);
    expect(['Arms', 'Extras'].map(folderOf)).toEqual(['Arms and extras', 'Arms and extras']);
    for (const l of doc.layers) {
      expect(l.kind, l.name).toBe('pixel');
      expect(l.cels.length, l.name).toBeGreaterThan(0);
      let at = 0;
      for (const c of l.cels) {
        expect(c.start, `${l.name} ${c.id}`).toBeGreaterThanOrEqual(at);
        at = c.start + c.length;
        expect(doc.drawings[c.drawingId], c.drawingId).toBeTruthy();
      }
      expect(at, l.name).toBeLessThanOrEqual(doc.length);
    }
    // Every drawing is used and belongs to the layer its name says.
    const used = new Set(doc.layers.flatMap((l) => l.cels.map((c) => c.drawingId)));
    expect(Object.keys(doc.drawings).filter((id) => !used.has(id))).toEqual([]);
    // Every clip is whole: it starts where the one before ended and nothing is left over at the end.
    doc.clips.forEach((c, i) => expect(c.start).toBe(i ? doc.clips[i - 1].end + 1 : 0));
    expect(doc.clips[doc.clips.length - 1].end).toBe(doc.length - 1);
    // The palette is his: named, in ramps, and holds every colour he is drawn with.
    expect(doc.palette?.name).toBe('Quill');
    expect(doc.palette?.names?.every(Boolean)).toBe(true);
    expect(doc.palette?.rampNames?.[0]).toBeTruthy();
    const inPalette = new Set(doc.palette!.colors.map((c) => c.toLowerCase()));
    const stray = new Set<string>();
    for (const d of Object.values(doc.drawings)) {
      if (d.kind !== 'pixel') continue;
      for (let i = 0; i < d.pixels.length; i += 4) {
        if (!d.pixels[i + 3]) continue;
        const hex = '#' + [0, 1, 2].map((k) => d.pixels[i + k].toString(16).padStart(2, '0')).join('');
        if (!inPalette.has(hex)) stray.add(hex);
      }
    }
    expect([...stray]).toEqual([]);
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

describe('copyClip', () => {
  const copied = () => {
    const doc = tiny();
    const clip = copyClip(doc, 'go', 'go again');
    return { doc, clip };
  };

  it('adds the copy after the last frame, on every layer, under the new name', () => {
    const { doc, clip } = copied();
    expect(doc.length).toBe(10);
    expect(clip).toMatchObject({ name: 'go again', start: 6, end: 9, loop: true });
    expect(doc.clips.map((c) => c.name)).toEqual(['go', 'stop', 'go again']);
    // The cel that crosses the end of "go" is cut to the clip, so the copy is exactly the clip's four frames.
    expect(doc.layers[0].cels.filter((c) => c.start >= 6).map((c) => [c.start, c.length])).toEqual([[6, 2], [8, 1], [9, 1]]);
  });

  it('copies the drawings, so painting on the copy leaves the original alone', () => {
    const { doc } = copied();
    const copy = doc.layers[0].cels.find((c) => c.start === 6)!;
    expect(copy.drawingId).not.toBe('red');
    const d = doc.drawings[copy.drawingId] as PixelDrawing;
    d.pixels.fill(0);
    expect(Array.from((doc.drawings.red as PixelDrawing).pixels.subarray(0, 4))).toEqual([255, 0, 0, 255]);
  });

  it('keeps a drawing that was shown twice as one drawing', () => {
    const { doc } = copied();
    const ids = doc.layers[0].cels.filter((c) => c.start >= 6).map((c) => c.drawingId);
    expect(ids[0]).toBe(ids[2]);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('builds the same animation as the clip it came from', () => {
    const { doc } = copied();
    const { meta, image } = docToSheet(doc, 4);
    const a = meta.anims.go.frames, b = meta.anims['go again'].frames;
    expect(b.map((f) => f.ms)).toEqual(a.map((f) => f.ms));
    // Copied drawings are their own tiles, but they look the same.
    b.forEach((f, i) => expect(sameImage(crop(image, f.x, f.y, 2, 2), crop(image, a[i].x, a[i].y, 2, 2))).toBe(true));
  });

  it('says plainly what is wrong with a bad name', () => {
    const doc = tiny();
    expect(() => copyClip(doc, 'nope', 'x')).toThrow(/no clip called "nope".*go, stop/);
    expect(() => copyClip(doc, 'go', 'stop')).toThrow(/already a clip called "stop"/);
    expect(() => copyClip(doc, 'go', '  ')).toThrow(/Give the new clip a name/);
  });
});

describe('docToSheet', () => {
  it('leaves out layers in a folder that is switched off', () => {
    const doc = tiny();
    const top = newPixelLayer('Top', 1);
    top.folder = 'f';
    top.cels = [{ id: 't', start: 0, length: 6, drawingId: 'blue' }];
    doc.layers.push(top);
    doc.folders = { f: { id: 'f', name: 'Extras', visible: true, opacity: 1 } };
    expect(Array.from(docToSheet(doc, 4).image.pixels.subarray(0, 4))).toEqual([0, 0, 255, 255]);
    doc.folders.f.visible = false;
    expect(Array.from(docToSheet(doc, 4).image.pixels.subarray(0, 4))).toEqual([255, 0, 0, 255]);
  });

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
