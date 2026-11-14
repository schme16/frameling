// What the Performance page says for each way a computer can be drawing: the card doing it, only the window on the card,
// switched off three ways, and no card found. Pure words from a report, so the cases are plain objects.
import { describe, expect, it } from 'vitest';
import { bytesText, cardName, drawMode, drawPath, readGpu, reportText, restartNeeded, startLine, vendorName } from '../../src/gpu/describe';
import type { GpuReport } from '../../src/preload/api';

const base: GpuReport = {
  platform: 'linux',
  arch: 'x64',
  electron: '45.0.0',
  chromium: '140.0',
  devices: [{ vendorId: 0x10de, deviceId: 0x2702, active: true, name: 'NVIDIA GeForce RTX 4080 SUPER', driver: 'NVIDIA 580.65' }],
  glRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 SUPER/PCIe/SSE2, OpenGL 4.5.0 NVIDIA 580.65)',
  glVersion: 'OpenGL ES 3.1',
  glImplementation: '(gl=egl-angle,angle=vulkan)',
  skia: 'Ganesh',
  features: { gpu_compositing: 'enabled', '2d_canvas': 'enabled', rasterization: 'enabled', vulkan: 'enabled_on' },
  hardwareAcceleration: true,
  flags: ['--ignore-gpu-blocklist', '--enable-features=Vulkan,DefaultANGLEVulkan'],
  off: { file: false, env: false, path: '/home/a/.config/Frameling/gpu-off' },
  gpuKb: 310 * 1024,
  appKb: 820 * 1024,
  vramBytes: 16 * 1024 ** 3,
};
/** What the build machine's own report looks like inside a virtual screen: nothing used, two cards in the box. */
const software: GpuReport = {
  ...base,
  devices: [
    { vendorId: 0x1002, deviceId: 0x164e, active: true },
    { vendorId: 0x10de, deviceId: 0x2702, active: false },
  ],
  glRenderer: undefined,
  glVersion: undefined,
  glImplementation: '(gl=none,angle=none)',
  skia: 'None',
  features: { gpu_compositing: 'disabled_software', '2d_canvas': 'disabled_software', rasterization: 'disabled_software', vulkan: 'disabled_off' },
  flags: [],
  gpuKb: 0,
  vramBytes: undefined,
};

describe('which mode', () => {
  it('says the card is drawing when compositing and the canvas are both on it', () => expect(drawMode(base)).toBe('card'));
  it('says partly when the window is on the card and the canvas is not', () => expect(drawMode({ ...base, features: { ...base.features, '2d_canvas': 'disabled_software' } })).toBe('partly'));
  it('says software when it is on but no card could be used', () => expect(drawMode(software)).toBe('software'));
  it('says off when Frameling was started with it off (the flag, or the engine having it off)', () => {
    expect(drawMode({ ...software, flags: ['--disable-gpu'] })).toBe('off');
    expect(drawMode({ ...software, hardwareAcceleration: false })).toBe('off');
  });
  it('keeps saying the card is drawing after the file is made, until Frameling restarts', () => expect(drawMode({ ...base, off: { ...base.off, file: true } })).toBe('card'));
});

describe('which path', () => {
  it('reads Vulkan from the way the engine talks to the card', () => expect(drawPath(base)).toBe('Vulkan'));
  it('reads OpenGL, Direct3D and Metal', () => {
    expect(drawPath({ ...base, glImplementation: '(gl=egl-angle,angle=opengl)', features: { ...base.features, vulkan: 'disabled_off' } })).toBe('OpenGL');
    expect(drawPath({ ...base, platform: 'win32', glImplementation: '(gl=egl-angle,angle=d3d11)', features: { ...base.features, vulkan: 'disabled_off' } })).toBe('Direct3D');
    expect(drawPath({ ...base, platform: 'darwin', glImplementation: '(gl=egl-angle,angle=metal)', features: { ...base.features, vulkan: 'disabled_off' } })).toBe('Metal');
  });
  it('is Software when nothing is used, however it got there', () => {
    expect(drawPath(software)).toBe('Software');
    expect(drawPath({ ...base, flags: ['--disable-gpu'], hardwareAcceleration: false })).toBe('Software');
  });
});

describe('the card\'s name', () => {
  it('uses the name the engine gives', () => expect(cardName(base)).toBe('NVIDIA GeForce RTX 4080 SUPER'));
  it('takes it out of the renderer text when there is no name', () => {
    expect(cardName({ ...base, devices: [{ vendorId: 0x10de, deviceId: 1, active: true }] })).toBe('NVIDIA GeForce RTX 4080 SUPER');
  });
  it('falls back to the maker and the device number', () => {
    expect(cardName({ ...base, glRenderer: undefined, devices: [{ vendorId: 0x1002, deviceId: 0x164e, active: true }] })).toBe('AMD card (device 0x164e)');
  });
  it('knows the makers, and says so when it does not', () => {
    expect(vendorName(0x8086)).toBe('Intel');
    expect(vendorName(0xabcd)).toBe('Vendor 0xabcd');
  });
  it('is not fooled by a software renderer', () => {
    expect(cardName({ ...base, devices: [], glRenderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' })).toBeNull();
  });
});

describe('the plain line', () => {
  it('is good news when the card is drawing', () => {
    const x = readGpu(base, 120 * 1_000_000);
    expect(x.headline).toBe('Your card is doing the drawing.');
    expect(x.advice).toEqual([]);
    expect(x.card).toBe('NVIDIA GeForce RTX 4080 SUPER');
    expect(x.path).toBe('Vulkan');
    expect(x.cardMemory).toBe('16 GB on the card');
    expect(x.holding).toBe('Frameling is holding about 820 MB in all, 310 MB of it in the graphics process, 114 MB of it kept drawings.');
  });
  it('says software is slower and what to try when no card was found', () => {
    const x = readGpu(software);
    expect(x.headline).toBe('Frameling is drawing in software, which is slower. Here is what to try.');
    expect(x.advice.length).toBeGreaterThanOrEqual(2);
    expect(x.advice.join(' ')).toMatch(/driver/);
    expect(x.advice.join(' ')).toMatch(/AppImage/);
    expect(x.card).toBe('None used (this computer has AMD and NVIDIA)');
    expect(x.cardMemory).toBe('not used');
  });
  it('leaves the Linux advice out on other systems', () => expect(readGpu({ ...software, platform: 'win32' }).advice.join(' ')).not.toMatch(/AppImage/));
  it('says it is off, and how to turn it on, when it was switched off', () => {
    const x = readGpu({ ...software, hardwareAcceleration: false, off: { ...base.off, file: true } });
    expect(x.headline).toMatch(/switched off/);
    expect(x.advice[0]).toMatch(/Turn Hardware drawing on/);
    expect(readGpu({ ...software, hardwareAcceleration: false, off: { ...base.off, env: true } }).advice[0]).toMatch(/FRAMELING_GPU=off/);
  });
  it('says partly when only the canvas is in software', () => expect(readGpu({ ...base, features: { ...base.features, '2d_canvas': 'disabled_software' } }).headline).toMatch(/canvas itself is drawn in software/));
  it('says when the system does not give the card\'s memory', () => expect(readGpu({ ...base, vramBytes: undefined }).cardMemory).toBe('your system does not say'));
  it('never uses an em dash', () => {
    for (const r of [base, software, { ...software, hardwareAcceleration: false, off: { ...base.off, file: true } }]) {
      const x = readGpu(r);
      expect([x.headline, ...x.advice, x.card, x.cardMemory, x.holding].join('')).not.toContain('\u2014');
    }
  });
});

describe('restart', () => {
  it('is needed when the wish and what is running differ', () => {
    expect(restartNeeded(base)).toBe(false);
    expect(restartNeeded({ ...base, off: { ...base.off, file: true } })).toBe(true);
    expect(restartNeeded({ ...software, off: { ...base.off, file: true }, flags: ['--disable-gpu'] })).toBe(false);
    expect(restartNeeded({ ...software, flags: ['--disable-gpu'] })).toBe(true);
  });
});

describe('the copied report', () => {
  const text = reportText(base, 50_000_000, { hardware: true, cacheMb: 160, scrub: 'full', fpsCap: 0 }, '1.2.3');
  it('has what a bug report is asked for', () => {
    for (const w of ['Frameling 1.2.3', 'Card in use: NVIDIA GeForce RTX 4080 SUPER', 'Drawing path: Vulkan', 'Driver: NVIDIA 580.65', 'Electron 45.0.0', 'gpu_compositing: enabled', 'kept drawings 160 MB', 'playback cap none', '--ignore-gpu-blocklist']) expect(text).toContain(w);
  });
  it('says how the off switch stands', () => expect(reportText({ ...base, off: { ...base.off, file: true } }, 0, { hardware: false, cacheMb: 80, scrub: 'quick', fpsCap: 12 })).toContain('Hardware drawing setting: off (gpu-off file present'));
  it('writes sizes as a person would', () => {
    expect(bytesText(1536 * 1024 * 1024)).toBe('1.5 GB');
    expect(bytesText(40_000_000)).toBe('38 MB');
  });
});

describe('the line printed on start', () => {
  it('names the card and the way it is reached, plain words first', () => {
    expect(startLine({ ...base, glImplementation: '(gl=egl-angle,angle=opengl)', features: { ...base.features, vulkan: 'disabled_off' } })).toBe(
      'Frameling: drawing on your graphics card (NVIDIA GeForce RTX 4080 SUPER), through OpenGL.',
    );
  });
  it('says software and why when switched off, when there is no card, and when the engine fell back', () => {
    expect(startLine({ ...base, hardwareAcceleration: false })).toBe('Frameling: drawing in software, which is slower (hardware drawing is switched off).');
    expect(startLine({ ...base, flags: ['--disable-gpu'] })).toContain('switched off');
    expect(startLine(software)).toBe('Frameling: drawing in software, which is slower (no graphics card could be used).');
    expect(startLine({ ...base, glImplementation: '(gl=egl-angle,angle=swiftshader)', features: { ...base.features, vulkan: 'disabled_off' } })).toContain('built-in software drawing');
  });
  it('says when only the window is on the card', () => {
    const l = startLine({ ...base, glImplementation: '(gl=egl-angle,angle=opengl)', features: { ...base.features, '2d_canvas': 'disabled_software', vulkan: 'disabled_off' } });
    expect(l).toContain('draws the window, but the canvas is drawn in software');
  });
  it('is in the copied report too, so the terminal and the page agree', () => {
    const text = reportText(software, 0, { hardware: true, cacheMb: 160, scrub: 'full', fpsCap: 0 });
    expect(text).toContain('On start: drawing in software, which is slower (no graphics card could be used).');
  });
  it('has no em dashes', () => expect(startLine(base)).not.toContain('\u2014'));
});
