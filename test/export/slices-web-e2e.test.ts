// Loads the slices of the Phaser (3 and 4), PixiJS and CSS sprite sheet exports in the real engines. Skipped unless
// WEB_ENGINES=1 (the pinned engine builds are cached in ~/.cache/frameling-web-engines, fetched once if missing):
//   WEB_ENGINES=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx vitest run test/export/slices-web-e2e
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { newPixelLayer } from '../../src/core/doc';
import { buildSheetFiles } from '../../src/export/engines';
import { DEFAULT_SHEET } from '../../src/export/types';
import type { RawImage } from '../../src/io/png';
import { slicesForExport } from '../../src/pixel/slices/model';

describe.skipIf(!process.env.WEB_ENGINES)('Phaser, PixiJS and CSS read the slices', () => {
  it('regions, pivots, anchors and a stretched 9-patch', () => {
    // A 40 x 24 frame: a blue panel 8..32 x 4..20 with a red middle (4 pixel border), a green 6 x 6 block at 2..8 x 2..8.
    const w = 40;
    const h = 24;
    const px = new Uint8ClampedArray(w * h * 4);
    const fill = (x0: number, y0: number, x1: number, y1: number, c: number[]) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px.set(c, (y * w + x) * 4);
    };
    fill(8, 4, 32, 20, [0, 0, 255, 255]);
    fill(12, 8, 28, 16, [255, 0, 0, 255]);
    fill(2, 2, 8, 8, [0, 255, 0, 255]);
    const layer = newPixelLayer('Sprite', 1);
    layer.slices = [
      { id: 'a', name: 'Panel', x: 8, y: 4, w: 24, h: 16, center: { x: 12, y: 8, w: 16, h: 8 } },
      { id: 'b', name: 'Block', x: 2, y: 2, w: 6, h: 6, pivot: { x: 5, y: 8 } },
    ];
    const make = (engine: string) =>
      buildSheetFiles({
        doc: { name: 'Hero', clips: [], markers: [], fps: 12 },
        sheet: { ...DEFAULT_SHEET, engine, trim: true, json: false } as never,
        frames: [{ width: w, height: h, pixels: px } as RawImage],
        range: { start: 0, end: 0 },
        whole: true,
        clipId: null,
        scale: 1,
        name: 'Hero',
        pixelArt: true,
        maxSide: 4096,
        slices: slicesForExport([layer], 1),
      });
    const dir = mkdtempSync(path.join(tmpdir(), 'frameling-web-slices-'));
    for (const e of ['phaser', 'pixi', 'css']) {
      mkdirSync(path.join(dir, e));
      for (const f of make(e).files) writeFileSync(path.join(dir, e, f.name), f.bytes);
    }
    const r = spawnSync('npx', ['electron', 'scripts/e2e/web-slices.cjs', dir], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 240000 });
    const line = (r.stdout + r.stderr).split('\n').find((l) => l.startsWith('RESULT '));
    expect(line, r.stdout + r.stderr).toBeDefined();
    const res = JSON.parse(line!.slice(7));
    if (process.env.SHOW_RESULT) console.log(JSON.stringify(res));
    for (const k of ['phaser3', 'phaser4']) {
      expect(res[k].error, k).toBeUndefined();
      expect(res[k].frames.Panel, k).toMatchObject({ x: 8, y: 4, w: 24, h: 16 });
      expect(res[k].frames.Block, k).toMatchObject({ x: 2, y: 2, w: 6, h: 6 });
      // The pivot (3, 6) of a 6 x 6 block: half across, all the way down.
      expect(res[k].frames.Block.pivot, k).toEqual([0.5, 1]);
    }
    expect(res.pixi.error).toBeUndefined();
    expect(res.pixi.frames.Block).toMatchObject({ x: 2, y: 2, w: 6, h: 6, anchor: [0.5, 1] });
    expect(res.pixi.frames.Panel).toMatchObject({ x: 8, y: 4, w: 24, h: 16 });
    // CSS: the 9-patch stretched to 60 x 40 keeps its 4 pixel blue border and fills the middle with red.
    expect(res.css.plainRect).toEqual([60, 40, 6, 6]);
    expect(res.css.corner).toBe('#0000ff');
    expect(res.css.top).toBe('#0000ff');
    expect(res.css.insideBorder).toBe('#ff0000');
    expect(res.css.middle).toBe('#ff0000');
    expect(res.css.bottomRight).toBe('#0000ff');
    expect(res.css.plainTopLeft).toBe('#00ff00');
  }, 300000);
});
