// What Frameling found out about the graphics card, for Preferences > Performance, and the switch for hardware drawing.
// The page does the plain-words reading (src/gpu/describe.ts); this side only asks Electron and hands the answers over.
import { app, BrowserWindow, type WebContents } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import { gpuOffPath, gpuOffState, linuxVramBytes, setGpuOffFile } from './gpuFile';
import { gpuLostLine, hardwareSwitches, mergeFeatures, softwareFallbackLine } from './gpuFlags';
import type { GpuReport } from '../preload/api';
import { readCpu } from '../gpu/cpu';
import { startLine } from '../gpu/describe';
import { activeIndex, bestName, pciIdsName } from '../gpu/identify';
import { relaunchPlan } from './restart';
import { cardAsk, hasDrawingDriver, STEERING_KEYS, isDiscrete, libInstalled, readCards, readPciIds, steering, type Steering } from './gpuPick';

type Handle = (channel: string, fn: (e: unknown, ...args: any[]) => unknown) => void;

const where = () => ({ platform: process.platform, env: process.env, home: os.homedir(), appData: app.getPath('appData') });
export const gpuOffFilePath = (): string => gpuOffPath(where());

/**
 * Called before the app is ready. The file or the variable means no hardware drawing, on every system. Otherwise, on
 * Linux, the card is asked for by name instead of left to the engine's list of drivers it trusts (see gpuFlags.ts).
 */
export function applyGpuOff(): boolean {
  const s = gpuOffState(gpuOffFilePath(), process.env);
  if (s.file || s.env) {
    app.disableHardwareAcceleration();
    return false;
  }
  const { switches, features } = hardwareSwitches(process.env, process.platform, false);
  for (const [name, value] of switches) value === undefined ? app.commandLine.appendSwitch(name) : app.commandLine.appendSwitch(name, value);
  if (features.length) addFeatures(features);
  if (process.platform !== 'linux') return false;
  if (askForDiscreteCard()) return true;
  // If the card cannot be used the engine goes on in software by itself and the app still opens. Say so once in the log,
  // a few seconds after the first window has loaded, when the engine has made up its mind.
  app.on('child-process-gone', (_e, d) => {
    if (d.type === 'GPU') console.warn(gpuLostLine(d.reason, d.exitCode));
  });
  app.once('browser-window-created', (_e, w) => {
    w.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        const line = softwareFallbackLine(true, app.getGPUFeatureStatus() as unknown as Record<string, string>);
        if (line) console.warn(line);
      }, 3000);
    });
  });
  return false;
}

let steered: Steering | null = null;

/**
 * On Linux with more than one card, asks for the discrete one through the card makers' own environment switches (see
 * gpuPick.ts). The engine's graphics process takes its environment from the first process, not from what is set here, so
 * the switches only count if they are there when Frameling starts: it sets them and starts itself again, once (the second
 * start carries FRAMELING_STEERED=1 and does not ask again). Returns true when it has done that and this copy is on its way
 * out. Anything that stops it (no way to restart, no card to ask for) leaves the system to pick, as it always did.
 */
function askForDiscreteCard(): boolean {
  try {
    const again = process.env.FRAMELING_STEERED === '1';
    // The second start already holds its own switches in the environment, which must not read as "someone else set them".
    const env = { ...process.env };
    if (again) for (const k of STEERING_KEYS) delete env[k];
    steered = steering(readCards(), env, libInstalled);
    // A run from source is left alone unless the card was asked for by name: a restart would take the terminal away from it.
    if (!steered || (!again && !app.isPackaged && cardAsk(process.env) !== 'discrete')) {
      steered = null;
      return false;
    }
    if (again) {
      console.log(steered.line);
      return false;
    }
    const plan = relaunchPlan({ platform: process.platform, packaged: app.isPackaged, appImage: process.env.APPIMAGE ?? '', portableFile: '', exists: (f) => fs.existsSync(f) });
    if (!plan.ok) {
      steered = null;
      return false;
    }
    for (const [k, v] of Object.entries(steered.env)) process.env[k] = v;
    process.env.FRAMELING_STEERED = '1';
    app.relaunch(plan.execPath ? { execPath: plan.execPath } : undefined);
    app.exit(0);
    return true;
  } catch {
    steered = null; // never worth a failure: the system picks, as it did before
    return false;
  }
}

/** Adds engine features to --enable-features, keeping the ones already there. */
export function addFeatures(features: readonly string[]): void {
  const now = app.commandLine.getSwitchValue('enable-features');
  app.commandLine.appendSwitch('enable-features', mergeFeatures(now, features));
}

const SWITCHES = ['disable-gpu', 'use-vulkan', 'ignore-gpu-blocklist', 'enable-features', 'enable-zero-copy', 'canvas-oop-rasterization', 'use-angle', 'use-gl'];

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const whole = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const PAGE_RENDERER = `(() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return r;
  } catch (e) {
    return '';
  }
})()`;

/** What a page's own WebGL says it is drawing on: the one answer that cannot be stale. Empty when there is no page or no WebGL. */
async function liveRenderer(wc?: WebContents): Promise<string | undefined> {
  const target = wc && !wc.isDestroyed() ? wc : BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())?.webContents;
  if (!target) return undefined;
  try {
    const r = await Promise.race([target.executeJavaScript(PAGE_RENDERER) as Promise<string>, new Promise<string>((res) => setTimeout(() => res(''), 2500))]);
    return text(r);
  } catch {
    return undefined;
  }
}

export async function gpuReport(sender?: WebContents): Promise<GpuReport> {
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
  const renderer = await liveRenderer(sender);
  const cards = process.platform === 'linux' ? readCards() : [];
  const pciText = process.platform === 'linux' ? readPciIds() : null;
  const raw = (Array.isArray(info?.gpuDevice) ? info.gpuDevice : []).map((d: any) => ({
    vendorId: whole(d.vendorId),
    deviceId: whole(d.deviceId),
    active: d.active === true,
    deviceString: text(d.deviceString),
    driver: [text(d.driverVendor), text(d.driverVersion)].filter(Boolean).join(' ') || undefined,
  }));
  // The engine's "active" flag can point at the onboard card while the page draws on the other; the page's renderer decides.
  const live = activeIndex(raw, renderer);
  const devices = raw.map((d: (typeof raw)[number], i: number) => {
    const sys = cards.find((c) => c.vendorId === d.vendorId && c.deviceId === d.deviceId);
    return {
      vendorId: d.vendorId,
      deviceId: d.deviceId,
      active: i === live,
      name: bestName({ deviceString: d.deviceString, renderer, glRenderer: text(aux.glRenderer), pciName: pciText ? pciIdsName(pciText, d.vendorId, d.deviceId) : null, isActive: i === live }),
      driver: d.driver,
      discrete: sys ? isDiscrete(sys) : d.vendorId === 0x10de,
      reserved: sys ? !hasDrawingDriver(sys) : undefined,
    };
  });
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
    liveRenderer: renderer,
    asked: steered ? steered.line.replace(/^\[gpu\] /, '') : cardAsk(process.env) === 'system' ? 'left to the system (FRAMELING_CARD=system).' : undefined,
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
    cpu: readCpu({ cpus: os.cpus(), arch: process.arch, cpuinfo: process.platform === 'linux' ? readCpuinfo() : null }),
    memoryBytes: os.totalmem(),
  };
}

/** Linux's own list of processors, for the model and the real core count. Null when it cannot be read. */
function readCpuinfo(): string | null {
  try {
    return fs.readFileSync('/proc/cpuinfo', 'utf8');
  } catch {
    return null;
  }
}

/** Says once, in the terminal, which drawing path is in use (the same words as Preferences > Performance). */
export async function logDrawingPath(): Promise<void> {
  try {
    // The engine has not picked its card until a page has drawn, so wait for the first window to load.
    const w = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed());
    if (w && w.webContents.isLoading()) await new Promise<void>((res) => w.webContents.once('did-finish-load', () => res()));
    console.log(startLine(await gpuReport(w?.webContents)));
  } catch {
    // A courtesy line: never worth a failure.
  }
}

export function registerGpuIpc(handle: Handle): void {
  handle('gpu:report', (e) => gpuReport((e as { sender?: WebContents } | undefined)?.sender));
  handle('gpu:setHardware', (_e, on: unknown) => {
    const file = gpuOffFilePath();
    const error = setGpuOffFile(file, on === false);
    return error ? { error } : { ok: true as const, path: file };
  });
}
