// Opt-in check against the real Aseprite: the pixel blend modes (Linear dodge, Subtract, Divide) give what Aseprite's
// Addition, Subtract and Divide give. Skipped unless ASEPRITE_BIN points at the aseprite program:
//   ASEPRITE_BIN=/path/to/aseprite npx vitest run test/aseprite/blend-bin
// The full comparison of every mode through the real renderer is scripts/e2e/blend-aseprite.cjs.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { blendPixels } from '../../src/effects/pixelBlend';
import type { BlendMode } from '../../src/core/format';

const BIN = process.env.ASEPRITE_BIN;
let dir = '';
if (BIN) {
  dir = mkdtempSync(path.join(tmpdir(), 'frameling-blend-'));
  mkdirSync(path.join(dir, 'cfg'));
  execFileSync(BIN, ['-b', '--script-param', `out=${dir}`, '--script', path.resolve(__dirname, '../../scripts/e2e/blend-aseprite.lua')], { env: { ...process.env, XDG_CONFIG_HOME: path.join(dir, 'cfg'), XDG_DATA_HOME: path.join(dir, 'cfg') }, timeout: 300000, stdio: 'pipe' });
}

describe.skipIf(!BIN)('blend modes against the real Aseprite', () => {
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const inputs = BIN ? JSON.parse(readFileSync(path.join(dir, 'inputs.json'), 'utf8')) : null;
  const cases: [string, BlendMode][] = [['ADDITION', 'linear-dodge'], ['SUBTRACT', 'subtract'], ['DIVIDE', 'divide']];
  for (const [ase, mode] of cases) {
    for (const op of [255, 128, 64]) {
      it(`${mode} at ${op}: matches Aseprite over solid backdrops, and stays close over see-through ones`, () => {
        const { w, h, src, back } = inputs;
        const want = new Uint8Array(readFileSync(path.join(dir, `${ase}_${op}.rgba`)));
        const got = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) got.set(back[y], (y * w + x) * 4);
        const top = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) top.set(src[x], (y * w + x) * 4);
        blendPixels(got, top, mode, op / 255);
        let worstSolid = 0;
        for (let y = 0; y < h; y++) {
          if (back[y][3] !== 255) continue;
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            for (let k = 0; k < 4; k++) worstSolid = Math.max(worstSolid, Math.abs(got[i + k] - want[i + k]));
          }
        }
        // Whole levels of rounding only.
        expect(worstSolid).toBeLessThanOrEqual(2);
      });
    }
  }
});
