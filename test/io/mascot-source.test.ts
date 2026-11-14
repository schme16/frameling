import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { newDoc, newPixelLayer } from '../../src/core/doc';
import type { Doc, PixelDrawing } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import { decodePng } from '../../src/io/png';
import { artboardsOf, contentOf, duplicateArtboard, hasArtboards, renameArtboard, reorderArtboard } from '../../src/artboards/model';
import { animationsOf, blankImage, compareSheets, copyAnimation, copyClip, crop, splitIntoArtboards, docToIcons, docToSheet, iconSvg, sameImage, scaleNearest, sheetToDoc, MASCOT_FPS } from '../../scripts/mascot/sheet';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => new Uint8Array(readFileSync(join(ROOT, rel)));
const png = (rel: string) => decodePng(read(rel));
const json = (rel: string) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));

describe('mascot.frameling (the source of the app mascot)', () => {
  const { doc, warnings, manifest } = loadFile(read('brand/mascot/mascot.frameling'));
  // Until someone saves it from Frameling, the file is exactly what the one-time conversion wrote.
  const unedited = manifest.app === 'convert-from-quill';

  const NAMES = ['idle', 'wave', 'talk', 'point', 'cheer', 'think', 'draw', 'sleep', 'oops', 'sad', 'wave-sad', 'dazed', 'wake'];
  const clipOf = (name: string) => contentOf(doc, artboardsOf(doc).find((a) => a.name === name)!.id)!.clips[0];

  it('opens cleanly with one artboard per animation, each with its one clip', () => {
    expect(warnings).toEqual([]);
    expect(doc.width).toBe(48);
    expect(doc.fps).toBe(MASCOT_FPS);
    expect(doc.sharedLayers).toBe(true);
    expect(artboardsOf(doc).map((a) => a.name)).toEqual(NAMES);
    for (const a of artboardsOf(doc)) {
      const c = contentOf(doc, a.id)!;
      expect(c.clips.map((k) => k.name), a.name).toEqual([a.name]);
      // The clip is the whole artboard, from its first frame to its last, so its timeline is only that animation.
      expect([c.clips[0].start, c.clips[0].end], a.name).toEqual([0, c.length - 1]);
    }
    expect(animationsOf(doc).map((x) => x.name)).toEqual(NAMES);
    expect(clipOf('cheer').loop).toBe(false);
    expect(clipOf('sad').loop).toBe(true);
    expect(clipOf('wave-sad').loop).toBe(false);
    expect(clipOf('wake').loop).toBe(false);
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
    for (const l of doc.layers) expect(l.kind, l.name).toBe('pixel');
    let used = new Set<string>();
    for (const a of artboardsOf(doc)) {
      const c = contentOf(doc, a.id)!;
      for (const l of c.layers) {
        let at = 0;
        for (const cel of l.cels) {
          expect(cel.start, `${a.name} ${l.name} ${cel.id}`).toBeGreaterThanOrEqual(at);
          at = cel.start + cel.length;
          expect(doc.drawings[cel.drawingId], cel.drawingId).toBeTruthy();
          used.add(cel.drawingId);
        }
        expect(at, `${a.name} ${l.name}`).toBeLessThanOrEqual(c.length);
      }
    }
    // Every drawing is used by some animation.
    expect(Object.keys(doc.drawings).filter((id) => !used.has(id))).toEqual([]);
    // A cel id is one cel in the whole file, so a selection or a link never means two things.
    const ids = artboardsOf(doc).flatMap((a) => contentOf(doc, a.id)!.layers.flatMap((l) => l.cels.map((c) => c.id)));
    expect(new Set(ids).size).toBe(ids.length);
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

// ---------------------------------------------------------------- one artboard per animation

describe('splitIntoArtboards', () => {
  const split = () => {
    const doc = tiny();
    splitIntoArtboards(doc);
    return doc;
  };

  it('makes an artboard per clip, in clip order, named after the clip, on one shared stack of layers', () => {
    const doc = split();
    expect(doc.sharedLayers).toBe(true);
    expect(hasArtboards(doc)).toBe(true);
    expect(artboardsOf(doc).map((a) => a.name)).toEqual(['go', 'stop']);
    expect(doc.activeArtboard).toBe(artboardsOf(doc)[0].id);
    expect(doc.layers.length).toBe(1);
    // Each artboard is only its own animation, from frame 1, with the clip across all of it.
    expect(artboardsOf(doc).map((a) => contentOf(doc, a.id)!.length)).toEqual([4, 2]);
    expect(artboardsOf(doc).map((a) => contentOf(doc, a.id)!.clips.map((c) => [c.name, c.start, c.end, c.loop]))).toEqual([[['go', 0, 3, true]], [['stop', 0, 1, false]]]);
    expect(doc.length).toBe(4);
    expect(doc.clips.map((c) => c.name)).toEqual(['go']);
  });

  it('cuts a cel that crossed two clips into one on each artboard, with ids of their own', () => {
    const doc = split();
    const stop = contentOf(doc, artboardsOf(doc)[1].id)!.layers[0].cels;
    expect(stop.map((c) => [c.start, c.length, c.drawingId])).toEqual([[0, 2, 'red']]);
    const ids = artboardsOf(doc).flatMap((a) => contentOf(doc, a.id)!.layers[0].cels.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('builds exactly the sheet the one long timeline built: same tiles, same order, same holds', () => {
    const before = docToSheet(tiny(), 4);
    const after = docToSheet(split(), 4);
    expect(after.meta).toEqual(before.meta);
    expect(sameImage(after.image, before.image)).toBe(true);
    expect(after.warnings).toEqual([]);
  });

  it('survives being saved and opened again, still the same sheet', () => {
    const doc = split();
    const again = loadFile(saveFile(doc, 'test', new Date(2026, 10, 14))).doc;
    expect(artboardsOf(again).map((a) => a.name)).toEqual(['go', 'stop']);
    const a = docToSheet(again, 4), b = docToSheet(tiny(), 4);
    expect(a.meta).toEqual(b.meta);
    expect(sameImage(a.image, b.image)).toBe(true);
  });

  it('lays the artboards out in a grid on the pasteboard, none on top of another', () => {
    const doc = tiny();
    doc.length = 6;
    for (let i = 0; i < 4; i++) doc.clips.push({ id: `x${i}`, name: `x${i}`, start: 5, end: 5, loop: false });
    splitIntoArtboards(doc);
    const spots = artboardsOf(doc).map((a) => `${a.x},${a.y}`);
    expect(new Set(spots).size).toBe(spots.length);
  });

  it('says plainly what is wrong', () => {
    expect(() => splitIntoArtboards(split())).toThrow(/already has artboards/);
    const doc = tiny();
    doc.clips = [];
    expect(() => splitIntoArtboards(doc)).toThrow(/no clips/);
  });
});

describe('docToSheet over artboards', () => {
  it('walks the artboards in their order: the tile order follows the artboards, and boards sharing drawings share tiles', () => {
    const doc = tiny();
    splitIntoArtboards(doc);
    reorderArtboard(doc, artboardsOf(doc)[1].id, 0);
    const built = docToSheet(doc, 4);
    expect(Object.keys(built.meta.anims)).toEqual(['stop', 'go']);
    // "stop" now comes first and shows red, which "go" shows too: still two tiles, red first.
    expect(built.meta.anims.stop.frames[0]).toMatchObject({ x: 0, y: 0 });
    expect(built.meta.anims.go.frames.map((f) => f.x)).toEqual([0, 2, 0]);
  });

  it('an artboard with one clip across all of it is named after the artboard, so renaming and duplicating do what they look like', () => {
    const doc = tiny();
    splitIntoArtboards(doc);
    renameArtboard(doc, artboardsOf(doc)[0].id, 'go faster');
    duplicateArtboard(doc, artboardsOf(doc)[1].id);
    const built = docToSheet(doc, 4);
    expect(Object.keys(built.meta.anims)).toEqual(['go faster', 'stop', 'stop 2']);
    expect(built.warnings).toEqual([]);
    expect(built.meta.anims['go faster'].loop).toBe(true);
    // The copy has drawings of its own, so its own tile, but the same holds.
    expect(built.meta.anims['stop 2'].frames.map((f) => f.ms)).toEqual(built.meta.anims.stop.frames.map((f) => f.ms));
  });

  it('keeps the clips of an artboard that has more than one', () => {
    const doc = tiny();
    splitIntoArtboards(doc);
    const again = loadFile(saveFile(doc, 't', new Date(2026, 10, 14))).doc;
    const board = artboardsOf(again).find((a) => a.content)!;
    board.content!.clips = [{ id: 'k1', name: 'first half', start: 0, end: 0, loop: false }, { id: 'k2', name: 'second half', start: 1, end: 1, loop: true }];
    expect(Object.keys(docToSheet(again, 4).meta.anims)).toEqual(['go', 'first half', 'second half']);
  });

  it('an artboard with no clip is one looping animation named after it', () => {
    const doc = tiny();
    splitIntoArtboards(doc);
    const again = loadFile(saveFile(doc, 't', new Date(2026, 10, 14))).doc;
    for (const a of artboardsOf(again)) if (a.content) a.content.clips = [];
    const meta = docToSheet(again, 4).meta;
    expect(meta.anims.stop.loop).toBe(true);
    expect(meta.anims.stop.frames.length).toBe(1);
  });

  it('leaves out an artboard of another size, and says so', () => {
    const doc = tiny();
    splitIntoArtboards(doc);
    const again = loadFile(saveFile(doc, 't', new Date(2026, 10, 14))).doc;
    const other = artboardsOf(again).find((a) => a.content)!;
    other.content!.width = 4;
    const built = docToSheet(again, 4);
    expect(Object.keys(built.meta.anims)).toEqual(['go']);
    expect(built.warnings.some((w) => w.includes('"stop"') && w.includes('left out'))).toBe(true);
  });

  it('still reads a hidden folder per board', () => {
    const doc = tiny();
    const top = newPixelLayer('Top', 1);
    top.folder = 'f';
    top.cels = [{ id: 't', start: 0, length: 6, drawingId: 'blue' }];
    doc.layers.push(top);
    doc.folders = { f: { id: 'f', name: 'Extras', visible: false, opacity: 1 } };
    splitIntoArtboards(doc);
    expect(Array.from(docToSheet(doc, 4).image.pixels.subarray(0, 4))).toEqual([255, 0, 0, 255]);
  });
});

describe('copyAnimation', () => {
  const copied = () => {
    const doc = tiny();
    splitIntoArtboards(doc);
    const made = copyAnimation(doc, 'go', 'go again');
    return { doc, made };
  };

  it('on a file with artboards adds an artboard after the last, named for the new animation', () => {
    const { doc, made } = copied();
    expect(made).toMatchObject({ name: 'go again', frames: 4, layers: 1 });
    expect(artboardsOf(doc).map((a) => a.name)).toEqual(['go', 'stop', 'go again']);
    const c = contentOf(doc, made.board!)!;
    expect(c.length).toBe(4);
    expect(c.clips.map((k) => [k.name, k.start, k.end, k.loop])).toEqual([['go again', 0, 3, true]]);
    expect(doc.length).toBe(4);
    const spots = artboardsOf(doc).map((a) => `${a.x},${a.y}`);
    expect(new Set(spots).size).toBe(3);
  });

  it('copies the drawings, so painting on the copy leaves the original alone', () => {
    const { doc, made } = copied();
    const cels = contentOf(doc, made.board!)!.layers[0].cels;
    expect(cels.every((c) => c.drawingId !== 'red' && c.drawingId !== 'blue')).toBe(true);
    (doc.drawings[cels[0].drawingId] as PixelDrawing).pixels.fill(0);
    expect(Array.from((doc.drawings.red as PixelDrawing).pixels.subarray(0, 4))).toEqual([255, 0, 0, 255]);
    // A drawing shown twice stays one drawing.
    expect(cels[0].drawingId).toBe(cels[2].drawingId);
  });

  it('adds the animation to the sheet, after the others, looking the same', () => {
    const { doc } = copied();
    const { meta, image } = docToSheet(doc, 4);
    expect(Object.keys(meta.anims)).toEqual(['go', 'stop', 'go again']);
    const a = meta.anims.go.frames, b = meta.anims['go again'].frames;
    expect(b.map((f) => f.ms)).toEqual(a.map((f) => f.ms));
    b.forEach((f, i) => expect(sameImage(crop(image, f.x, f.y, 2, 2), crop(image, a[i].x, a[i].y, 2, 2))).toBe(true));
  });

  it('finds the animation by the name of its clip too, and says plainly what is wrong with a bad name', () => {
    const doc = tiny();
    splitIntoArtboards(doc);
    expect(() => copyAnimation(doc, 'nope', 'x')).toThrow(/no animation called "nope".*go, stop/);
    expect(() => copyAnimation(doc, 'go', 'Stop')).toThrow(/already an animation called "Stop"/);
    expect(() => copyAnimation(doc, 'go', '  ')).toThrow(/Give the new animation a name/);
  });

  it('on a file with one timeline is still copyClip', () => {
    const doc = tiny();
    const made = copyAnimation(doc, 'go', 'go again');
    expect(made.board).toBeUndefined();
    expect(doc.clips.map((c) => c.name)).toEqual(['go', 'stop', 'go again']);
  });

  it('survives being saved and opened again', () => {
    const { doc } = copied();
    const again = loadFile(saveFile(doc, 't', new Date(2026, 10, 14))).doc;
    expect(artboardsOf(again).map((a) => a.name)).toEqual(['go', 'stop', 'go again']);
    expect(docToSheet(again, 4).meta).toEqual(docToSheet(doc, 4).meta);
  });
});

describe('compareSheets', () => {
  it('finds no difference between a sheet and itself, and counts the frames', () => {
    const a = docToSheet(tiny(), 4);
    expect(compareSheets(a, docToSheet(tiny(), 4))).toEqual({ differences: [], frames: 4 });
  });

  it('says which frame of which animation looks different, or lasts a different time, or moved', () => {
    const a = docToSheet(tiny(), 4);
    const b = docToSheet(tiny(), 4);
    b.image.pixels[0] = 9;
    b.meta.anims.go.frames[1] = { ...b.meta.anims.go.frames[1], ms: 150 };
    b.meta.anims.stop.frames[0] = { ...b.meta.anims.stop.frames[0], x: 4 };
    const { differences } = compareSheets(a, b);
    expect(differences).toContain('"go" frame 1 looks different');
    expect(differences).toContain('"go" frame 2 lasts 100 ms against 150');
    expect(differences.some((d) => d.startsWith('"stop" frame 1 is on tile 0,0 against 4,0'))).toBe(true);
    expect(differences).toContain('the sheet pictures are not the same');
  });

  it('notices a different order of animations or a different number of frames', () => {
    const a = docToSheet(tiny(), 4);
    const b = docToSheet(tiny(), 4);
    b.meta.anims.go.frames.pop();
    expect(compareSheets(a, b).differences).toEqual(['"go" has 3 frames against 2']);
    const c = docToSheet(tiny(), 4);
    c.meta.anims = { stop: c.meta.anims.stop, go: c.meta.anims.go };
    expect(compareSheets(a, c).differences[0]).toMatch(/the animations are go, stop against stop, go/);
  });
});
