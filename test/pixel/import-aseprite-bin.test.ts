// Opt-in check against the real Aseprite. Skipped unless ASEPRITE_BIN points at the aseprite program:
//   ASEPRITE_BIN=/path/to/aseprite npx vitest run test/pixel/import-aseprite-bin
// Aseprite (batch mode, no window, settings in a throwaway folder) makes a sprite with delays, tags and slices, then
// exports a sprite sheet (trimmed, with JSON) and each frame as a picture. Frameling's sheet import has to give back the
// same frames, delays and tags, and its slices have to match both Aseprite's JSON and the slices read from the .aseprite file.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { asepriteDoc } from '../../src/aseprite/convert';
import { parseAseprite } from '../../src/aseprite/parse';
import type { PixelLayer } from '../../src/core/format';
import { decodePng } from '../../src/io/png';
import { cutPicture, defaultCut } from '../../src/pixel/import/build';
import { readSheetJson } from '../../src/pixel/import/sheetJson';

const BIN = process.env.ASEPRITE_BIN;

/** Runs Aseprite and reads what it made (only when ASEPRITE_BIN is set; the describe body runs even when skipped). */
function make() {
  const dir = mkdtempSync(path.join(tmpdir(), 'frameling-sheet-'));
  const cfg = path.join(dir, 'cfg');
  mkdirSync(cfg);
  const env = { ...process.env, XDG_CONFIG_HOME: cfg, XDG_DATA_HOME: cfg };
  const ase = (args: string[]) => execFileSync(BIN!, ['-b', ...args], { env, cwd: dir, timeout: 120000, stdio: 'pipe' });
  ase(['--script-param', `out=${dir}`, '--script', path.resolve(__dirname, 'lua/sheet.lua')]);
  ase(['sheet.aseprite', '--trim', '--sheet', 'sheet.png', '--data', 'sheet.json', '--format', 'json-array', '--list-tags', '--list-slices', '--sheet-type', 'rows', '--shape-padding', '1']);
  ase(['sheet.aseprite', '--save-as', 'frame{frame}.png']);
  const json = readSheetJson(readFileSync(path.join(dir, 'sheet.json'), 'utf8'))!;
  const sheet = decodePng(new Uint8Array(readFileSync(path.join(dir, 'sheet.png'))));
  const sprite = cutPicture({ width: sheet.width, height: sheet.height, frames: [{ pixels: sheet.pixels }], kind: 'png', notes: [] }, { ...defaultCut(), cutting: { how: 'json', data: json } });
  return { dir, sprite };
}

describe.skipIf(!BIN)('sheet import against the real Aseprite', () => {
  const made = BIN ? make() : ({} as ReturnType<typeof make>);
  const { dir, sprite } = made;

  it('gives back every frame exactly, trimmed frames put back where they were', () => {
    expect([sprite.width, sprite.height, sprite.frames.length]).toEqual([20, 14, 4]);
    sprite.frames.forEach((f, i) => {
      const want = decodePng(new Uint8Array(readFileSync(path.join(dir, `frame${i}.png`))));
      expect(f.image.pixels.length).toBe(want.pixels.length);
      for (let p = 0; p < want.pixels.length; p += 4) {
        // Hidden colour under see-through pixels does not count.
        if (want.pixels[p + 3] === 0) expect(f.image.pixels[p + 3], `frame ${i} pixel ${p / 4}`).toBe(0);
        else expect([...f.image.pixels.slice(p, p + 4)], `frame ${i} pixel ${p / 4}`).toEqual([...want.pixels.slice(p, p + 4)]);
      }
    });
  });
  it('delays and tags', () => {
    expect(sprite.frames.map((f) => f.delay)).toEqual([100, 100, 200, 100]);
    expect(sprite.tags).toMatchObject([{ name: 'walk', from: 0, to: 1 }, { name: 'stop', from: 2, to: 3, direction: 'pingpong' }]);
  });
  it('slices from the JSON equal the slices read from the .aseprite file', () => {
    const doc = asepriteDoc(parseAseprite(new Uint8Array(readFileSync(path.join(dir, 'sheet.aseprite')))), 'sheet').doc;
    const fromFile = (doc.layers[0] as PixelLayer).slices!;
    expect(fromFile.map((s) => s.name).sort()).toEqual(['hitbox', 'panel']);
    for (const s of fromFile) {
      const j = sprite.slices.find((x) => x.name === s.name)!;
      expect({ x: j.x, y: j.y, w: j.w, h: j.h, center: j.center, pivot: j.pivot }).toEqual({ x: s.x, y: s.y, w: s.w, h: s.h, center: s.center, pivot: s.pivot });
    }
    const panel = fromFile.find((s) => s.name === 'panel')!;
    // Rectangle(1, 2, 12, 10) with a middle at (3, 3) and a pivot at (6, 10) from its corner.
    expect(panel).toMatchObject({ x: 1, y: 2, w: 12, h: 10, center: { x: 4, y: 5, w: 6, h: 4 }, pivot: { x: 7, y: 12 } });
  });
});
