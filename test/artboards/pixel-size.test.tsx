// @vitest-environment jsdom
// The Artboards panel and its W / H fields say a pixel sprite's real size (32 x 32), not the stage's (512 x 512).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';
import { ArtboardsPanel } from '../../src/artboards/ArtboardsPanel';
import { addArtboard, artboardsOf } from '../../src/artboards/model';
import { ArtboardFields } from '../../src/artboards/fields';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  // A drawing surface that accepts any call: thumbnails are not what is checked here.
  const g = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? null : () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })), set: () => true });
  HTMLCanvasElement.prototype.getContext = (() => g) as never;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function spriteDoc() {
  const doc = newDoc({ name: 'Sprite', width: 512, height: 512, length: 4, pixel: { pixelSize: 16 } });
  addArtboard(doc, { name: 'Idle', width: 512, height: 512 });
  return doc;
}

describe('artboard sizes for pixel art', () => {
  it('the panel lists each board in art pixels', () => {
    resetStore(spriteDoc());
    act(() => root.render(<ArtboardsPanel />));
    const meta = [...host.querySelectorAll('.ab-size')].map((e) => e.textContent);
    expect(meta.length).toBe(2);
    for (const m of meta) {
      expect(m).toContain('32 x 32');
      expect(m).not.toContain('512');
    }
  });

  it('a vector page keeps its own units', () => {
    const doc = newDoc({ name: 'Drawing', width: 1280, height: 720 });
    addArtboard(doc, { name: 'Two', width: 640, height: 360 });
    resetStore(doc);
    act(() => root.render(<ArtboardsPanel />));
    expect([...host.querySelectorAll('.ab-size')].map((e) => e.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('1280 x 720'), expect.stringContaining('640 x 360')]));
  });

  it('the W and H fields are in art pixels too', () => {
    const s = resetStore(spriteDoc());
    const id = artboardsOf(s.get().doc)[0].id;
    act(() => root.render(<ArtboardFields id={id} />));
    const nums = [...host.querySelectorAll('input[type="number"], input[inputmode]')] as HTMLInputElement[];
    const values = nums.map((n) => n.value);
    expect(values).toContain('32');
    expect(values).not.toContain('512');
  });
});
