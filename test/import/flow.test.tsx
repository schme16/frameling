// @vitest-environment jsdom
// The whole of each import in the app: the file goes in, a drawing (or new layers) comes out, the toast says what came in
// and what didn't, and a file that can't be read says why and changes nothing. Canvas and ImageData are stubbed (jsdom has none).
import { strToU8, zipSync } from 'fflate';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/import';
import { newDoc } from '../../src/core/doc';
import type { PathShape, PixelLayer } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { setChoice } from '../../src/core/choices';
import { clearToasts, toasts } from '../../src/ui/toast';
import { encodePng } from '../../src/io/png';
import { importLayeredBytes } from '../../src/import/layered/run';
import { importSequenceZip, importSequenceFiles } from '../../src/import/sequence/run';
import { importSvgBytes } from '../../src/import/svg/run';
import { importVectorcraftBytes } from '../../src/import/craft/run';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pcraft, rasterLayer } from './craftBuilder';
import { buildPsd, solid } from './psdBuilder';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30" viewBox="0 0 40 30">
  <defs><filter id="f"><feGaussianBlur stdDeviation="1"/></filter><mask id="m"><rect width="5" height="5" fill="#fff"/></mask></defs>
  <g><rect x="2" y="2" width="10" height="10" fill="#f00"/><circle cx="20" cy="15" r="6" fill="#00f" filter="url(#f)"/></g>
  <rect width="40" height="30" mask="url(#m)" fill="#0f0"/>
</svg>`;
const bytesOf = (s: string) => new TextEncoder().encode(s);
const flush = async () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const lastToast = () => toasts.get()[toasts.get().length - 1];
const buttons = (text: string) => [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === text);
const click = async (text: string) => {
  const b = buttons(text)[0];
  expect(b, `button "${text}"`).toBeDefined();
  await act(async () => b.click());
};

/** A drawing with something on it, so "add or new?" matters. */
function drawnDoc() {
  const d = newDoc({ name: 'mine', width: 100, height: 80, length: 12 });
  const v = { id: 'v1', kind: 'vector' as const, shapes: [{ id: 's1', type: 'path' as const, paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }], fill: '#000000', stroke: null, opacity: 1 }] };
  d.drawings[v.id] = v;
  d.layers[0].cels.push({ id: 'c1', start: 0, length: 12, drawingId: v.id });
  return d;
}

beforeEach(() => {
  localStorage.clear();
  clearToasts();
  resetStore(newDoc({ name: 'blank', width: 64, height: 48 }));
  (globalThis as unknown as { ImageData: unknown }).ImageData = class {
    constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ putImageData: vi.fn() })) as never;
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('SVG', () => {
  it('opens as a new drawing on a blank page, and the toast says what was left out', async () => {
    expect(await importSvgBytes(bytesOf(SVG), 'logo.svg')).toBe(true);
    const doc = store().get().doc;
    expect([doc.name, doc.width, doc.height]).toEqual(['logo', 40, 30]);
    expect(doc.layers).toHaveLength(1);
    const d = Object.values(doc.drawings)[0];
    expect(d.kind === 'vector' && d.shapes.length).toBe(3);
    const t = lastToast();
    expect(t.kind).toBe('warn');
    expect(t.message).toBe('Opened "logo": 3 shapes on 1 layer. 2 things couldn\'t be brought in.');
    expect(t.action?.label).toBe('See what was left out');
    await act(async () => t.action!.run());
    const list = document.querySelector('[data-testid="import.report.left"]')!.textContent!;
    expect(list).toMatch(/1 filter effect/);
    expect(list).toMatch(/1 mask/);
  });

  it('adds to a drawing that has something on it, once it has been asked to', async () => {
    resetStore(drawnDoc());
    setChoice('import.where', 'add');
    expect(await importSvgBytes(bytesOf(SVG), 'logo.svg')).toBe(true);
    const doc = store().get().doc;
    expect(doc.name).toBe('mine');
    expect(doc.layers).toHaveLength(2);
    const added = doc.drawings[doc.layers[1].cels[0].drawingId];
    // 40 x 30 sits in the middle of 100 x 80: the rectangle's corner (2, 2) lands at (32, 27).
    expect(added.kind === 'vector' && (added.shapes[0] as PathShape).paths[0].points[0]).toEqual({ x: 32, y: 27 });
    expect(doc.layers[1].cels[0].length).toBe(12);
    expect(lastToast().message).toMatch(/^Added "logo"/);
    // One undo step takes it all back.
    store().undo();
    expect(store().get().doc.layers).toHaveLength(1);
  });

  it('opens it as a new drawing when that is the answer', async () => {
    resetStore(drawnDoc());
    setChoice('import.where', 'new');
    expect(await importSvgBytes(bytesOf(SVG), 'logo.svg', true)).toBe(true);
    expect(store().get().doc.name).toBe('logo');
  });

  it('says why when the file cannot be read, and leaves the drawing alone', async () => {
    resetStore(drawnDoc());
    const before = store().get().doc;
    for (const [text, re] of [
      ['<html><body>hello</body></html>', /isn't an SVG/],
      ['<svg><g>', /isn't a readable SVG/],
      ['', /nothing in that file|readable/],
      ['<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>', /nothing drawn/],
    ] as [string, RegExp][]) {
      clearToasts();
      expect(await importSvgBytes(bytesOf(text), 'bad.svg')).toBe(false);
      expect(lastToast().message).toMatch(re);
      expect(store().get().doc).toBe(before);
    }
  });
});

describe('layered files', () => {
  const psd = (extra: Parameters<typeof buildPsd>[0]['layers'] = []) =>
    buildPsd({
      width: 8,
      height: 6,
      layers: [
        { name: '</Layer group>', section: 3 },
        { name: 'Inside', top: 0, left: 0, bottom: 2, right: 2, channels: solid(2, 2, 255, 0, 0), opacity: 128 },
        { name: 'Folder', section: 1, sectionBlend: 'pass' },
        { name: 'Back', top: 1, left: 1, bottom: 5, right: 7, channels: solid(6, 4, 0, 0, 255), blend: 'mul ', hidden: true },
        { name: 'Levels 1', tags: [{ key: 'levl' }] },
        ...extra,
      ],
    });

  it('opens a PSD as a new drawing with its layers, and says what it could not bring in', async () => {
    expect(await importLayeredBytes(psd(), 'art.psd')).toBe(true);
    const doc = store().get().doc;
    expect([doc.name, doc.width, doc.height]).toEqual(['art', 8, 6]);
    expect(doc.layers.map((l) => l.name)).toEqual(['Inside', 'Back']);
    expect(doc.layers[0].kind).toBe('pixel');
    expect((doc.layers[0] as PixelLayer).opacity).toBeCloseTo(128 / 255, 2);
    expect(doc.layers[1]).toMatchObject({ visible: false, blend: 'multiply' });
    expect(Object.values(doc.folders ?? {}).map((f) => f.name)).toEqual(['Folder']);
    const t = lastToast();
    expect(t.message).toBe('Opened "art": 2 layers in 1 group, 8 x 6. 1 thing couldn\'t be brought in.');
    await act(async () => t.action!.run());
    expect(document.querySelector('[data-testid="import.report.left"]')!.textContent).toMatch(/1 adjustment layer \("Levels 1"\)/);
  });

  it('adds layers on top of the open drawing, centred, as one undo step', async () => {
    resetStore(drawnDoc());
    setChoice('import.where', 'add');
    expect(await importLayeredBytes(psd(), 'art.psd')).toBe(true);
    const doc = store().get().doc;
    expect(doc.layers.map((l) => l.name)).toEqual(['Layer 1', 'Inside', 'Back']);
    // 8 x 6 in the middle of 100 x 80: the top left is at (46, 37).
    const d = doc.drawings[doc.layers[1].cels[0].drawingId];
    expect(d.kind === 'pixel' && [d.x, d.y]).toEqual([46, 37]);
    store().undo();
    expect(store().get().doc.layers).toHaveLength(1);
  });

  it('says why when the file cannot be read, and leaves the drawing alone', async () => {
    resetStore(drawnDoc());
    const before = store().get().doc;
    const good = psd();
    const cases: [Uint8Array, RegExp][] = [
      [good.subarray(0, 60), /cut short|damaged|neither/],
      [buildPsd({ width: 2, height: 2, mode: 4, layers: [] }), /CMYK/],
      [strToU8('not a layered file'), /couldn't tell what that file is/],
      [new Uint8Array(0), /empty/],
      [buildPsd({ width: 4, height: 4, layers: [{ name: 'Only a fill', tags: [{ key: 'SoCo' }] }] }), /no picture layers/],
    ];
    for (const [bytes, re] of cases) {
      clearToasts();
      expect(await importLayeredBytes(bytes, 'bad.psd')).toBe(false);
      expect(lastToast().message).toMatch(re);
      expect(store().get().doc).toBe(before);
    }
  });
});

describe('a sequence of pictures', () => {
  const frame = (i: number) => encodePng({ width: 4, height: 3, pixels: new Uint8ClampedArray(48).map((_, p) => (p % 4 === 3 ? 255 : (i * 20 + p) & 255)) });
  const zip = () => zipSync({ 'run-0001.png': frame(0), 'run-0002.png': frame(1), 'run-0010.png': frame(9), 'run-0003.png': frame(2), 'notes.txt': strToU8('hi'), 'broken.png': strToU8('nope') });

  it('shows what it found before it does anything, and brings the frames in on the go button', async () => {
    const done = importSequenceZip(zip(), 'run.zip');
    await flush();
    await flush();
    const found = document.querySelector('[data-testid="sequence.found"]')!.textContent;
    expect(found).toBe('4 pictures (run-0001.png to run-0010.png), all 4 x 3.');
    const left = document.querySelector('[data-testid="sequence.left"]')!.textContent!;
    expect(left).toMatch(/1 file that isn't a picture: notes\.txt/);
    // Nothing has changed yet.
    expect(store().get().doc.name).toBe('blank');
    // The missing numbers (4 to 9) are said too.
    expect(document.querySelector('[data-testid="sequence.notes"]')!.textContent).toMatch(/Numbers 4 to 9 are missing/);
    await click('Bring them in');
    expect(await done).toBe(true);
    const doc = store().get().doc;
    expect([doc.name, doc.fps, doc.length, doc.width, doc.height]).toEqual(['run', 12, 4, 4, 3]);
    expect(doc.layers[0].cels).toHaveLength(4);
    expect(lastToast().message).toMatch(/^Opened "run": 4 frames of 4 x 3\./);
  });

  it('leaves everything alone on Cancel', async () => {
    const before = store().get().doc;
    const done = importSequenceZip(zip(), 'run.zip');
    await flush();
    await flush();
    await click('Cancel');
    expect(await done).toBe(false);
    expect(store().get().doc).toBe(before);
  });

  it('takes the speed and the hold from the dialog', async () => {
    const done = importSequenceZip(zip(), 'run.zip');
    await flush();
    await flush();
    const set = async (id: string, v: string) => {
      const el = document.querySelector<HTMLInputElement>(`[data-testid="${id}"]`)!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    await set('sequence.fps', '24');
    await set('sequence.hold', '2');
    await click('Bring them in');
    await done;
    const doc = store().get().doc;
    expect([doc.fps, doc.length]).toEqual([24, 8]);
  });

  it('says there is nothing to bring in for a zip with no pictures, and for pictures that are all damaged', async () => {
    expect(await importSequenceZip(zipSync({ 'a.txt': strToU8('x'), 'b.mp4': strToU8('y') }), 'stuff.zip')).toBe(false);
    expect(lastToast().message).toBe('There are no pictures in "stuff" for Frameling to bring in (PNG, JPG, WebP, BMP or GIF). It has 2 other files: a.txt, b.mp4.');
    expect(await importSequenceZip(zipSync({ 'a.png': strToU8('nope'), 'b.png': strToU8('nope too') }), 'bad.zip')).toBe(false);
    expect(lastToast().message).toMatch(/couldn't read any of the 2 pictures/);
    expect(await importSequenceZip(strToU8('not a zip'), 'bad.zip')).toBe(false);
    expect(lastToast().message).toMatch(/couldn't open that zip/);
    expect(store().get().doc.name).toBe('blank');
  });

  it('takes pictures picked one by one, sorted, with the other files named', async () => {
    const mk = (path: string, bytes: Uint8Array) => ({ path, file: new File([bytes as BlobPart], path) });
    const done = importSequenceFiles([mk('shot2.png', frame(1)), mk('shot10.png', frame(9)), mk('shot1.png', frame(0)), mk('read me.txt', strToU8('x'))]);
    await flush();
    await flush();
    expect(document.querySelector('[data-testid="sequence.found"]')!.textContent).toBe('3 pictures (shot1.png to shot10.png), all 4 x 3.');
    await click('Bring them in');
    await done;
    // Named for what the pictures share.
    expect(store().get().doc.name).toBe('shot');
  });

  it('opens for two or more pictures dropped on the window together, and leaves one picture to the picture dialog', async () => {
    const { dropPictures } = await import('../../src/pixel/import/run');
    const done = dropPictures([new File([frame(1) as BlobPart], 'f2.png'), new File([frame(0) as BlobPart], 'f1.png')]);
    await flush();
    await flush();
    expect(document.querySelector('[data-testid="sequence.found"]')!.textContent).toBe('2 pictures (f1.png to f2.png), all 4 x 3.');
    await click('Cancel');
    await done;
    expect(store().get().doc.name).toBe('blank');
  });

  it('adds to a drawing that has something on it at its own rate, when asked', async () => {
    resetStore(drawnDoc());
    setChoice('import.where', 'add');
    const done = importSequenceZip(zip(), 'run.zip');
    await flush();
    await flush();
    expect(document.querySelector<HTMLInputElement>('[data-testid="sequence.fps"]')!.disabled).toBe(true);
    await click('Add them');
    await done;
    const doc = store().get().doc;
    expect(doc.layers.map((l) => l.name)).toEqual(['Layer 1', 'run']);
    expect(doc.length).toBe(12);
    expect(lastToast().message).toMatch(/^Added "run"/);
  });
});

describe('VectorCraft and Photocraft files', () => {
  const dusk = () => new Uint8Array(readFileSync(join(process.cwd(), 'test/fixtures/import/dusk-poster.vectorcraft')));
  const realPcraft = () => new Uint8Array(readFileSync(join(process.cwd(), 'test/fixtures/import/test.pcraft')));

  it('opens dusk-poster.vectorcraft as a drawing of its own on a blank page, with its swatches and a toast that says what was left out', async () => {
    expect(await importVectorcraftBytes(dusk(), 'dusk-poster.vectorcraft')).toBe(true);
    const doc = store().get().doc;
    expect([doc.name, doc.width, doc.height, doc.layers.length, doc.swatches.length]).toEqual(['Dusk Poster', 600, 800, 1, 46]);
    const d = Object.values(doc.drawings)[0];
    expect(d.kind === 'vector' && d.shapes.length).toBe(41);
    const t = lastToast();
    expect(t.kind).toBe('warn');
    expect(t.message).toBe('Opened "Dusk Poster": 39 shapes and 2 pieces of text on 1 layer. 46 colours joined the swatches. 4 things couldn\'t be brought in.');
    expect(store().get().ui.dirty).toBe(true);
    await act(async () => t.action!.run());
    expect(document.querySelector('[data-testid="import.report.left"]')!.textContent).toMatch(/with names \("Sky"/);
  });

  it('adds to a drawing that has something on it when that is the answer, one undo step, colours added once', async () => {
    resetStore(drawnDoc());
    setChoice('import.where', 'add');
    const had = store().get().doc.swatches.length;
    expect(await importVectorcraftBytes(dusk(), 'dusk-poster.vectorcraft')).toBe(true);
    const doc = store().get().doc;
    expect([doc.name, doc.layers.length, doc.width, doc.height]).toEqual(['mine', 2, 100, 80]);
    expect(doc.swatches.length).toBeGreaterThan(had);
    expect(lastToast().message).toMatch(/^Added "Dusk Poster".* It was made 10% of its size to fit/);
    store().undo();
    expect(store().get().doc.layers).toHaveLength(1);
    expect(store().get().doc.swatches.length).toBe(had);
  });

  it('opens a file with several artboards as its own drawing, even when asked to add', async () => {
    resetStore(drawnDoc());
    setChoice('import.where', 'add');
    const rect = (x0: number, y0: number, x1: number, y1: number) => ({ subpaths: [{ anchors: [{ p: [x0, y0] }, { p: [x1, y0] }, { p: [x1, y1] }, { p: [x0, y1] }], closed: true }] });
    const sh = (path: unknown) => ({ id: 1, appearance: { items: [{ kind: 'fill', paint: { type: 'solid', color: { model: 'rgb', r: 1, g: 0, b: 0 } } }] }, kind: { type: 'path', path } });
    const two = { format: 'vectorcraft', version: 4, document: { title: 'Two', artboards: [{ id: 1, name: 'A', rect: { x0: 0, y0: 0, x1: 50, y1: 50 } }, { id: 2, name: 'B', rect: { x0: 100, y0: 0, x1: 150, y1: 50 } }], layers: [{ id: 1, name: 'L', kind: { type: 'layer', children: [sh(rect(5, 5, 20, 20)), sh(rect(110, 5, 130, 20))] } }], swatches: [] } };
    expect(await importVectorcraftBytes(bytesOf(JSON.stringify(two)), 'two.vectorcraft', true)).toBe(true);
    const doc = store().get().doc;
    expect([doc.name, doc.artboards?.length, doc.width]).toEqual(['Two', 2, 50]);
    expect(lastToast().message).toBe('Opened "Two": 2 shapes on 2 artboards.');
  });

  it('says why when the file cannot be read, and leaves the drawing alone', async () => {
    resetStore(drawnDoc());
    const before = store().get().doc;
    for (const [bytes, re] of [
      [bytesOf('not json at all'), /doesn't look like a VectorCraft file/],
      [bytesOf('{"format":"svg"}'), /not a VectorCraft file/],
      [new Uint8Array(0), /empty/],
      [bytesOf(JSON.stringify({ format: 'vectorcraft', version: 4, document: { layers: [{ id: 1, kind: { type: 'layer', children: [] } }], artboards: [{ id: 1, rect: { x0: 0, y0: 0, x1: 4, y1: 4 } }] } })), /nothing drawn/],
    ] as [Uint8Array, RegExp][]) {
      clearToasts();
      expect(await importVectorcraftBytes(bytes, 'bad.vectorcraft')).toBe(false);
      expect(lastToast().message).toMatch(re);
      expect(store().get().doc).toBe(before);
    }
  });

  it('opens test.pcraft as a drawing of its own: one layer, 640 x 360, nothing left out', async () => {
    expect(await importLayeredBytes(realPcraft(), 'test.pcraft')).toBe(true);
    const doc = store().get().doc;
    expect([doc.name, doc.width, doc.height, doc.layers.length, doc.layers[0].name]).toEqual(['test', 640, 360, 1, 'Background']);
    expect(lastToast().kind).toBe('success');
    expect(lastToast().message).toBe('Opened "test": 1 layer, 640 x 360.');
  });

  it('says what a Photocraft file lost, and refuses one that cannot be trusted without touching the drawing', async () => {
    const a = rasterLayer('Hero', [{ tx: 0, ty: 0 }], { mask: { rect: [] } });
    expect(await importLayeredBytes(pcraft([a]), 'hero.photocraft')).toBe(true);
    expect(lastToast().kind).toBe('warn');
    resetStore(drawnDoc());
    const before = store().get().doc;
    clearToasts();
    expect(await importLayeredBytes(pcraft([a], { files: { '../x': new Uint8Array(1) } }), 'evil.pcraft')).toBe(false);
    expect(lastToast().message).toMatch(/can't be trusted/);
    expect(store().get().doc).toBe(before);
  });
});
