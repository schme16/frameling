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

  it('a slice that moves: each key has its own region and pivot or anchor, and plays as an animation', () => {
    // Six 32 x 20 frames, each with a 6 x 6 block of its own colour that moves right and down; "hand" has keys on frames 0, 2 and 4.
    const W = 32;
    const H = 20;
    const frames: RawImage[] = [0, 1, 2, 3, 4, 5].map((f) => {
      const px = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) px.set([40 * f, 255 - 40 * f, 128, 255], ((3 + f + y) * W + 2 + 4 * f + x) * 4);
      return { width: W, height: H, pixels: px };
    });
    const layer = newPixelLayer('Sprite', 1);
    layer.slices = [
      { id: 'h', name: 'hand', x: 2, y: 3, w: 6, h: 6, pivot: { x: 4, y: 9 }, keys: [
        { frame: 0, x: 2, y: 3, w: 6, h: 6, pivot: { x: 4, y: 9 } },
        { frame: 2, x: 10, y: 5, w: 6, h: 6, pivot: { x: 13, y: 8 } },
        { frame: 4, x: 18, y: 7, w: 6, h: 6 },
      ] },
    ];
    const make = (engine: string) =>
      buildSheetFiles({
        // Two clips: "run" through every frame, and "drop" backward from frame 5 to 1.
        doc: { name: 'Hero', clips: [{ id: 'c1', name: 'run', start: 0, end: 5, loop: true }, { id: 'c2', name: 'drop', start: 1, end: 5, loop: false, direction: 'reverse' }], markers: [], fps: 10 },
        sheet: { ...DEFAULT_SHEET, engine, trim: true, dedupe: false, json: false } as never,
        frames,
        range: { start: 0, end: 5 },
        whole: true,
        clipId: null,
        scale: 1,
        name: 'Hero',
        pixelArt: true,
        maxSide: 4096,
        slices: slicesForExport([layer], 1, { start: 0, end: 5 }),
      });
    const dir = mkdtempSync(path.join(tmpdir(), 'frameling-web-moving-'));
    const sheets: Record<string, ReturnType<typeof make>> = {};
    for (const e of ['phaser', 'pixi', 'css']) {
      sheets[e] = make(e);
      mkdirSync(path.join(dir, e));
      for (const f of sheets[e].files) writeFileSync(path.join(dir, e, f.name), f.bytes);
    }
    const r = spawnSync('npx', ['electron', 'scripts/e2e/web-slices.cjs', dir], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 240000 });
    const line = (r.stdout + r.stderr).split('\n').find((l) => l.startsWith('RESULT '));
    expect(line, r.stdout + r.stderr).toBeDefined();
    const res = JSON.parse(line!.slice(7));
    const held = ['hand', 'hand', 'hand_f3', 'hand_f3', 'hand_f5', 'hand_f5'];
    for (const k of ['phaser3', 'phaser4']) {
      expect(res[k].error, k).toBeUndefined();
      // Each key is a frame of the atlas: its place on the sheet is inside the whole frame the key starts on, so the three differ.
      const f = res[k].frames;
      for (const [n, w, h] of [['hand', 6, 6], ['hand_f3', 6, 6], ['hand_f5', 6, 6]] as const) expect(f[n], `${k} ${n}`).toMatchObject({ w, h });
      expect(f.hand.pivot[0], k).toBeCloseTo(2 / 6, 3);
      expect(f.hand.pivot[1], k).toBe(1);
      expect(f.hand_f3.pivot, k).toEqual([0.5, 0.5]);
      expect(f.hand_f5.pivot, k).toBeNull();
      // The engine reads the animation: one entry per exported frame, held keys repeated.
      expect(res[k].anims.slice_hand_run, k).toEqual({ frameRate: 10, frames: held });
      // The clip that plays backward (frames 5 to 1) shows the keys the other way round.
      expect(res[k].anims.slice_hand_drop, k).toEqual({ frameRate: 10, frames: ['hand_f5', 'hand_f5', 'hand_f3', 'hand_f3', 'hand'] });
    }
    expect(res.pixi.error).toBeUndefined();
    expect(res.pixi.frames.hand_f3).toMatchObject({ w: 6, h: 6, anchor: [0.5, 0.5] });
    expect(res.pixi.frames.hand).toMatchObject({ w: 6, h: 6 });
    expect(res.pixi.frames.hand.anchor[0]).toBeCloseTo(2 / 6, 3);
    expect(res.pixi.frames.hand_f5.anchor).toBeNull();
    // The animation lists the region of each exported frame's key.
    const a = res.pixi.anims.slice_hand_run as number[][];
    expect(a).toHaveLength(6);
    expect(a[0]).toEqual([res.pixi.frames.hand.x, res.pixi.frames.hand.y]);
    expect(a[2]).toEqual([res.pixi.frames.hand_f3.x, res.pixi.frames.hand_f3.y]);
    expect(a[5]).toEqual([res.pixi.frames.hand_f5.x, res.pixi.frames.hand_f5.y]);
    const back = res.pixi.anims.slice_hand_drop as number[][];
    expect(back.map((r) => r.join())).toEqual([res.pixi.frames.hand_f5, res.pixi.frames.hand_f5, res.pixi.frames.hand_f3, res.pixi.frames.hand_f3, res.pixi.frames.hand].map((f) => [f.x, f.y].join()));
    // The same regions as the files say.
    const atlas = JSON.parse(new TextDecoder().decode(sheets.phaser.files.find((x) => x.name === 'hero.json')!.bytes));
    expect(res.phaser3.frames.hand_f3).toMatchObject({ x: atlas.frames.hand_f3.frame.x, y: atlas.frames.hand_f3.frame.y });
    // CSS can only show the first place of a slice that moves, and says so.
    expect(new TextDecoder().decode(sheets.css.files.find((x) => x.name === 'hero.css')!.bytes)).toContain('moves between frames');
  }, 300000);
});
