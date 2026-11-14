// Each artboard plays at its own speed: the model, the file, variations, the film player's clock, the atlas and the
// Export dialog's note.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { Doc } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { loadFile, saveFile } from '../../src/io/file';
import { activeId, addArtboard, artboardDoc, artboardsOf, contentOf, duplicateArtboard, joinShots, switchArtboard, takeContent } from '../../src/artboards/model';
import { filmSeconds, frameAtSeconds, mixedRates, rateOf, rateWords, ratesOf, readRate, secondsAt, speedNote } from '../../src/artboards/rates';
import { sameSpeedForAll, setArtboardRate } from '../../src/artboards/ops';
import { makeVariation } from '../../src/artboards/variations';
import { packArtboardAtlas } from '../../src/artboards/pack';

const frame = (n: number) => ({ width: 2, height: 2, pixels: new Uint8ClampedArray(16).fill(n) });

/** A film shot at 24 and a game sprite at 12, in one file. */
function twoRates(): { doc: Doc; film: string; sprite: string } {
  const doc = newDoc({ name: 'Hero', width: 100, height: 50, length: 24, fps: 24 });
  const sprite = addArtboard(doc, { name: 'Run', fps: 12, length: 8 });
  return { doc, film: activeId(doc), sprite };
}

describe('artboard speeds: reading', () => {
  it('a new artboard starts at the open artboard\'s speed unless told otherwise', () => {
    const doc = newDoc({ width: 10, height: 10, fps: 30 });
    const a = addArtboard(doc);
    const b = addArtboard(doc, { fps: 8 });
    expect(contentOf(doc, a)!.fps).toBe(30);
    expect(contentOf(doc, b)!.fps).toBe(8);
  });

  it('reads a rate from a file: whole numbers from 1 to 120, anything else is the fallback', () => {
    expect(readRate(24, 12)).toBe(24);
    expect(readRate(23.6, 12)).toBe(24);
    expect(readRate(500, 12)).toBe(120);
    for (const bad of [0, -3, NaN, Infinity, '24', null, undefined, {}]) expect(readRate(bad, 12)).toBe(12);
  });

  it('says every artboard\'s speed, open or not, and whether they differ', () => {
    const { doc, film, sprite } = twoRates();
    expect(rateOf(doc, film)).toBe(24);
    expect(rateOf(doc, sprite)).toBe(12);
    expect(ratesOf(doc).map((r) => r.fps)).toEqual([24, 12]);
    expect(mixedRates(doc)).toBe(true);
    expect(mixedRates(newDoc({ fps: 12 }))).toBe(false);
  });

  it('frames on boards play every board at the document\'s speed', () => {
    const { doc, sprite } = twoRates();
    doc.sharedLayers = true;
    expect(rateOf(doc, sprite)).toBe(24);
    expect(takeContent(doc).fps).toBeUndefined();
  });

  it('words a range of speeds', () => {
    expect(rateWords([12, 12])).toBe('12 fps');
    expect(rateWords([24, 12, 30])).toBe('12 to 30 fps');
  });
});

describe('artboard speeds: switching and changing', () => {
  it('the document\'s speed is the open artboard\'s, and each keeps its own across switches', () => {
    const { doc, film, sprite } = twoRates();
    switchArtboard(doc, sprite);
    expect(doc.fps).toBe(12);
    expect(contentOf(doc, film)!.fps).toBe(24);
    switchArtboard(doc, film);
    expect(doc.fps).toBe(24);
    expect(contentOf(doc, sprite)!.fps).toBe(12);
  });

  it('a board with no speed of its own plays at the speed already open', () => {
    const { doc, sprite } = twoRates();
    delete artboardsOf(doc).find((a) => a.id === sprite)!.content!.fps;
    switchArtboard(doc, sprite);
    expect(doc.fps).toBe(24);
  });

  it('a copy keeps the speed', () => {
    const { doc, sprite } = twoRates();
    const copy = duplicateArtboard(doc, sprite)!;
    expect(contentOf(doc, copy)!.fps).toBe(12);
  });

  it('sets the open artboard\'s speed on the document and a set-aside one\'s in its content', () => {
    const { doc, film, sprite } = twoRates();
    setArtboardRate(doc, sprite, 15);
    setArtboardRate(doc, film, 30);
    expect(doc.fps).toBe(30);
    expect(contentOf(doc, sprite)!.fps).toBe(15);
    setArtboardRate(doc, sprite, 9999);
    expect(contentOf(doc, sprite)!.fps).toBe(120);
    setArtboardRate(doc, sprite, 0.2);
    expect(contentOf(doc, sprite)!.fps).toBe(1);
  });

  it('does not change a speed while the frames share one stack', () => {
    const { doc, sprite } = twoRates();
    doc.sharedLayers = true;
    setArtboardRate(doc, sprite, 30);
    expect(doc.fps).toBe(24);
  });

  it('every export view of a board has the board\'s own speed', () => {
    const { doc, film, sprite } = twoRates();
    expect(artboardDoc(doc, sprite).fps).toBe(12);
    expect(artboardDoc(doc, film).fps).toBe(24);
  });

  it('a joined film takes the first shot\'s speed', () => {
    const { doc, film, sprite } = twoRates();
    const r = joinShots(doc, [sprite, film]);
    expect('doc' in r && r.doc.fps).toBe(12);
  });
});

describe('artboard speeds: the file', () => {
  it('round trips each artboard\'s speed', () => {
    const { doc, film, sprite } = twoRates();
    const back = loadFile(saveFile(doc)).doc;
    expect(back.fps).toBe(24);
    expect(rateOf(back, film)).toBe(24);
    expect(rateOf(back, sprite)).toBe(12);
    switchArtboard(back, sprite);
    expect(back.fps).toBe(12);
  });

  it('opens an older file, where every artboard shared the speed, with every artboard at it', () => {
    const { doc, sprite } = twoRates();
    const zip = unzipSync(saveFile(doc));
    const raw = JSON.parse(strFromU8(zip['doc.json']));
    for (const a of raw.artboards) if (a.content) delete a.content.fps;
    zip['doc.json'] = strToU8(JSON.stringify(raw));
    const back = loadFile(zipSync(zip)).doc;
    expect(back.fps).toBe(24);
    expect(rateOf(back, sprite)).toBe(24);
    expect(ratesOf(back).map((r) => r.fps)).toEqual([24, 24]);
  });

  it('turns a nonsense speed into the document\'s', () => {
    const { doc, sprite } = twoRates();
    const zip = unzipSync(saveFile(doc));
    const raw = JSON.parse(strFromU8(zip['doc.json']));
    for (const a of raw.artboards) if (a.content) a.content.fps = 'fast';
    zip['doc.json'] = strToU8(JSON.stringify(raw));
    expect(rateOf(loadFile(zipSync(zip)).doc, sprite)).toBe(24);
  });
});

describe('artboard speeds: variations', () => {
  beforeEach(() => {
    const doc = newDoc({ name: 'Hero', width: 100, height: 50, length: 8, fps: 12 });
    resetStore(doc);
  });
  const doc = () => store().get().doc;
  const update = (fn: (d: Doc) => void) => store().update('x', (d) => fn(d as Doc));

  it('a variation follows its original\'s speed until it is given one of its own', () => {
    let v = '';
    update((d) => void (v = makeVariation(d, activeId(d))!));
    const original = activeId(doc());
    expect(rateOf(doc(), v)).toBe(12);
    update((d) => setArtboardRate(d, original, 24));
    expect(rateOf(doc(), v)).toBe(24);
    update((d) => setArtboardRate(d, v, 8));
    expect(rateOf(doc(), v)).toBe(8);
    expect(rateOf(doc(), original)).toBe(24);
    update((d) => setArtboardRate(d, original, 30));
    expect(rateOf(doc(), v)).toBe(8);
    const back = loadFile(saveFile(doc())).doc;
    expect(rateOf(back, v)).toBe(8);
    expect(rateOf(back, original)).toBe(30);
  });

  it('changing the speed while a variation is open is the variation\'s own', () => {
    let v = '';
    update((d) => void (v = makeVariation(d, activeId(d))!));
    const original = activeId(doc());
    update((d) => void switchArtboard(d, v));
    update((d) => void (d.fps = 6));
    expect(rateOf(doc(), v)).toBe(6);
    expect(rateOf(doc(), original)).toBe(12);
    update((d) => void switchArtboard(d, original));
    expect(doc().fps).toBe(12);
    expect(rateOf(doc(), v)).toBe(6);
  });
});

describe('artboard speeds: one speed for all', () => {
  it('gives every artboard the open one\'s speed, one undo step', () => {
    const { doc, film, sprite } = twoRates();
    resetStore(doc);
    expect(sameSpeedForAll()).toBe(24);
    expect(ratesOf(store().get().doc).map((r) => r.fps)).toEqual([24, 24]);
    store().undo();
    expect(ratesOf(store().get().doc).map((r) => r.fps)).toEqual([24, 12]);
    expect([film, sprite]).toHaveLength(2);
  });
});

describe('artboard speeds: the film player\'s clock', () => {
  const shots = [{ length: 24, fps: 24 }, { length: 8, fps: 12 }];
  it('adds up the time each shot takes at its own speed', () => {
    expect(filmSeconds(shots)).toBeCloseTo(1 + 8 / 12, 6);
    expect(secondsAt(shots, 0)).toBe(0);
    expect(secondsAt(shots, 24)).toBe(1);
    expect(secondsAt(shots, 28)).toBeCloseTo(1 + 4 / 12, 6);
  });
  it('finds the frame at a time: quick through the first shot, slower through the second', () => {
    expect(frameAtSeconds(shots, 0)).toBe(0);
    expect(frameAtSeconds(shots, 0.5)).toBe(12);
    expect(frameAtSeconds(shots, 1)).toBe(24);
    expect(frameAtSeconds(shots, 1 + 1 / 12 + 0.001)).toBe(25);
    expect(frameAtSeconds(shots, filmSeconds(shots) + 1)).toBe(32);
  });
  it('is the plain frame count over the speed when every shot matches', () => {
    const same = [{ length: 10, fps: 12 }, { length: 10, fps: 12 }];
    expect(frameAtSeconds(same, 1)).toBe(12);
    expect(secondsAt(same, 12)).toBe(1);
  });
});

describe('artboard speeds: the packed atlas', () => {
  it('gives each animation and frame its own speed', () => {
    const r = packArtboardAtlas(
      [
        { name: 'walk', frames: [frame(1), frame(2)], clips: [], fps: 24 },
        { name: 'idle', frames: [frame(3), frame(4)], clips: [], fps: 12 },
      ],
      { fps: 24, scale: 1, maxSide: 256, image: 'a.png', trim: false },
    );
    if ('problem' in r) throw new Error(r.problem);
    const json = r.json as { frames: Record<string, { duration: number }>; animations: Record<string, { fps: number }> };
    expect(json.animations.walk.fps).toBe(24);
    expect(json.animations.idle.fps).toBe(12);
    expect(json.frames['walk/0'].duration).toBe(42);
    expect(json.frames['idle/0'].duration).toBe(83);
  });
});

describe('artboard speeds: the Export dialog says so', () => {
  const boards = [{ name: 'Film', fps: 24 }, { name: 'Run', fps: 12 }, { name: 'Jump', fps: 30 }];
  it('says nothing when they all match', () => {
    expect(speedNote('joined', [{ name: 'A', fps: 12 }, { name: 'B', fps: 12 }])).toBeNull();
    expect(speedNote('each', [{ name: 'A', fps: 12 }])).toBeNull();
  });
  it('says each file or animation keeps its own', () => {
    expect(speedNote('each', boards)).toBe('The artboards play at different speeds (12 to 30 fps); each file keeps its own.');
    expect(speedNote('atlas', boards)).toContain('each animation in the JSON has its own');
  });
  it('warns that a joined film has one speed, the first one\'s, and who runs faster or slower', () => {
    expect(speedNote('joined', boards)).toBe("The artboards play at different speeds (12 to 30 fps), and a film has one: it uses Film's 24 fps, so Run will run faster, and Jump will run slower. Export them as separate files to keep each speed.");
  });
});
