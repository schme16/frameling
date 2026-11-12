// What small pictures on a big canvas cost: 100 small drawings (24 x 24 art pixels) on a 2000 x 2000 pixel layer,
// painted through the real pixel session, then saved and opened. Prints the numbers; asserts they stay small.
import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { PixelDrawing, PixelLayer } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { loadFile, saveFile } from '../../src/io/file';
import { newBlankKey } from '../../src/timeline/edit-core';
import { PixelSession } from '../../src/tools/pixelSession';

const MB = 1024 * 1024;
const bytesHeld = (drawings: Record<string, { kind: string }>) => Object.values(drawings).reduce((n, d) => n + (d.kind === 'pixel' ? (d as PixelDrawing).pixels.byteLength : 0), 0);

describe('100 small drawings on a 2000 x 2000 canvas', () => {
  it('hold little memory, save small and open small', () => {
    const FRAMES = 100;
    const doc0 = newDoc({ width: 2000, height: 2000, length: FRAMES, pixel: { pixelSize: 1 } });
    // One key per frame, each with its own drawing, as an animation has.
    for (let f = 0; f < FRAMES; f++) newBlankKey(doc0, doc0.layers[0].id, f);
    const s = resetStore(doc0);
    for (let f = 0; f < FRAMES; f++) {
      s.setUi({ frame: f });
      const { doc } = s.get();
      const layer = doc.layers[0] as PixelLayer;
      const sess = new PixelSession(doc, layer, f);
      // A 24 x 24 sprite somewhere on the page, a little different on every frame.
      const ox = 100 + (f % 10) * 150;
      const oy = 200 + Math.floor(f / 10) * 150;
      for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if ((x + y + f) % 3) sess.set(ox + x, oy + y, [(f * 2) % 256, 120, 200, 255]);
      expect(sess.commit('Paint')).toBe('ok');
    }
    const held = bytesHeld(store().get().doc.drawings);
    const t0 = performance.now();
    const bytes = saveFile(store().get().doc);
    const saveMs = performance.now() - t0;
    const t1 = performance.now();
    const back = loadFile(bytes).doc;
    const loadMs = performance.now() - t1;
    const heldBack = bytesHeld(back.drawings);
    // eslint-disable-next-line no-console
    console.log(`PIXEL-MEMORY drawings held ${(held / MB).toFixed(2)} MB, file ${(bytes.length / 1024).toFixed(1)} KB, save ${saveMs.toFixed(0)} ms, open ${loadMs.toFixed(0)} ms, held after open ${(heldBack / MB).toFixed(2)} MB`);
    // Whole canvases would be 2000 x 2000 x 4 = 15.3 MB each, 1.5 GB for 100.
    expect(held).toBeLessThan(2 * MB);
    expect(heldBack).toBeLessThan(2 * MB);
    expect(bytes.length).toBeLessThan(2 * MB);
  }, 120_000);
});
