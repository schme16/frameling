// The colour pin and the harnesses' two engine modes: what the app sets, that the harnesses set the same colour pin, that
// the harness's "card" flags are the ones the Linux AppImage launcher uses, and how a run is judged (a run that asked for
// the card and got software has to fail, not report).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { colourSwitches } from '../../src/main/gpuFlags';

const root = path.resolve(__dirname, '../..');
const req = createRequire(import.meta.url);
// The harness module needs Electron only when it runs; here it is read for its lists and its judge().
const harness = req(path.join(root, 'scripts/lib/gpu.cjs')) as {
  switchesFor: (mode: 'card' | 'software', opts?: { webgpu?: boolean }) => [string, string?][];
  judge: (mode: 'card' | 'software', page: { renderer: string | null; webgl2: boolean; wideGamut: boolean; red: number[] }, f: Record<string, string>) => string[];
  CARD_SWITCHES: [string, string?][];
  COLOUR_SWITCH: [string, string];
};

const asArg = ([k, v]: [string, string?]) => (v === undefined ? `--${k}` : `--${k}=${v}`);

describe('colour pin (the app)', () => {
  it('pins sRGB by default', () => {
    expect(colourSwitches({})).toEqual([['force-color-profile', 'srgb']]);
  });
  it('lets the engine manage colour for the screen when asked', () => {
    for (const v of ['screen', 'Screen', ' display ', 'off']) expect(colourSwitches({ FRAMELING_COLOUR: v })).toEqual([]);
    expect(colourSwitches({ FRAMELING_COLOUR_PROFILE: 'screen' })).toEqual([]);
  });
  it('treats anything else as the default, so a typo cannot unpin it', () => {
    expect(colourSwitches({ FRAMELING_COLOUR: 'srgb' })).toEqual([['force-color-profile', 'srgb']]);
    expect(colourSwitches({ FRAMELING_COLOUR: 'p3' })).toEqual([['force-color-profile', 'srgb']]);
  });
  it('is the same pin the harnesses set', () => {
    expect(harness.COLOUR_SWITCH).toEqual(colourSwitches({})[0]);
  });
});

describe('harness engine modes', () => {
  it('both modes pin the colour', () => {
    expect(harness.switchesFor('software')).toContainEqual(harness.COLOUR_SWITCH);
    expect(harness.switchesFor('card')).toContainEqual(harness.COLOUR_SWITCH);
  });
  it('software is SwiftShader and does not ask for the card by name', () => {
    const sw = harness.switchesFor('software').map(asArg);
    expect(sw).toContain('--use-angle=swiftshader');
    expect(sw).toContain('--enable-unsafe-swiftshader');
  });
  it('the contradiction the old harnesses had (the card, then software) cannot be built from one mode', () => {
    const card = harness.switchesFor('card').map(asArg);
    expect(card.join(' ')).not.toMatch(/swiftshader|use-angle/);
  });
  it('WebGPU in software leaves ANGLE alone (with it the GPU process drops the device)', () => {
    const sw = harness.switchesFor('software', { webgpu: true }).map(asArg);
    expect(sw).toContain('--enable-unsafe-webgpu');
    expect(sw.join(' ')).not.toMatch(/swiftshader|use-angle/);
  });
  it('the card flags are the Linux launcher flags', () => {
    const launcher = readFileSync(path.join(root, 'build/linux/launcher.sh'), 'utf8');
    const line = /^GPU_ARGS=\((.*)\)$/m.exec(launcher);
    expect(line, 'GPU_ARGS in build/linux/launcher.sh').not.toBeNull();
    expect(harness.CARD_SWITCHES.map(asArg)).toEqual(line![1].trim().split(/\s+/));
  });
});

describe('judging a run', () => {
  const good = { renderer: 'ANGLE (NVIDIA, Vulkan 1.4.351 (NVIDIA GeForce RTX 4080 SUPER), NVIDIA)', webgl2: true, wideGamut: false, red: [255, 0, 0, 255] };
  const swift = { ...good, renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)' };
  const llvm = { ...good, renderer: 'ANGLE (Mesa, llvmpipe (LLVM 20.1.2 256 bits), OpenGL 4.5)' };
  const on = { gpu_compositing: 'enabled', '2d_canvas': 'enabled' };
  it('accepts the card when the card came up', () => {
    expect(harness.judge('card', good, on)).toEqual([]);
  });
  it('fails a card run that got SwiftShader or llvmpipe', () => {
    expect(harness.judge('card', swift, on).join(' ')).toMatch(/asked for the card and got software/);
    expect(harness.judge('card', llvm, on).join(' ')).toMatch(/asked for the card and got software/);
  });
  it('fails a card run whose window is composited in software, or whose canvas is not on the card', () => {
    expect(harness.judge('card', good, { gpu_compositing: 'disabled_software', '2d_canvas': 'enabled' }).join(' ')).toMatch(/composited in software/);
    expect(harness.judge('card', good, { gpu_compositing: 'enabled', '2d_canvas': 'disabled_software' }).join(' ')).toMatch(/2D canvas/);
  });
  it('fails a card run with no WebGL at all (the GPU turned off)', () => {
    expect(harness.judge('card', { ...good, renderer: null, webgl2: false }, on).join(' ')).toMatch(/WebGL 2 is not available/);
  });
  it('accepts software when it is software, and fails software that turned out to be the card', () => {
    expect(harness.judge('software', swift, on)).toEqual([]);
    expect(harness.judge('software', good, on).join(' ')).toMatch(/asked for software and got a real card/);
  });
  it('fails any run whose colour is not pinned or whose canvas does not read back what was drawn', () => {
    expect(harness.judge('software', { ...swift, wideGamut: true }, on).join(' ')).toMatch(/not pinned to sRGB/);
    expect(harness.judge('software', { ...swift, red: [234, 51, 35, 255] }, on).join(' ')).toMatch(/reads back 234,51,35,255/);
  });
});
