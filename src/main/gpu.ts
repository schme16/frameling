// What Frameling found out about the graphics card, for Preferences > Performance, and the switch for hardware drawing.
// The page does the plain-words reading (src/gpu/describe.ts); this side only asks Electron and hands the answers over.
import { app } from 'electron';
import os from 'node:os';
import { gpuOffPath, gpuOffState, linuxVramBytes, setGpuOffFile } from './gpuFile';
import type { GpuReport } from '../preload/api';
import { startLine } from '../gpu/describe';

type Handle = (channel: string, fn: (e: unknown, ...args: any[]) => unknown) => void;

const where = () => ({ platform: process.platform, env: process.env, home: os.homedir(), appData: app.getPath('appData') });
export const gpuOffFilePath = (): string => gpuOffPath(where());

/** Called before the app is ready: the file or the variable means no hardware drawing, on every system (the Linux launcher does the same with a flag). */
export function applyGpuOff(): void {
  const s = gpuOffState(gpuOffFilePath(), process.env);
  if (s.file || s.env) app.disableHardwareAcceleration();
}

const SWITCHES = ['disable-gpu', 'ignore-gpu-blocklist', 'enable-features', 'enable-zero-copy', 'canvas-oop-rasterization', 'use-angle', 'use-gl'];

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const whole = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export async function gpuReport(): Promise<GpuReport> {
  let info: any = {};
  try {
    info = await app.getGPUInfo('complete');
  } catch {
    try {
      info = await app.getGPUInfo('basic');
    } catch {
      info = {};
    }
  }
  const aux = (info && info.auxAttributes) || {};
  const devices = (Array.isArray(info?.gpuDevice) ? info.gpuDevice : []).map((d: any) => ({
    vendorId: whole(d.vendorId),
    deviceId: whole(d.deviceId),
    active: d.active === true,
    name: text(d.deviceString),
    driver: [text(d.driverVendor), text(d.driverVersion)].filter(Boolean).join(' ') || undefined,
  }));
  const metrics = app.getAppMetrics();
  const kb = (types: string[]) => metrics.filter((m) => types.includes(m.type)).reduce((n, m) => n + (m.memory?.workingSetSize ?? 0), 0);
  const flags: string[] = [];
  for (const s of SWITCHES) if (app.commandLine.hasSwitch(s)) flags.push(app.commandLine.getSwitchValue(s) ? `--${s}=${app.commandLine.getSwitchValue(s)}` : `--${s}`);
  const file = gpuOffFilePath();
  return {
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron ?? '',
    chromium: process.versions.chrome ?? '',
    devices,
    glRenderer: text(aux.glRenderer),
    glVendor: text(aux.glVendor),
    glVersion: text(aux.glVersion),
    glImplementation: text(aux.glImplementationParts),
    skia: text(aux.skiaBackendType),
    features: app.getGPUFeatureStatus() as unknown as Record<string, string>,
    hardwareAcceleration: app.isHardwareAccelerationEnabled(),
    flags,
    off: { ...gpuOffState(file, process.env), path: file },
    gpuKb: kb(['GPU']),
    appKb: kb(['Browser', 'Tab', 'GPU', 'Utility']),
    vramBytes: process.platform === 'linux' ? linuxVramBytes() ?? undefined : undefined,
  };
}

/** Says once, in the terminal, which drawing path is in use (the same words as Preferences > Performance). */
export async function logDrawingPath(): Promise<void> {
  try {
    console.log(startLine(await gpuReport()));
  } catch {
    // A courtesy line: never worth a failure.
  }
}

export function registerGpuIpc(handle: Handle): void {
  handle('gpu:report', () => gpuReport());
  handle('gpu:setHardware', (_e, on: unknown) => {
    const file = gpuOffFilePath();
    const error = setGpuOffFile(file, on === false);
    return error ? { error } : { ok: true as const, path: file };
  });
}
