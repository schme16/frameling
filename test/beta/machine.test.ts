// What a report says about the computer: reused from the drawing report, shown plainly, and nothing personal.
import { describe, expect, it } from 'vitest';
import { machineFacts, machineRows } from '../../src/beta/machine';
import { buildReport, reportText } from '../../src/beta/report';
import { crashReport } from '../../src/beta/crashAsk';
import { reportText as drawingText } from '../../src/gpu/describe';
import type { GpuReport } from '../../src/preload/api';

const report: GpuReport = {
  platform: 'linux',
  arch: 'x64',
  electron: '45.0.0',
  chromium: '140.0',
  devices: [
    { vendorId: 0x1002, deviceId: 0x164e, active: false, name: 'AMD Radeon Graphics' },
    { vendorId: 0x10de, deviceId: 0x2702, active: true, name: 'NVIDIA GeForce RTX 4080 SUPER', driver: 'NVIDIA 580.65', discrete: true },
  ],
  glRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 SUPER/PCIe/SSE2, OpenGL 4.5.0 NVIDIA 580.65)',
  liveRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 SUPER, Vulkan 1.3)',
  glVersion: 'OpenGL ES 3.1',
  glImplementation: '(gl=egl-angle,angle=vulkan)',
  skia: 'Ganesh',
  features: { gpu_compositing: 'enabled', '2d_canvas': 'enabled', vulkan: 'enabled_on' },
  hardwareAcceleration: true,
  flags: ['--ignore-gpu-blocklist', '--enable-features=Vulkan,DefaultANGLEVulkan'],
  off: { file: false, env: false, path: '/home/ada/.config/Frameling/gpu-off' },
  gpuKb: 310 * 1024,
  appKb: 820 * 1024,
  cpu: { model: 'AMD Ryzen 7 5800X 8-Core Processor', cores: 8, threads: 16, arch: 'x64' },
  memoryBytes: 32 * 1024 ** 3,
};

describe('machineFacts', () => {
  it('is nothing at all where the desktop cannot say (the web build)', () => {
    expect(machineFacts(null)).toBeNull();
    expect(machineFacts(undefined)).toBeNull();
  });

  it('carries the processor, the memory and the drawing configuration', () => {
    const m = machineFacts(report)!;
    expect(m.processor).toEqual({ model: 'AMD Ryzen 7 5800X 8-Core Processor', cores: 8, threads: 16, architecture: '64-bit Intel or AMD (x64)' });
    expect(m.memoryBytes).toBe(32 * 1024 ** 3);
    expect(m.graphics.card).toContain('RTX 4080');
    expect(m.graphics.drawingPath).toBe('Vulkan');
    expect(m.graphics.hardwareDrawing).toBe('on');
    expect(m.graphics.switches).toEqual(['--ignore-gpu-blocklist', '--enable-features=Vulkan,DefaultANGLEVulkan']);
    expect(m.graphics.features.vulkan).toBe('enabled_on');
    expect(m.graphics.cardsFound).toHaveLength(2);
  });

  it('reads the card the same way as the Performance page, so there is one version of the words', () => {
    const m = machineFacts(report)!;
    expect(drawingText(report, 0, { hardware: true, cacheMb: 0, scrub: 'x', fpsCap: 0 })).toContain(`Card in use: ${m.graphics.card}`);
  });

  it('says hardware drawing is off when the file or the variable turned it off', () => {
    expect(machineFacts({ ...report, hardwareAcceleration: false, off: { file: true, env: false, path: 'x' } })!.graphics.hardwareDrawing).toBe('off');
    const envOff = machineFacts({ ...report, hardwareAcceleration: false, off: { file: false, env: true, path: 'x' } })!;
    expect(envOff.graphics.envOff).toBe(true);
    expect(machineRows(envOff).find(([k]) => k === 'Hardware drawing')![1]).toContain('FRAMELING_GPU=off');
  });

  it('never carries a path: the gpu-off file lives in a home folder', () => {
    const text = JSON.stringify(machineFacts(report));
    expect(text).not.toContain('/home/ada');
    expect(text).not.toContain('gpu-off');
  });

  it('runs free text through the path scrubber, in case a driver puts one in a name', () => {
    const m = machineFacts({ ...report, liveRenderer: 'Mesa at /usr/lib/x86_64-linux-gnu/dri/radeonsi', asked: 'the card at /home/ada/.config/x' })!;
    expect(JSON.stringify(m)).not.toContain('/home/ada');
    expect(m.graphics.pageRenderer).toContain('<a path>');
  });

  it('says "not reported" for a system that gave no processor, instead of an empty box', () => {
    const m = machineFacts({ ...report, cpu: undefined, memoryBytes: undefined })!;
    expect(m.processor.model).toBe('not reported');
    expect(machineRows(m).find(([k]) => k === 'Memory in this computer')![1]).toBe('not reported');
  });
});

describe('the plain rows shown first', () => {
  const rows = Object.fromEntries(machineRows(machineFacts(report)!));
  it('put the processor and the card up front, in words', () => {
    expect(rows['Processor']).toBe('AMD Ryzen 7 5800X 8-Core Processor, 8 cores, 16 threads');
    expect(rows['Memory in this computer']).toBe('32 GB');
    expect(rows['Graphics card in use']).toContain('NVIDIA GeForce RTX 4080 SUPER');
    expect(rows['Drawing path']).toBe('Vulkan');
    expect(rows['Switches']).toContain('--enable-features=Vulkan');
  });
});

describe('in a report', () => {
  const env = { appVersion: '1.0.0', platform: 'linux x64' };
  it('goes in the exact text that is shown and sent, processor and card by name', () => {
    const r = buildReport({ note: 'The canvas went blank', env, machine: machineFacts(report) });
    const text = reportText(r);
    expect(text).toContain('AMD Ryzen 7 5800X 8-Core Processor');
    expect(text).toContain('NVIDIA GeForce RTX 4080 SUPER');
    expect(text).toContain('"hardwareDrawing": "on"');
    expect(text).toContain('--enable-features=Vulkan,DefaultANGLEVulkan');
  });
  it('is left out entirely when not wanted, and the rest of the report is the same', () => {
    const without = buildReport({ note: 'x', env, machine: null });
    expect(without.data.machine).toBeUndefined();
    expect(reportText(without)).not.toContain('Ryzen');
    expect(buildReport({ note: 'x', env })).toEqual(without);
  });
  it('a crash report carries it too', () => {
    const r = crashReport({ how: 'window', startedAt: 0, version: '1', platform: 'linux x64', events: [] }, env, undefined, machineFacts(report));
    expect(reportText(r)).toContain('Ryzen');
  });
  it('still fits what the board accepts', async () => {
    const { reportFits } = await import('../../src/beta/report');
    expect(reportFits(buildReport({ note: 'x', env, machine: machineFacts(report) }))).toBe(true);
  });
});

describe('the drawing report copy', () => {
  it('has the processor and memory lines', () => {
    const t = drawingText(report, 0, { hardware: true, cacheMb: 0, scrub: 'x', fpsCap: 0 });
    expect(t).toContain('Processor: AMD Ryzen 7 5800X 8-Core Processor, 8 cores, 16 threads, 64-bit Intel or AMD (x64)');
    expect(t).toContain('Computer memory: 32 GB');
  });
  it('says not reported when an older report has neither', () => {
    const t = drawingText({ ...report, cpu: undefined, memoryBytes: undefined }, 0, { hardware: true, cacheMb: 0, scrub: 'x', fpsCap: 0 });
    expect(t).toContain('Processor: not reported');
    expect(t).toContain('Computer memory: not reported');
  });
});
