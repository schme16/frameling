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

describe.skipIf(!UNITY)('Unity imports the slices of a sprite sheet export', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'frameling-unity-slices-'));
  const plain = path.join(root, 'older');

  const run = (proj: string, label: string) => {
    const assets = path.join(proj, 'Assets');
    for (const d of ['Frameling', 'Importer', 'Editor']) rmSync(path.join(assets, d), { recursive: true, force: true });
    for (const d of ['Frameling', 'Importer', 'Editor']) mkdirSync(path.join(assets, d), { recursive: true });
    const out = sheetFiles();
    for (const f of out.files) writeFileSync(path.join(assets, /\.(cs|asmdef)$/.test(f.name) ? 'Importer' : 'Frameling', f.name), f.bytes);
    copyFileSync(path.join(__dirname, '../../scripts/e2e/unity/FramelingSliceCheck.cs'), path.join(assets, 'Importer', 'FramelingSliceCheck.cs'));
    const report = path.join(root, `report-${label}.txt`);
    const log = path.join(root, `log-${label}.txt`);
    spawnSync(UNITY!, ['-batchmode', '-nographics', '-projectPath', proj, '-executeMethod', 'FramelingSliceCheck.Run', '-sheet', 'Assets/Frameling/hero.png', '-report', report, '-logFile', log], { timeout: 600000 });
    expect(existsSync(report), `no report (see ${log})`).toBe(true);
    const lines = readFileSync(report, 'utf8').split('\n').filter((l) => l.startsWith('SPRITE '));
    return Object.fromEntries(lines.map((l) => { const p = l.split(' '); return [p[1], p.slice(2).map(Number)]; }));
  };

  const expectSprites = (s: Record<string, number[]>) => {
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
  }, 1_800_000);

  it('without it (the older cutting path)', () => {
    expectSprites(run(plain, 'older'));
  }, 1_800_000);
});
