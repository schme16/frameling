// @vitest-environment jsdom
// The import dialog and the way it ends: choosing how to cut, what it becomes, the request it hands over, and the run
// that turns a request into a new drawing or an addition to the open one. ImageData and canvas are stubbed (jsdom has none).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/pixel';
import { newDoc } from '../../src/core/doc';
import type { Doc, PixelLayer } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import type { RawImage } from '../../src/io/png';
import { ImportDialog, type ImportRequest } from '../../src/pixel/import/ImportDialog';
import { importPicture } from '../../src/pixel/import/run';
import { encodePng } from '../../src/io/png';
import { artboardsOf } from '../../src/artboards/model';
import { wayOf } from '../../src/pixel/way';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Cells of 8 x 8 with a gap of 2 between them; cell n is filled with red = n + 1. */
function sheetPng(cols: number, rows: number): { img: RawImage; bytes: Uint8Array } {
  const w = cols * 8 + (cols - 1) * 2;
  const h = rows * 8 + (rows - 1) * 2;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px.set([r * cols + c + 1, 0, 0, 255], ((r * 10 + y) * w + c * 10 + x) * 4);
  const img = { width: w, height: h, pixels: px };
  return { img, bytes: encodePng(img) };
}

let host: HTMLElement | null = null;
let root: Root | null = null;
const flush = async () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const buttons = (text: string) => [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === text || b.querySelector('b')?.textContent === text);
const click = async (text: string) => {
  const b = buttons(text)[0];
  expect(b, `button "${text}"`).toBeDefined();
  await act(async () => b.click());
};

beforeEach(() => {
  localStorage.clear();
  resetStore(newDoc({ name: 'blank', width: 16, height: 16, pixel: { pixelSize: 1 } }));
  // The preview paints on a canvas; there is none in jsdom.
  (globalThis as unknown as { ImageData: unknown }).ImageData = class {
    constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ putImageData: vi.fn() })) as never;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  host = root = null;
});

describe('the dialog', () => {
  const mountDialog = (bytesFor: ReturnType<typeof sheetPng>, mode: 'new' | 'add' | 'palette', finish: (r: ImportRequest) => void) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const pic = { width: bytesFor.img.width, height: bytesFor.img.height, frames: [{ pixels: bytesFor.img.pixels }], kind: 'png' as const, notes: [] };
    act(() => root!.render(<ImportDialog pic={pic} fileName="hero" mode={mode} hasDrawing companion={null} pickJson={async () => null} finish={finish} close={() => {}} />));
  };

  it('starts on the gaps for a sheet, shows its cells, and hands over frames as an animation', async () => {
    let got: ImportRequest | null = null;
    mountDialog(sheetPng(3, 2), 'new', (r) => (got = r));
    // The gap finder found 6 cells.
    expect(document.querySelector('.im-summary')?.textContent).toMatch(/6 frames of 8 x 8/);
    await click('Bring it in');
    const r = got as unknown as ImportRequest;
    expect(r.sprite.frames.length).toBe(6);
    expect(r.options.way).toBe('animation');
    expect(r.into).toBe(false);
    // A new drawing takes the picture's colours.
    expect(r.paletteMode).toBe('replace');
  });

  it('a grid by rows and columns, and the way chosen by hand', async () => {
    let got: ImportRequest | null = null;
    mountDialog(sheetPng(3, 2), 'new', (r) => (got = r));
    await click('Grid');
    await click('Rows and columns');
    const set = async (label: string, v: string) => {
      const input = [...document.querySelectorAll<HTMLInputElement>('.im-field')].find((f) => f.textContent?.startsWith(label))!.querySelector('input')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    await set('Columns', '3');
    await set('Rows', '2');
    await set('Margin', '0');
    await click('Sprites on a sheet');
    await click('Bring it in');
    const r = got as unknown as ImportRequest;
    expect(r.options.way).toBe('sheet');
    // 3 x 2 cells of the whole picture (28 x 18 cut into 9 x 9), the first cell has the red of cell 1.
    expect(r.sprite.frames.length).toBe(6);
    expect(r.sprite.groups.map((g) => g.frames.length)).toEqual([3, 3]);
  });

  /** Waits until the palette dialog has worked out the colours (the Take button comes on). */
  const untilReady = async () => {
    for (let i = 0; i < 200; i++) {
      await flush();
      const b = document.querySelector<HTMLButtonElement>('[data-testid="import.go"]');
      if (b && !b.disabled) return;
    }
    throw new Error('the colours were never ready');
  };
  const setMax = async (v: string) => {
    const i = document.querySelector<HTMLInputElement>('[data-testid="palette.max"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, v);
      i.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // The pick waits a moment for typing to settle.
    await act(async () => void (await new Promise((r) => setTimeout(r, 250))));
    await untilReady();
  };

  it('cancelling hands nothing over, and palette mode only takes colours', async () => {
    let got: ImportRequest | null = null;
    mountDialog(sheetPng(2, 1), 'palette', (r) => (got = r));
    expect(document.querySelector('.im-ways')).toBeNull();
    await click('Replace my palette');
    await untilReady();
    await click('Take the colours');
    const r = got as unknown as ImportRequest;
    expect(r.paletteMode).toBe('replace');
    expect(r.picked!.colors.sort()).toEqual(['#010000', '#020000']);
  });

  it('palette mode: the most colours to take starts at 32, is honoured, and is remembered', async () => {
    // A picture with 40 different greys.
    const px = new Uint8ClampedArray(40 * 4);
    for (let i = 0; i < 40; i++) px.set([i * 6, i * 6, i * 6, 255], i * 4);
    const bytes = { img: { width: 40, height: 1, pixels: px }, bytes: new Uint8Array() };
    let got: ImportRequest | null = null;
    mountDialog(bytes, 'palette', (r) => (got = r));
    await untilReady();
    const input = () => document.querySelector<HTMLInputElement>('[data-testid="palette.max"]')!;
    expect(input().value).toBe('32');
    await setMax('10');
    expect(document.querySelectorAll('.im-swatches i').length).toBeLessThanOrEqual(10);
    expect(document.querySelector('.im-summary')?.textContent).toMatch(/40 colours in the picture: \d+ colours that stand for it best/);
    await click('Take the colours');
    expect((got as unknown as ImportRequest).picked!.colors.length).toBeLessThanOrEqual(10);
    expect(JSON.parse(localStorage.getItem('frameling.import.v1')!).maxColours).toBe(10);

    // The next time the dialog opens it starts at the last number.
    act(() => root?.unmount());
    host?.remove();
    mountDialog(bytes, 'palette', () => {});
    await untilReady();
    expect(input().value).toBe('10');
  });

  it('palette mode: a limit out of range is brought back into range', async () => {
    mountDialog(sheetPng(2, 1), 'palette', () => {});
    await untilReady();
    await setMax('9999');
    expect(document.querySelector<HTMLInputElement>('[data-testid="palette.max"]')!.value).toBe('9999');
    // Leaving the field shows the number really used.
    await act(async () => document.querySelector<HTMLInputElement>('[data-testid="palette.max"]')!.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(document.querySelector<HTMLInputElement>('[data-testid="palette.max"]')!.value).toBe('256');
  });

  it('palette mode: Cancel while it is still working stops the work and hands nothing over', async () => {
    let got: ImportRequest | null = null;
    let closed = false;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const big = sheetPng(1, 1).img;
    const pic = { width: big.width, height: big.height, frames: [{ pixels: big.pixels }], kind: 'png' as const, notes: [] };
    act(() => root!.render(<ImportDialog pic={pic} fileName="x" mode="palette" hasDrawing companion={null} pickJson={async () => null} finish={(r) => (got = r)} close={() => (closed = true)} />));
    // Straight after opening, the colours are not ready: the button is off and there is a progress bar.
    expect(document.querySelector<HTMLButtonElement>('[data-testid="import.go"]')!.disabled).toBe(true);
    expect(document.querySelector('.im-progress progress')).not.toBeNull();
    await click('Cancel');
    expect(closed).toBe(true);
    expect(got).toBeNull();
  });

  it('a single small picture is one picture, not cut', async () => {
    let got: ImportRequest | null = null;
    mountDialog(sheetPng(1, 1), 'new', (r) => (got = r));
    await click('Bring it in');
    const r = got as unknown as ImportRequest;
    expect(r.sprite.frames.length).toBe(1);
    expect(r.options.way).toBe('picture');
  });
});

describe('importPicture', () => {
  it('makes a new drawing, or adds a layer or boards to the open one, with the palette', async () => {
    const png = sheetPng(3, 1).bytes;
    // New drawing: replaces the open (not dirty) document.
    void importPicture(png, '/x/hero.png', 'new');
    await flush();
    await click('Bring it in');
    await flush();
    let doc: Doc = store().get().doc;
    expect([doc.width, doc.height, doc.length]).toEqual([8, 8, 3]);
    expect(wayOf(doc)).toBe('animation');
    expect(doc.palette!.colors.length).toBe(3);
    expect(store().get().ui.dirty).toBe(true);

    // Added to the open drawing as a new layer from the current frame; undo takes it all back.
    const layers = doc.layers.length;
    void importPicture(png, '/x/more.png', 'add');
    await flush();
    await click('Add it');
    await flush();
    doc = store().get().doc;
    expect(doc.layers.length).toBe(layers + 1);
    expect((doc.layers[doc.layers.length - 1] as PixelLayer).name).toBe('more');
    expect(store().get().ui.activeLayerId).toBe(doc.layers[doc.layers.length - 1].id);
    store().undo();
    expect(store().get().doc.layers.length).toBe(layers);

    // Frames on boards.
    void importPicture(png, '/x/boards.png', 'add');
    await flush();
    await click('Frames on boards');
    await click('Add it');
    await flush();
    expect(artboardsOf(store().get().doc).length).toBe(4);
  });
});
