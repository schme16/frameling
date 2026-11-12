// The export formats, registered one by one. Each format says what its card in the Export dialog looks like, how it
// plans frames, what it keeps (the "What carries over" note), which options it shows and how to make the file, with
// the making loaded only when it is used. The built-in formats are in builtin.ts; a feature adds its own through its
// descriptor (`exporters`), so they go away when it is turned off. The sandboxed plugins' exporters are separate (src/plugins).
import type { ComponentType } from 'react';
import type { Doc, EffectKind } from '../core/format';
import { ownedUndo } from '../core/owners';
import type { ArtboardPlan } from '../artboards/export';
import type { Plan } from './plan';
import type { ExportSettings, FormatInfo } from './types';
import type { Progress, RunContext, RunResult } from './runtime';

/** Things a document can have that not every format can carry. */
export type Feature = 'text' | 'particles' | 'tint' | 'blend' | 'effects' | 'clip' | 'mask' | 'folders' | 'bones' | 'gradientAlpha';

/** kept: as itself. shapes: kept, but as outlines or shapes rather than editable text. picture: baked into pictures. out: left out. */
export type Carry = 'kept' | 'shapes' | 'picture' | 'out';

export interface FormatCarry {
  /** One sentence for everything at once (used alone for pictures-of-frames formats). */
  summary: string;
  /** Per feature, when the summary isn't the whole story. Missing = kept. */
  rows?: Partial<Record<Feature, Carry>>;
  /** Effects this format has its own version of (the rest go by `rows.effects`). */
  nativeEffects?: EffectKind[];
  /** Help topic with the full story. */
  help?: string;
}

/** What the options a format shows can reach: the dialog's settings and a few things worked out from them. */
export interface ExportUiProps {
  s: ExportSettings;
  set: (p: Partial<ExportSettings>) => void;
  setSheet: (p: Partial<ExportSettings['sheet']>) => void;
  doc: Doc;
  plan: Plan;
  /** What this computer can do for this format (see `support`), once known. */
  support: FormatSupport | null;
}

/** What the hooks that read the finished dialog get: the options' props and the plan for several artboards. */
export type ExportUiHookProps = ExportUiProps & { abPlan: ArtboardPlan | null };

/** The parts of the dialog a format adds. All of them are optional. */
export interface ExportUi {
  /** Replaces the usual line under the dialog (the sprite sheet's, for a pixel drawing); null leaves it. */
  summary?(p: ExportUiHookProps): string | null;
  /** Called when an export of this format has finished. */
  exported?(p: ExportUiHookProps): void;
  /** Above "What to export" (where it is going, what a package holds). */
  Before?: ComponentType<ExportUiProps>;
  /** Instead of the Size block, for a format that has no size to pick (Lottie). */
  Size?: ComponentType<ExportUiProps>;
  /** Its own note about what it keeps, instead of the shared "What carries over" sentence (that box then only warns). */
  Notes?: ComponentType<ExportUiProps>;
  /** Below "What carries over" (codec, playback, the sheet's layout). */
  After?: ComponentType<ExportUiProps>;
}

/** What this computer can make, asked up front so the card can grey out and say why. */
export interface FormatSupport {
  /** Plain words for why it cannot be made here, or null. */
  why: string | null;
  /** Can it keep a see-through background here? Missing = what the format's card says. */
  alpha?: boolean;
  /** For a video: the codec it will use, and the one for a see-through background when that differs. */
  video?: { ok: boolean; codec: string | null; alphaCodec?: string | null };
}

/** What a format's making gets, built once per export (the canvas is reused for every frame). */
export interface RunEnv {
  plan: Plan;
  /** 'none' means see-through. */
  bg: 'doc' | 'none' | 'white';
  /** Pixel art or bones only: keep edges hard. */
  crisp: boolean;
  canvas: OffscreenCanvas;
  /** Draws picture `i` of the export onto the shared canvas. */
  frameAt: (i: number) => OffscreenCanvas;
  /** The pixels of picture `i`. They are overwritten by the next call, so copy what you keep. */
  rgbaAt: (i: number) => { width: number; height: number; pixels: Uint8ClampedArray };
  step: (done: number, label: string) => void;
}

export interface ExporterRun {
  run(ctx: RunContext, env: RunEnv): Promise<RunResult>;
}

export interface ExporterDef {
  /** The card, and the id saved in settings (so keep it for good). */
  info: FormatInfo;
  /** Place among the formats shown first (1 is first); the rest sit under "More formats". */
  popular?: number;
  /** A video: sizes come out even, and it needs at least two frames. */
  video?: boolean;
  /** Pictures shown one after another with no direction or repeat count of their own (a clip's play order is baked in). */
  baked?: boolean;
  /** Pictures to look at, not to play: each frame once, however often the clip repeats. */
  stills?: boolean;
  /** Has a loop setting of its own. */
  loops?: boolean;
  /** The settings make it a still (Illustrator set to "This frame"): only the frame being looked at comes out. */
  singleFrame?(s: ExportSettings): boolean;
  /** What it keeps, said before anyone exports. */
  carry: FormatCarry;
  /** A sentence to add when a clip plays in a way the format cannot carry. */
  clipPlayNote?: string;
  /** The extension when it depends on the settings (a dotLottie, a zip of files). */
  extension?(s: ExportSettings): string;
  /** The name in the save dialog's file type list (and the extension, when it is not the usual one). */
  fileKind?(s: ExportSettings): { name: string; extensions?: string[] };
  /** A format that saves a folder of files asks for a folder; this is what the dialog says. */
  folderTitle?: string;
  /** Written by something else (ProRes streams to FFmpeg): called with the place to write, instead of `load`. */
  direct?(doc: Doc, s: ExportSettings, frame: number, target: string, signal: AbortSignal, onProgress: (p: Progress) => void): Promise<void>;
  /** Checks it can be made here and works out what the run needs (the video codec). Throws a problem in plain words. */
  prepare?(plan: Plan, s: ExportSettings): Promise<Partial<RunContext>>;
  /** Anything to ask or settle before asking where to save (an MP4 that would be silent here). */
  settle?(doc: Doc, s: ExportSettings): Promise<ExportSettings>;
  /** What this computer can make, for the card. Asked again when the size changes. */
  support?(size: { width: number; height: number }, fresh: boolean): Promise<FormatSupport>;
  /** Fixes up settings remembered from last time that no longer make sense. */
  repair?(s: ExportSettings): void;
  /** Why a see-through background is not on offer, in plain words. */
  noAlphaWhy?: string;
  /** Settings to change when its card is picked. */
  picked?(prev: ExportSettings, ctx: { art: number | null }): Partial<ExportSettings>;
  /** Settings to change when a command opens the dialog on it. */
  opened?(ctx: { art: number | null }): Partial<ExportSettings>;
  /** Makes the file or files. Loaded on first use. */
  load(): Promise<ExporterRun>;
  /** The options it shows in the dialog. Loaded when the dialog opens. */
  ui?(): Promise<ExportUi>;
}

const defs = new Map<string, ExporterDef>();
let version = 0;
const listeners = new Set<() => void>();

/** Adds a format. Called inside a feature's registration it is taken away again with the feature. */
export function registerExporter(def: ExporterDef): void {
  const id = def.info.id;
  const before = defs.get(id);
  defs.set(id, def);
  version++;
  ownedUndo(() => {
    if (defs.get(id) !== def) return;
    if (before) defs.set(id, before);
    else defs.delete(id);
    version++;
    for (const fn of [...listeners]) fn();
  });
}

/** Every registered format, in the order they were registered (the order of the cards). */
export const allExporters = (): ExporterDef[] => [...defs.values()];
export const exporterOf = (id: string): ExporterDef | undefined => defs.get(id);
export const hasExporter = (id: string): boolean => defs.has(id);
export const exportersVersion = (): number => version;
export function onExportersChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The card for a format. Throws for an id nobody registered (a feature that is off), so callers check `hasExporter` first. */
export function exporterInfo(id: string): FormatInfo {
  const d = defs.get(id);
  if (!d) throw new Error(`Nothing exports as "${id}".`);
  return d.info;
}

/** The format cards split into the popular ones (in their ranked order) and the rest. */
export function splitExporters(list: ExporterDef[] = allExporters()): { popular: FormatInfo[]; more: FormatInfo[] } {
  const popular = list.filter((d) => d.popular !== undefined).sort((a, b) => a.popular! - b.popular!);
  return { popular: popular.map((d) => d.info), more: list.filter((d) => d.popular === undefined).map((d) => d.info) };
}

const uis = new Map<string, ExportUi>();

/** Loads the options of every format, so the dialog can show them without waiting. */
export async function loadExportUis(): Promise<void> {
  await Promise.all(
    allExporters().map(async (d) => {
      if (!d.ui || uis.has(d.info.id)) return;
      uis.set(d.info.id, await d.ui());
    }),
  );
}

/** The options of a format, once `loadExportUis` has run. */
export const exportUiOf = (id: string): ExportUi | undefined => uis.get(id);
