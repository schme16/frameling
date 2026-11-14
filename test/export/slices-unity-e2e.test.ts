// Imports the slices of a sprite sheet export in a real Unity, in a throwaway project, with and without the 2D Sprite
// package (the importer cuts the sheet two ways). Skipped unless UNITY_BIN points at the Unity editor; slow (minutes):
//   UNITY_BIN=/path/to/Unity/Editor/Unity npx vitest run test/export/slices-unity-e2e
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { newPixelLayer } from '../../src/core/doc';
import { buildSheetFiles } from '../../src/export/engines';
import { DEFAULT_SHEET } from '../../src/export/types';
import type { RawImage } from '../../src/io/png';
import { slicesForExport } from '../../src/pixel/slices/model';

const UNITY = process.env.UNITY_BIN;

function sheetFiles() {
  const w = 40;
  const h = 24;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([255, 0, 0, 255], i * 4);
  const layer = newPixelLayer('Sprite', 1);
  layer.slices = [
    { id: 'a', name: 'Panel', x: 8, y: 4, w: 24, h: 16, center: { x: 12, y: 7, w: 16, h: 8 } },
    { id: 'b', name: 'Block', x: 2, y: 2, w: 6, h: 6, pivot: { x: 5, y: 8 } },
  ];
  return buildSheetFiles({
    doc: { name: 'Hero', clips: [], markers: [], fps: 12 },
    sheet: { ...DEFAULT_SHEET, engine: 'unity', trim: true, json: false, unityScript: true },
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
}

/** Six 32 x 20 frames, each with a 6 x 6 block of its own colour that moves; "hand" follows it with keys on frames 0, 2 and 4. */
const COLORS = ['ff0000', '00ff00', '0000ff', 'ffff00', '00ffff', 'ff00ff'];
function movingFiles() {
  const W = 32;
  const H = 20;
  const frames: RawImage[] = COLORS.map((c, f) => {
    const px = new Uint8ClampedArray(W * H * 4);
    const rgb = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) px.set([...rgb, 255], ((3 + f + y) * W + 2 + 4 * f + x) * 4);
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
  return buildSheetFiles({
    // Two clips: "run" through every frame, and "drop" backward from frame 5 to 1.
    doc: { name: 'Mover', clips: [{ id: 'c1', name: 'run', start: 0, end: 5, loop: true }, { id: 'c2', name: 'drop', start: 1, end: 5, loop: false, direction: 'reverse' }], markers: [], fps: 10 },
    sheet: { ...DEFAULT_SHEET, engine: 'unity', trim: true, dedupe: false, json: false, unityScript: true },
    frames,
    range: { start: 0, end: 5 },
    whole: true,
    clipId: null,
    scale: 1,
    name: 'Mover',
    pixelArt: true,
    maxSide: 4096,
    slices: slicesForExport([layer], 1, { start: 0, end: 5 }),
  });
}

describe.skipIf(!UNITY)('Unity imports the slices of a sprite sheet export', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'frameling-unity-slices-'));
  const plain = path.join(root, 'older');

  const run = (proj: string, label: string, make: () => ReturnType<typeof sheetFiles> = sheetFiles, name = 'hero') => {
    const assets = path.join(proj, 'Assets');
    for (const d of ['Frameling', 'Importer', 'Editor']) rmSync(path.join(assets, d), { recursive: true, force: true });
    for (const d of ['Frameling', 'Importer', 'Editor']) mkdirSync(path.join(assets, d), { recursive: true });
    const out = make();
    for (const f of out.files) writeFileSync(path.join(assets, /\.(cs|asmdef)$/.test(f.name) ? 'Importer' : 'Frameling', f.name), f.bytes);
    copyFileSync(path.join(__dirname, '../../scripts/e2e/unity/FramelingSliceCheck.cs'), path.join(assets, 'Importer', 'FramelingSliceCheck.cs'));
    const report = path.join(root, `report-${label}.txt`);
    const log = path.join(root, `log-${label}.txt`);
    spawnSync(UNITY!, ['-batchmode', '-nographics', '-projectPath', proj, '-executeMethod', 'FramelingSliceCheck.Run', '-sheet', `Assets/Frameling/${name}.png`, '-report', report, '-logFile', log], { timeout: 600000 });
    expect(existsSync(report), `no report (see ${log})`).toBe(true);
    const text = readFileSync(report, 'utf8');
    expect(text, `Unity did not finish (see ${log})`).toContain('UNITY-DONE');
    const lines = text.split('\n').filter((l) => l.startsWith('SPRITE '));
    const sprites = Object.fromEntries(lines.map((l) => { const p = l.split(' '); return [p[1], p.slice(2).map(Number)]; }));
    const colors = Object.fromEntries(text.split('\n').filter((l) => l.startsWith('COLOR ')).map((l) => l.split(' ').slice(1) as [string, string]));
    const clips = Object.fromEntries(text.split('\n').filter((l) => l.startsWith('CLIP ')).map((l) => { const p = l.split(' '); return [p[1], { rate: Number(p[2]), keys: p[3] }]; }));
    return { sprites, colors, clips };
  };

  const expectMoving = (got: ReturnType<typeof run>) => {
    // The sprites sit where the export says, on the sheet frame each key starts on; the colour in the middle is that frame's block.
    const s = got.sprites;
    for (const [n, frame] of [['hand', 0], ['hand_f3', 2], ['hand_f5', 4]] as const) {
      expect(s[n], n).toBeDefined();
      expect(s[n].slice(2, 4), n).toEqual([6, 6]);
      expect(got.colors[n], n).toBe(COLORS[frame]);
    }
    // Pivots in pixels from the sprite's bottom left: (2, 0) of 6 x 6, then the middle, then the middle (no pivot of its own).
    expect(s.hand.slice(4, 6)).toEqual([2, 0]);
    expect(s.hand_f3.slice(4, 6)).toEqual([3, 3]);
    expect(s.hand_f5.slice(4, 6)).toEqual([3, 3]);
    // A clip for each of the document's clips: each key's sprite for two frames of 0.1 s, and a last key on the clip's final tick.
    expect(got.clips.mover_slice_hand_run, JSON.stringify(got.clips)).toEqual({ rate: 10, keys: '0=hand,0.2=hand_f3,0.4=hand_f5,0.5=hand_f5' });
    // Backward over frames 5 to 1: the keys the other way round, the last held one tick (so no extra closing key, like the clip of the sprites).
    expect(got.clips.mover_slice_hand_drop, JSON.stringify(got.clips)).toEqual({ rate: 10, keys: '0=hand_f5,0.2=hand_f3,0.4=hand' });
  };

  const expectSprites = (got: ReturnType<typeof run>) => {
    const s = got.sprites;
    // The sheet is 40 x 24; Unity counts rects from the bottom. Panel: x 8, y 24 - 4 - 16 = 4, 24 x 16, no pivot of its own so its middle (12, 8),
    // borders 4 left, 3 bottom (rect bottom 20 to centre bottom 15... centre is 7..15, so top 3, bottom 5), 4 right.
    expect(s.Panel.slice(0, 4)).toEqual([8, 4, 24, 16]);
    expect(s.Panel.slice(4, 6)).toEqual([12, 8]);
    expect(s.Panel.slice(6)).toEqual([4, 5, 4, 3]);
    // Block: 6 x 6 at x 2, bottom-origin y 24 - 2 - 6 = 16; pivot (3, 6) from its top left corner is (3, 0) from the bottom left.
    expect(s.Block.slice(0, 4)).toEqual([2, 16, 6, 6]);
    expect(s.Block.slice(4, 6)).toEqual([3, 0]);
    expect(s.Block.slice(6)).toEqual([0, 0, 0, 0]);
  };

  it('with the 2D Sprite package', () => {
    // A throwaway project from Unity's own template, then the package added to its manifest.
    spawnSync(UNITY!, ['-batchmode', '-nographics', '-quit', '-createProject', plain, '-logFile', path.join(root, 'create.log')], { timeout: 600000 });
    expect(existsSync(path.join(plain, 'Packages', 'manifest.json'))).toBe(true);
    const withPkg = path.join(root, 'pkg');
    cpSync(plain, withPkg, { recursive: true });
    const mf = path.join(withPkg, 'Packages', 'manifest.json');
    const m = JSON.parse(readFileSync(mf, 'utf8'));
    m.dependencies['com.unity.2d.sprite'] = '1.0.0';
    writeFileSync(mf, JSON.stringify(m, null, 2));
    expectSprites(run(withPkg, 'pkg'));
    expectMoving(run(withPkg, 'pkg-moving', movingFiles, 'mover'));
  }, 1_800_000);

  it('without it (the older cutting path)', () => {
    expectSprites(run(plain, 'older'));
    expectMoving(run(plain, 'older-moving', movingFiles, 'mover'));
  }, 1_800_000);
});
