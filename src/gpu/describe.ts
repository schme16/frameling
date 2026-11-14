// Reading what the desktop side found about drawing, in plain words. Pure: give it the report (src/preload/api.ts,
// GpuReport) and it says which card is drawing, which way it talks to it, whether that is good, and what to try when
// it isn't. Nothing here is measured speed: it only reports what the browser engine says it is doing.
import type { GpuReport } from '../preload/api';
import { isSoftwareRenderer, parseRenderer } from './identify';

export type DrawMode =
  /** The card draws the window and the canvas. */
  | 'card'
  /** The card draws the window, but the drawing canvas is still in software. */
  | 'partly'
  /** Switched off, by the person (the setting, the gpu-off file or FRAMELING_GPU=off) or by a flag. */
  | 'off'
  /** On, but the engine found no card it could use. */
  | 'software';

export type DrawPath = 'Vulkan' | 'OpenGL' | 'Direct3D' | 'Metal' | 'Software';

const VENDORS: Record<number, string> = { 0x1002: 'AMD', 0x10de: 'NVIDIA', 0x8086: 'Intel', 0x106b: 'Apple', 0x1414: 'Microsoft', 0x5143: 'Qualcomm', 0x13b5: 'Arm', 0x1010: 'Imagination', 0x15ad: 'VMware', 0x1af4: 'Virtual machine', 0x1234: 'Virtual machine' };

export const vendorName = (id: number): string => VENDORS[id] ?? (id ? `Vendor 0x${id.toString(16)}` : 'Unknown');

const enabled = (v: string | undefined): boolean => typeof v === 'string' && v.startsWith('enabled');

/** Was Frameling started with hardware drawing off (by the file, the variable or a flag)? */
const runningOff = (r: GpuReport): boolean => !r.hardwareAcceleration || r.flags.includes('--disable-gpu');

/** Whether the card is doing the drawing, from the engine's own verdicts. */
export function drawMode(r: GpuReport): DrawMode {
  // What is running now: the file or variable only count once Frameling has started with them (restartNeeded says when it has not).
  if (runningOff(r)) return 'off';
  // The engine's verdicts say "enabled" for its own software GL too; a page that says llvmpipe is not on a card.
  if (isSoftwareRenderer(r.liveRenderer)) return 'software';
  const compositing = enabled(r.features.gpu_compositing);
  const canvas = enabled(r.features['2d_canvas']);
  if (compositing && canvas) return 'card';
  if (compositing) return 'partly';
  return 'software';
}

/** Which way the browser engine talks to the card. */
export function drawPath(r: GpuReport): DrawPath {
  if (drawMode(r) === 'off' || drawMode(r) === 'software') return 'Software';
  const live = parseRenderer(r.liveRenderer).api;
  if (live === 'Vulkan' || live === 'OpenGL' || live === 'Direct3D' || live === 'Metal') return live;
  const part = r.glImplementation ?? '';
  const angle = /angle=([a-z0-9]+)/i.exec(part)?.[1]?.toLowerCase();
  if (angle === 'vulkan' || enabled(r.features.vulkan)) return 'Vulkan';
  if (angle === 'swiftshader') return 'Software';
  if (angle === 'd3d11' || angle === 'd3d9' || r.platform === 'win32') return 'Direct3D';
  if (angle === 'metal' || r.platform === 'darwin') return 'Metal';
  return 'OpenGL';
}

/** The card's name: the engine's own string, else the renderer text ("ANGLE (NVIDIA, NVIDIA GeForce RTX 4080, ...)"), else the maker. */
export function cardName(r: GpuReport): string | null {
  const dev = r.devices.find((d) => d.active) ?? r.devices[0];
  if (dev?.name) return dev.name;
  for (const text of [r.liveRenderer, r.glRenderer]) {
    const n = parseRenderer(text).name;
    if (n) return n;
  }
  if (r.glRenderer && !isSoftwareRenderer(r.glRenderer) && !/^ANGLE \(/.test(r.glRenderer)) return r.glRenderer;
  if (dev) return `${vendorName(dev.vendorId)} card (device 0x${dev.deviceId.toString(16)})`;
  return null;
}

/** Has the on or off choice changed since Frameling started? Then it needs a restart before it does anything. */
export function restartNeeded(r: GpuReport): boolean {
  return runningOff(r) !== (r.off.file || r.off.env);
}

const mb = (kb: number): string => (kb >= 1024 * 1024 ? `${(kb / 1024 / 1024).toFixed(1)} GB` : `${Math.round(kb / 1024)} MB`);
export const bytesText = (b: number): string => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(b >= 10 * 1024 ** 3 ? 0 : 1)} GB` : `${Math.max(1, Math.round(b / 1024 ** 2))} MB`);

export interface Reading {
  mode: DrawMode;
  /** The one plain line: is that good? */
  headline: string;
  /** What to try, when it isn't. */
  advice: string[];
  /** Rows for the page, and for the copied report. */
  card: string;
  driver: string;
  path: DrawPath;
  cardMemory: string;
  holding: string;
}

/** `keptBytes`: what the layer cache holds right now (Preferences > Performance, Drawings kept ready). */
export function readGpu(r: GpuReport, keptBytes = 0): Reading {
  const mode = drawMode(r);
  const path = drawPath(r);
  const name = cardName(r);
  const found = r.devices.map((d) => `${d.name ?? vendorName(d.vendorId)}${d.reserved ? ' (set aside for a virtual machine)' : ''}`);
  const dev = r.devices.find((d) => d.active) ?? r.devices[0];
  const hardware = mode === 'card' || mode === 'partly';
  const linux = r.platform === 'linux';

  let headline = 'Your card is doing the drawing.';
  const advice: string[] = [];
  if (mode === 'partly') {
    headline = 'Your card draws the window, but the canvas itself is drawn in software, which is slower.';
    advice.push('Update your graphics driver, then restart Frameling.', 'Turn Hardware drawing off and on again below, then restart.');
  } else if (mode === 'off') {
    headline = 'Frameling is drawing in software, which is slower, because hardware drawing is switched off.';
    advice.push(r.off.env ? 'It is off because FRAMELING_GPU=off is set. Start Frameling without it, then restart.' : 'Turn Hardware drawing on below, then restart.');
  } else if (mode === 'software') {
    headline = 'Frameling is drawing in software, which is slower. Here is what to try.';
    advice.push('Update your graphics driver, then restart Frameling.');
    if (linux) advice.push('Start Frameling from the AppImage (it asks for the card as it opens), not by running the program inside it.');
    advice.push('On a remote desktop or in a virtual machine there is often no card to use. That is fine, it just draws slower.');
  }

  // A faster card is here and is not the one drawing: say so, and how to ask for it.
  const spare = r.devices.find((d) => d.discrete && !d.reserved && !d.active);
  if (hardware && spare && linux) advice.push(`This computer also has ${spare.name ?? vendorName(spare.vendorId)}, which is the faster card. Start Frameling with FRAMELING_CARD=discrete to ask for it, then restart.`);

  const driver = dev?.driver ?? (r.glVersion ? r.glVersion : hardware ? 'not reported' : 'none (software)');
  const card = hardware ? name ?? 'a graphics card' : found.length ? `None used (this computer has ${found.join(' and ')})` : 'None found';
  const cardMemory = hardware ? (r.vramBytes ? `${bytesText(r.vramBytes)} on the card` : 'your system does not say') : 'not used';
  const heldKb = hardware && r.gpuKb ? r.gpuKb : 0;
  const parts = [`about ${mb(r.appKb)} in all`];
  if (heldKb) parts.push(`${mb(heldKb)} of it in the graphics process`);
  if (keptBytes) parts.push(`${bytesText(keptBytes)} of it kept drawings`);
  return { mode, headline, advice, card, driver, path, cardMemory, holding: `Frameling is holding ${parts.join(', ')}.` };
}

/**
 * The one line Frameling prints as it starts, so a terminal says at once whether the card is in use. Same facts and words
 * as Preferences > Performance (Card in use, Drawing path), plain words first and the engine's name second.
 */
export function startLine(r: GpuReport): string {
  const x = readGpu(r);
  const how = x.path === 'Software' ? '' : `, through ${x.path}`;
  if (x.mode === 'card' && x.path !== 'Software') return `Frameling: drawing on your graphics card (${x.card})${how}.`;
  if (x.mode === 'partly') return `Frameling: your graphics card (${x.card}) draws the window, but the canvas is drawn in software, which is slower${how}.`;
  const why = x.mode === 'off' ? 'hardware drawing is switched off' : x.mode === 'card' ? 'the engine is using its built-in software drawing' : 'no graphics card could be used';
  return `Frameling: drawing in software, which is slower (${why}).`;
}

/** Everything, as plain text to paste into a bug report. */
export function reportText(r: GpuReport, keptBytes: number, settings: { hardware: boolean; cacheMb: number; scrub: string; fpsCap: number }, appVersion?: string): string {
  const x = readGpu(r, keptBytes);
  const lines = [
    `Frameling drawing report${appVersion ? ` (Frameling ${appVersion})` : ''}`,
    `Result: ${x.headline}`,
    `Mode: ${x.mode}`,
    `Card in use: ${x.card}`,
    `Driver: ${x.driver}`,
    `Drawing path: ${x.path}`,
    `On start: ${startLine(r).replace(/^Frameling: /, '')}`,
    `Card memory: ${x.cardMemory}`,
    `Memory: ${x.holding}`,
    `Asked for: ${r.asked ?? 'nothing (the system picks the card)'}`,
    `Page renderer: ${r.liveRenderer ?? 'not reported'}`,
    `Cards found: ${r.devices.length ? r.devices.map((d) => `${d.name ?? vendorName(d.vendorId)} [${d.vendorId.toString(16)}:${d.deviceId.toString(16)}]${d.active ? ' (active)' : ''}${d.driver ? ` driver ${d.driver}` : ''}${d.discrete ? ' discrete' : ''}${d.reserved ? ' set aside for a virtual machine' : ''}`).join('; ') : 'none'}`,
    `Renderer: ${r.glRenderer ?? 'not reported'}`,
    `GL: ${r.glVersion ?? 'not reported'} ${r.glImplementation ?? ''}`.trim(),
    `Skia backend: ${r.skia ?? 'not reported'}`,
    `System: ${r.platform} ${r.arch}, Electron ${r.electron}, Chromium ${r.chromium}`,
    `Switches: ${r.flags.length ? r.flags.join(' ') : 'none'}`,
    `Hardware drawing setting: ${settings.hardware ? 'on' : 'off'} (gpu-off file ${r.off.file ? 'present' : 'absent'}, FRAMELING_GPU=${r.off.env ? 'off' : 'unset'}) at ${r.off.path}`,
    `Performance settings: kept drawings ${settings.cacheMb} MB, scrubbing ${settings.scrub}, playback cap ${settings.fpsCap || 'none'}`,
    'Engine feature status:',
    ...Object.keys(r.features)
      .sort()
      .map((k) => `  ${k}: ${r.features[k]}`),
  ];
  return lines.join('\n');
}
