import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { frameNumber } from '../../src/export/plan';
import { encodePng, decodePng } from '../../src/io/png';
import { spriteDoc, spriteInto } from '../../src/pixel/import/build';
import { produce } from 'immer';
import { foundSummary, frameNumberOf, gapsIn, isJunk, naturalCompare, nameList, picturesOf, planSequence, runOf, sequenceReport, MAX_SEQUENCE } from '../../src/import/sequence/plan';
import { decodeAll, readZipPictures, sequenceSprite, SequenceProblem } from '../../src/import/sequence/read';

const sorted = (names: string[]) => names.slice().sort(naturalCompare);

describe('sorting the way a person expects', () => {
  it('puts 2 before 10, whatever the padding, and ignores capitals', () => {
    expect(sorted(['frame10.png', 'frame2.png', 'frame1.png', 'frame20.png'])).toEqual(['frame1.png', 'frame2.png', 'frame10.png', 'frame20.png']);
    expect(sorted(['f-0010.png', 'f-0002.png', 'f-0100.png'])).toEqual(['f-0002.png', 'f-0010.png', 'f-0100.png']);
    expect(sorted(['B1.png', 'a2.png', 'A1.png'])).toEqual(['A1.png', 'a2.png', 'B1.png']);
    expect(sorted(['x 3.png', 'x 20.png', 'x 100.png'])).toEqual(['x 3.png', 'x 20.png', 'x 100.png']);
  });

  it('sorts numbers too long for a computer to hold, and numbers written two ways', () => {
    expect(sorted(['a99999999999999999999999.png', 'a100000000000000000000000.png', 'a2.png'])).toEqual(['a2.png', 'a99999999999999999999999.png', 'a100000000000000000000000.png']);
    expect(sorted(['a01.png', 'a1.png', 'a001.png'])).toEqual(['a1.png', 'a01.png', 'a001.png']);
  });

  it('keeps folders together and a run in its folder', () => {
    expect(sorted(['b/2.png', 'a/10.png', 'a/2.png'])).toEqual(['a/2.png', 'a/10.png', 'b/2.png']);
  });

  it('is a proper order: any shuffle sorts the same way', () => {
    const names = Array.from({ length: 60 }, (_, i) => `shot_${(i * 7) % 60}${i % 3 ? '' : 'b'}.png`);
    const a = sorted(names);
    for (let k = 0; k < 5; k++) expect(sorted(names.slice().reverse().sort(() => 0))).toEqual(a);
    for (let i = 1; i < a.length; i++) expect(naturalCompare(a[i - 1], a[i])).toBeLessThanOrEqual(0);
  });
});

describe('planning a folder or a zip', () => {
  it('finds the pictures, names the files that are not, and skips the junk a computer makes', () => {
    const plan = planSequence(['run-2.png', 'run-10.png', 'run-1.png', 'notes.txt', 'Thumbs.db', '.DS_Store', '__MACOSX/._run-1.png', 'sheet.psd', 'run-3.JPG']);
    expect(plan.pictures).toEqual(['run-1.png', 'run-2.png', 'run-3.JPG', 'run-10.png']);
    expect(plan.others).toEqual(['notes.txt', 'sheet.psd']);
    expect(isJunk('a/._x.png')).toBe(true);
    expect(isJunk('a/x.png')).toBe(false);
  });

  it('reads the run a name belongs to, and the number it ends in', () => {
    expect(runOf('walk/run-0012.png')).toBe('walk/run');
    expect(runOf('frame_7.png')).toBe('frame');
    expect(runOf('picture.png')).toBe('picture');
    expect(frameNumberOf('x/run-0012.png')).toBe(12);
    expect(frameNumberOf('run.png')).toBeNull();
  });

  it('finds more than one run, and can pick one', () => {
    const plan = planSequence(['walk-1.png', 'walk-2.png', 'walk-3.png', 'jump-1.png', 'jump-2.png']);
    expect(plan.runs.map((r) => [r.label, r.paths.length])).toEqual([['jump', 2], ['walk', 3]]);
    expect(picturesOf(plan, 'all')).toHaveLength(5);
    expect(picturesOf(plan, 'walk')).toEqual(['walk-1.png', 'walk-2.png', 'walk-3.png']);
    expect(picturesOf(plan, 'nothing like it')).toHaveLength(5);
  });

  it('finds the numbers that are missing from a run', () => {
    expect(gapsIn(['f1.png', 'f2.png', 'f5.png', 'f6.png', 'f9.png'])).toEqual([{ from: 3, to: 4 }, { from: 7, to: 8 }]);
    expect(gapsIn(['f1.png', 'f2.png', 'f3.png'])).toEqual([]);
    expect(gapsIn(['a.png', 'b.png'])).toEqual([]);
    expect(planSequence(['f001.png', 'f002.png', 'f004.png']).gaps).toEqual([{ from: 3, to: 3 }]);
  });

  it('stops at the limit and says how many were past it', () => {
    const names = Array.from({ length: MAX_SEQUENCE + 5 }, (_, i) => `f${i}.png`);
    const plan = planSequence(names);
    expect(plan.pictures).toHaveLength(MAX_SEQUENCE);
    expect(plan.overLimit).toBe(5);
  });

  it('copes with nothing at all, and with only other files', () => {
    expect(planSequence([])).toMatchObject({ pictures: [], others: [], runs: [], gaps: [] });
    expect(planSequence(['a.txt', 'b.mp4']).pictures).toEqual([]);
  });
});

describe('saying what it found', () => {
  const plan = planSequence(['f1.png', 'f2.png', 'f4.png', 'notes.txt', 'Thumbs.db']);
  it('says how many, the first and last names, the size, and what it left out', () => {
    const s = foundSummary(plan, { picked: plan.pictures, unreadable: [], sizes: [{ width: 640, height: 480 }, { width: 640, height: 480 }, { width: 640, height: 480 }] });
    expect(s.found).toBe('3 pictures (f1.png to f4.png), all 640 x 480.');
    expect(s.left).toEqual(["1 file that isn't a picture: notes.txt."]);
    expect(s.notes).toEqual(['Number 3 is missing from the run, so the animation skips ahead there.']);
  });

  it('names pictures that could not be read, and pictures of different sizes', () => {
    const s = foundSummary(plan, { picked: plan.pictures, unreadable: [{ path: 'f2.png', why: 'damaged or not a picture' }], sizes: [{ width: 64, height: 64 }, { width: 64, height: 64 }, { width: 32, height: 32 }] });
    expect(s.found).toBe('2 pictures (f1.png to f4.png).');
    expect(s.left[1]).toBe("1 picture that couldn't be read: f2.png (damaged or not a picture).");
    expect(s.notes[0]).toMatch(/not all the same size \(2 at 64 x 64, 1 at 32 x 32\)/);
  });

  it('shortens a long list of names', () => {
    expect(nameList(['a/1.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt', 'f.txt'])).toBe('1.txt, b.txt, c.txt, d.txt and 2 more');
  });

  it('writes the toast after the import', () => {
    const r = sequenceReport('run', 'new', 24, { width: 64, height: 48 }, plan, [], []);
    expect(r.headline).toBe('Opened "run": 24 frames of 64 x 48.');
    expect(r.left).toEqual(["1 file that isn't a picture: notes.txt."]);
    expect(sequenceReport('run', 'add', 1, { width: 8, height: 8 }, plan, [], []).headline).toBe('Added "run": 1 frame of 8 x 8.');
  });
});

// ---------------------------------------------------------------- the round trip: Frameling's own PNG sequence

const frameImage = (i: number, w = 6, h = 4) => {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) px.set([(i * 30) & 255, (p * 9) & 255, 100, p % 5 ? 255 : 0], p * 4);
  return { width: w, height: h, pixels: px };
};

/** The zip the app's PNG sequence export makes: name-0001.png and so on. */
function exportZip(count: number, name = 'run'): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < count; i++) files[`${name}-${frameNumber(i, count)}.png`] = encodePng(frameImage(i));
  return zipSync(files);
}

describe('reading a zip', () => {
  it('takes the pictures from the app\'s own PNG sequence and names the rest', () => {
    const z = zipSync({ 'run-0002.png': encodePng(frameImage(1)), 'run-0001.png': encodePng(frameImage(0)), 'readme.txt': strToU8('hi'), 'sub/': new Uint8Array(0), '__MACOSX/._run-0001.png': strToU8('x') });
    const r = readZipPictures(z);
    expect(r.pictures.map((p) => p.path).sort()).toEqual(['run-0001.png', 'run-0002.png']);
    expect(r.others).toEqual(['readme.txt']);
  });

  it('gives frames back exactly, in order, with the pictures it was given (the round trip)', async () => {
    const z = exportZip(12);
    const read = readZipPictures(z);
    const plan = planSequence(read.pictures.map((p) => p.path));
    expect(plan.pictures[0]).toBe('run-0001.png');
    expect(plan.pictures[11]).toBe('run-0012.png');
    const byPath = new Map(read.pictures.map((p) => [p.path, p]));
    const decoded = await decodeAll(plan.pictures.map((p) => byPath.get(p)!));
    expect(decoded.unreadable).toEqual([]);
    const sprite = sequenceSprite(decoded.pictures, { fps: 12, hold: 1, reverse: false });
    expect([sprite.width, sprite.height, sprite.frames.length]).toEqual([6, 4, 12]);
    for (let i = 0; i < 12; i++) expect([...sprite.frames[i].image.pixels]).toEqual([...frameImage(i).pixels]);
    const { doc } = spriteDoc(sprite, { way: 'animation', name: 'run', rowsAsSprites: false, palette: false, fps: 12 });
    expect([doc.fps, doc.length, doc.width, doc.height]).toEqual([12, 12, 6, 4]);
    // Each frame is its own picture on the layer, one frame long, and comes out of the drawing as it went in.
    const layer = doc.layers[0];
    expect(layer.cels).toHaveLength(12);
    expect(layer.cels.every((c) => c.length === 1)).toBe(true);
    const d = doc.drawings[layer.cels[5].drawingId];
    expect(d.kind).toBe('pixel');
    expect(decodePng(encodePng(frameImage(5))).pixels).toEqual(frameImage(5).pixels);
  });

  it('holds each picture for the length asked, at the rate asked', async () => {
    const pics = Array.from({ length: 4 }, (_, i) => ({ path: `f${i}.png`, ...frameImage(i) }));
    const sprite = sequenceSprite(pics, { fps: 24, hold: 2, reverse: false });
    const { doc } = spriteDoc(sprite, { way: 'animation', name: 'x', rowsAsSprites: false, palette: false, fps: 24 });
    expect([doc.fps, doc.length]).toEqual([24, 8]);
    expect(doc.layers[0].cels.map((c) => [c.start, c.length])).toEqual([[0, 2], [2, 2], [4, 2], [6, 2]]);
  });

  it('plays backwards when asked', () => {
    const pics = Array.from({ length: 3 }, (_, i) => ({ path: `f${i}.png`, ...frameImage(i) }));
    const sprite = sequenceSprite(pics, { fps: 12, hold: 1, reverse: true });
    expect(sprite.frames.map((f) => f.name)).toEqual(['f2.png', 'f1.png', 'f0.png']);
  });

  it('keeps a long run exact: 300 frames at 12 fps come out as 300 frames', () => {
    const pics = Array.from({ length: 300 }, (_, i) => ({ path: `f${i}.png`, width: 1, height: 1, pixels: new Uint8ClampedArray([i & 255, 0, 0, 255]) }));
    const { doc } = spriteDoc(sequenceSprite(pics, { fps: 12, hold: 1, reverse: false }), { way: 'animation', name: 'x', rowsAsSprites: false, palette: false, fps: 12 });
    expect(doc.length).toBe(300);
    expect(doc.layers[0].cels.every((c) => c.length === 1)).toBe(true);
  });

  it('puts smaller pictures in the middle of a frame as big as the biggest, and says so', () => {
    const sprite = sequenceSprite([{ path: 'a.png', ...frameImage(0, 8, 8) }, { path: 'b.png', ...frameImage(1, 4, 4) }], { fps: 12, hold: 1, reverse: false });
    expect([sprite.width, sprite.height]).toEqual([8, 8]);
    expect(sprite.notes.join(' ')).toMatch(/not all the same size/);
    // The 4 x 4 picture's first pixel lands at (2, 2).
    const at = (2 * 8 + 2) * 4;
    expect([...sprite.frames[1].image.pixels.subarray(at, at + 4)]).toEqual([...frameImage(1, 4, 4).pixels.subarray(0, 4)]);
  });

  it('adds to an open drawing at its own rate, on a new layer from the frame you are on', () => {
    const base = newDoc({ width: 6, height: 4, fps: 8, length: 10 });
    const pics = Array.from({ length: 3 }, (_, i) => ({ path: `f${i}.png`, ...frameImage(i) }));
    const sprite = sequenceSprite(pics, { fps: 8, hold: 2, reverse: false });
    const next = produce(base, (d) => {
      spriteInto(d, sprite, { way: 'animation', name: 'run', rowsAsSprites: false, palette: false, fps: 8 }, 3);
    });
    expect(next.layers.map((l) => l.name)).toEqual(['Layer 1', 'run']);
    expect(next.layers[1].cels.map((c) => [c.start, c.length])).toEqual([[3, 2], [5, 2], [7, 2]]);
    expect(next.length).toBe(10);
    expect(next.fps).toBe(8);
  });
});

describe('a sequence that cannot be read says why', () => {
  it('refuses a damaged zip, a password zip and a text file called .zip in plain words', () => {
    const z = exportZip(3);
    expect(() => readZipPictures(strToU8('this is not a zip file at all'))).toThrow(/couldn't open that zip.*damaged.*password.*not a zip/);
    expect(() => readZipPictures(z.subarray(0, z.length - 30))).toThrow(SequenceProblem);
    expect(() => readZipPictures(new Uint8Array(0))).toThrow(SequenceProblem);
  });

  it('survives a zip with every byte damaged in turn: reads, or says it cannot, never anything else', () => {
    const z = exportZip(2);
    for (let i = 0; i < z.length; i += 5) {
      const bad = z.slice();
      bad[i] ^= 0xff;
      try {
        readZipPictures(bad);
      } catch (e) {
        expect(e).toBeInstanceOf(SequenceProblem);
      }
    }
  });

  it('keeps going past a picture that is damaged, and names it', async () => {
    const good = encodePng(frameImage(0));
    const bad = good.slice(0, 40);
    const d = await decodeAll([{ path: 'a.png', bytes: good }, { path: 'b.png', bytes: bad }, { path: 'c.png', bytes: strToU8('not a picture') }, { path: 'd.png', bytes: new Uint8Array(0) }, { path: 'e.png', bytes: good }]);
    expect(d.pictures.map((p) => p.path)).toEqual(['a.png', 'e.png']);
    expect(d.unreadable.map((u) => u.path)).toEqual(['b.png', 'c.png', 'd.png']);
    expect(d.unreadable[0].why).toMatch(/damaged or not a picture|couldn't be read/);
  });

  it('says there is nothing to bring in when no picture could be read', () => {
    expect(() => sequenceSprite([], { fps: 12, hold: 1, reverse: false })).toThrow(/no pictures to bring in/);
  });
});
