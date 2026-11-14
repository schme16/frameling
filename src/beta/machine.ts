// What a report says about this computer: the processor, the memory, the graphics card and how Frameling is drawing on
// it. Built from the same drawing report Preferences > Performance reads (src/gpu), so the words are the same words and
// there is one place to fix them. Pure. Everything here is shown to the person before it goes, in plain rows above the
// exact text (see MachineBox), and it only goes at all when they leave "Include details of this computer" on.
//
// What is left out on purpose: the path of the gpu-off file (it holds a home folder), anything about files or the
// document, and anything that names the person. Free text is run through scrub() anyway, in case a driver puts a path in.
import type { GpuReport } from '../preload/api';
import { archText, cpuText } from '../gpu/cpu';
import { bytesText, readGpu } from '../gpu/describe';
import { scrub } from './report';

export interface MachineFacts {
  processor: { model: string; cores?: number; threads: number; architecture: string };
  /** Everything the computer has, in bytes. */
  memoryBytes: number;
  graphics: {
    /** The card doing the drawing, in plain words ("None used (...)" when it is software). */
    card: string;
    driver: string;
    /** OpenGL, Vulkan, Direct3D, Metal or Software. */
    drawingPath: string;
    /** card, partly, off or software: whether the card draws the window and the canvas. */
    mode: string;
    /** The one sentence Preferences > Performance leads with. */
    result: string;
    /** The Hardware drawing setting, as the person left it (the gpu-off file and FRAMELING_GPU both turn it off). */
    hardwareDrawing: 'on' | 'off';
    /** FRAMELING_GPU=off is set. */
    envOff: boolean;
    /** The switches Frameling started with, as given: this combination is what decides whether the canvas draws. */
    switches: string[];
    /** What Frameling asked the system for about the card, in plain words. */
    asked: string;
    /** What a page's own drawing says it is drawing on. */
    pageRenderer: string;
    cardsFound: string[];
    cardMemory: string;
    /** For example "(gl=egl-angle,angle=vulkan)". */
    engine: string;
    skia: string;
    /** The engine's verdict per job: enabled_on, disabled_software and so on. */
    features: Record<string, string>;
  };
}

const clean = (s: string | undefined, fallback = 'not reported'): string => scrub(s ?? '').trim() || fallback;

/** The facts, or null when the desktop side cannot say (the web build, where the browser decides how to draw). */
export function machineFacts(r: GpuReport | null | undefined): MachineFacts | null {
  if (!r) return null;
  const x = readGpu(r);
  return {
    processor: {
      model: clean(r.cpu?.model),
      ...(r.cpu?.cores ? { cores: r.cpu.cores } : {}),
      threads: r.cpu?.threads ?? 0,
      architecture: archText(r.cpu?.arch ?? r.arch),
    },
    memoryBytes: r.memoryBytes ?? 0,
    graphics: {
      card: clean(x.card),
      driver: clean(x.driver),
      drawingPath: x.path,
      mode: x.mode,
      result: x.headline,
      hardwareDrawing: r.off.file || r.off.env ? 'off' : 'on',
      envOff: r.off.env,
      switches: r.flags.map((f) => clean(f)),
      asked: clean(r.asked, 'nothing (the system picks the card)'),
      pageRenderer: clean(r.liveRenderer),
      cardsFound: r.devices.map((d) => clean(`${d.name ?? 'Unknown'}${d.active ? ' (in use)' : ''}${d.driver ? `, driver ${d.driver}` : ''}${d.discrete ? ', its own memory' : ''}${d.reserved ? ', set aside for a virtual machine' : ''}`)),
      cardMemory: x.cardMemory,
      engine: clean(`${r.glImplementation ?? ''} ${r.glVersion ?? ''}`),
      skia: clean(r.skia),
      features: Object.fromEntries(Object.entries(r.features).map(([k, v]) => [k, clean(v)])),
    },
  };
}

/** The plain rows the preview shows above the exact text: label, value. The facts a person most wants to see first. */
export function machineRows(m: MachineFacts): [string, string][] {
  const p = m.processor;
  const n = (x: number, w: string) => `${x} ${w}${x === 1 ? '' : 's'}`;
  const g = m.graphics;
  return [
    ['Processor', cpuText({ model: p.model, cores: p.cores, threads: p.threads, arch: '' })],
    ['Processor type', p.architecture],
    ['Memory in this computer', m.memoryBytes ? bytesText(m.memoryBytes) : 'not reported'],
    ['Graphics card in use', g.card],
    ['Driver', g.driver],
    ['Drawing path', g.drawingPath],
    ['Hardware drawing', `${g.hardwareDrawing}${g.envOff ? ' (FRAMELING_GPU=off)' : ''}`],
    ['Result', g.result],
    ['Switches', g.switches.length ? g.switches.join(' ') : 'none'],
    ['Cards in this computer', g.cardsFound.length ? `${n(g.cardsFound.length, 'card')}: ${g.cardsFound.join('; ')}` : 'none'],
  ];
}
