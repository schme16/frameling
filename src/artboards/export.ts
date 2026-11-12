/**
 * Exporting artboards. The Export dialog's own format and settings are used; this decides which artboards and how:
 * just the open one (the usual export), each as its own file (into a folder, or one zip), all of them in order as one
 * film, or every frame of them packed onto one sprite sheet.
 */
import { strToU8, zipSync, type Zippable } from 'fflate';
import type { Doc, Id } from '../core/format';
import { store } from '../core/store';
import { registerChoice, choose } from '../core/choices';
import { createStore } from '../ui/mini';
import { baseName, desktop } from '../io/desktop';
import { can } from '../platform';
import { notify } from '../io/notify';
import { encodePng, type RawImage } from '../io/png';
import { detectCapabilities } from '../export/capabilities';
import { backgroundFor, drawFrame, makeCanvas, readPixels } from '../export/draw';
import { MAX_SHEET_SIDE, fileSafe, planExport } from '../export/plan';
import { isCancelled, runExport, type Progress } from '../export/run';
import { formatInfo, type ExportSettings } from '../export/types';
import { artboardDoc, artboardsOf, exportNameOf, hasArtboards, joinShots } from './model';
import { rememberedFrame } from './ops';
import { packArtboardAtlas } from './pack';

export type ArtboardExportMode = 'one' | 'each' | 'joined' | 'atlas';

export interface ArtboardExportChoice {
  mode: ArtboardExportMode;
  /** Which artboards (missing = all). */
  ids: Id[] | null;
}

/** What the Export dialog's artboard row is set to. Back to "this artboard" for each new document. */
export const artboardExport = createStore<ArtboardExportChoice & { docId: string }>({ mode: 'one', ids: null, docId: '' });

export function currentArtboardExport(doc: Doc): ArtboardExportChoice {
  const c = artboardExport.get();
  if (c.docId !== doc.id || !hasArtboards(doc)) return { mode: 'one', ids: null };
  const known = new Set(artboardsOf(doc).map((a) => a.id));
  return { mode: c.mode, ids: c.ids ? c.ids.filter((id) => known.has(id)) : null };
}

export function setArtboardExport(p: Partial<ArtboardExportChoice>): void {
  const docId = store().get().doc.id;
  artboardExport.set((c) => ({ ...(c.docId === docId ? c : { mode: 'one' as const, ids: null }), ...p, docId }));
}

export type ArtboardFolderChoice = 'folder' | 'zip';

registerChoice<ArtboardFolderChoice>({
  id: 'artboards.exportAs',
  title: 'Exporting several artboards',
  question: 'Where should the artboards go, one file each?',
  category: 'Export',
  default: 'folder',
  help: 'Each artboard is saved as its own file, named after the artboard.',
  options: [
    { value: 'folder', label: 'Into a folder', detail: 'Pick a folder and every artboard lands in it, ready to use.' },
    { value: 'zip', label: 'One zip file', detail: 'Everything in one .zip, handy for sending or uploading.' },
  ],
});

class ArtboardExportProblem extends Error {}

/** Why a way of exporting doesn't go with this format (or null when it does). */
export function modeOff(mode: ArtboardExportMode, settings: ExportSettings): string | null {
  if (mode === 'joined' && !formatInfo(settings.format).animated) return 'Pick a video, an animation or a sprite sheet for this';
  if (mode === 'atlas' && settings.format !== 'sheet') return 'Pick Sprite sheet for this';
  return null;
}

/** The way it will really export: what was picked, unless it doesn't go with the format. */
export function effectiveMode(doc: Doc, settings: ExportSettings): ArtboardExportMode {
  const m = currentArtboardExport(doc).mode;
  return modeOff(m, settings) ? 'one' : m;
}

/** True when this export is about more than the open artboard. */
export function exportsSeveral(doc: Doc, settings: ExportSettings): boolean {
  return effectiveMode(doc, settings) !== 'one';
}

/**
 * The artboards one after another as one film, and the settings to export it with. A sprite sheet turns it into one
 * sprite: every frame of every artboard in order, as a single animation (the boards' own clips are left out, they
 * would split it), always the whole of it.
 */
export function filmOf(root: Doc, ids: Id[], settings: ExportSettings): { doc: Doc; starts: number[]; settings: ExportSettings } | { problem: string } {
  const r = joinShots(root, ids);
  if ('problem' in r) return r;
  if (settings.format !== 'sheet') return { ...r, settings };
  return { doc: { ...r.doc, clips: [] }, starts: r.starts, settings: { ...settings, range: 'all', clipId: null } };
}

/** Which artboards, in list order. */
function chosenIds(doc: Doc, c: ArtboardExportChoice): Id[] {
  const all = artboardsOf(doc).map((a) => a.id);
  return c.ids ? all.filter((id) => c.ids!.includes(id)) : all;
}

/** What a several-artboards export will make, for the dialog's footer. */
export interface ArtboardPlan {
  mode: ArtboardExportMode;
  /** How many files come out. */
  files: number;
  /** Frames in all across the ticked artboards. */
  frames: number;
  /** The picture's size in pixels: only for "all in order, as one" (the first shot's size, at the chosen scale). */
  size: { width: number; height: number } | null;
  /** For one file each, or all packed on one sheet: the size every frame comes out at when they all match, else null. */
  frameSize?: { width: number; height: number } | null;
  /** True when the boards would come out at different sizes (so the footer cannot give one size). */
  sizesVary?: boolean;
  problem: string | null;
}

/** The one size all of these are, or null (and `vary`) when they differ. */
function commonSize(sizes: { width: number; height: number }[]): { frameSize: { width: number; height: number } | null; sizesVary: boolean } {
  const first = sizes[0];
  if (first && sizes.every((z) => z.width === first.width && z.height === first.height)) return { frameSize: first, sizesVary: false };
  return { frameSize: null, sizesVary: sizes.length > 1 };
}

/**
 * The plan for the whole artboard export, or null when it is just the open artboard (then the dialog's own plan
 * says it all). "As one" is planned on the joined film itself, so its size and frames are what comes out.
 */
export function planArtboards(root: Doc, settings: ExportSettings, currentFrame: number): ArtboardPlan | null {
  const mode = effectiveMode(root, settings);
  if (mode === 'one') return null;
  const ids = chosenIds(root, currentArtboardExport(root));
  if (!ids.length) return { mode, files: 0, frames: 0, size: null, problem: 'Pick at least one artboard to export.' };
  if (mode === 'joined') {
    const r = filmOf(root, ids, settings);
    if ('problem' in r) return { mode, files: 1, frames: 0, size: null, problem: r.problem };
    const p = planExport(r.doc, r.settings, currentFrame);
    return { mode, files: 1, frames: p.count, size: { width: p.width, height: p.height }, problem: p.problem };
  }
  if (mode === 'atlas') {
    const sizes = ids.map((id) => {
      const p = planExport(artboardDoc(root, id), settings, 0);
      return { width: p.width, height: p.height };
    });
    return { mode, files: 1, frames: ids.reduce((t, id) => t + artboardDoc(root, id).length, 0), size: null, ...commonSize(sizes), problem: null };
  }
  let frames = 0;
  let problem: string | null = null;
  const sizes: { width: number; height: number }[] = [];
  for (const id of ids) {
    const doc = artboardDoc(root, id);
    const p = planExport(doc, settings, rememberedFrame(id, doc.length));
    frames += p.count;
    sizes.push({ width: p.width, height: p.height });
    if (p.problem && !problem) problem = `${exportNameOf(root, id)}: ${p.problem}`;
  }
  return { mode, files: ids.length, frames, size: null, ...commonSize(sizes), problem };
}

/** What the footer says about size: one size when every frame matches, else "sizes vary" (nothing when unknown). */
export function sizeWords(a: Pick<ArtboardPlan, 'frameSize' | 'sizesVary'>, each = ' each'): string {
  if (a.frameSize) return `, ${a.frameSize.width} × ${a.frameSize.height} px${each}`;
  return a.sizesVary ? ', sizes vary' : '';
}

/** The footer line for an artboard export: counts, frames in all and the size (`printed` is appended to a joined size). */
export function artboardSummary(a: ArtboardPlan, printed = ''): string {
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`;
  if (a.mode === 'joined' && a.size) return `${n(a.frames, 'frame')} in all, ${a.size.width} × ${a.size.height} px${printed}`;
  if (a.mode === 'atlas') return `${n(a.frames, 'frame')} on one sheet${sizeWords(a)}`;
  return `${n(a.files, 'file')}, ${n(a.frames, 'frame')} in all${sizeWords(a)}`;
}

/**
 * The Export dialog's note for a format that makes one frame: with several boards it is one frame from each board
 * (the one it was last showing), not the frame of the open board. `frame` is the open board's frame, from 0.
 */
export function singleFrameNote(a: ArtboardPlan | null, frame: number): string {
  if (!a || a.mode !== 'each' || a.files < 1) return `Exports frame ${frame + 1}, the one you are looking at.`;
  if (a.files === 1) return 'Exports one frame, the one that board was last showing.';
  return `Exports one frame from each of the ${a.files} boards, the one each was last showing.`;
}

/**
 * Exports several artboards. `exportOne` is the Export dialog's ordinary export of a given document (it asks where
 * to save). Resolves like it: 'done', 'cancelled' or 'stopped'.
 */
export async function exportArtboards(
  settings: ExportSettings,
  signal: AbortSignal,
  onProgress: (p: Progress) => void,
  exportOne: (doc: Doc, settings: ExportSettings) => Promise<'done' | 'cancelled' | 'stopped'>,
): Promise<'done' | 'cancelled' | 'stopped'> {
  const api = desktop();
  if (!api) throw new ArtboardExportProblem('Exporting works in the Frameling desktop app.');
  const root = store().rootDoc();
  const c = { ...currentArtboardExport(root), mode: effectiveMode(root, settings) };
  const ids = chosenIds(root, c);
  if (!ids.length) throw new ArtboardExportProblem('Pick at least one artboard to export.');

  if (c.mode === 'joined') {
    const r = filmOf(root, ids, settings);
    if ('problem' in r) throw new ArtboardExportProblem(r.problem);
    return exportOne(r.doc, r.settings);
  }

  const info = formatInfo(settings.format);
  if (c.mode === 'atlas') {
    const target = await api.files.pickExportFolder({ title: 'Choose a folder for the sprite sheet', suggestedName: `${fileSafe(root.name)}-atlas` });
    if (!target) return 'cancelled';
    const { files, main } = await atlasFiles(root, ids, settings, signal, onProgress);
    const w = await api.files.writeMany(target, files);
    if (!w) return 'stopped';
    if ('error' in w) throw new ArtboardExportProblem(w.error);
    const shown = w.paths.find((p) => baseName(p) === main) ?? w.paths[0];
    notify(`Exported ${ids.length} artboards onto ${main}.`, 'success', can('showInFolder') ? { label: 'Show in folder', run: () => void api.files.showInFolder(shown) } : undefined, 9000, 'cheer', 'exported');
    return 'done';
  }

  // Each artboard as its own file.
  const where = await choose<ArtboardFolderChoice>('artboards.exportAs');
  let target: string | null;
  const zipName = `${fileSafe(root.name)}-artboards`;
  if (where === 'zip') target = await api.files.pickExportFile({ suggestedName: `${zipName}.zip`, filters: [{ name: 'Zip file', extensions: ['zip'] }], title: 'Export artboards' });
  else target = await api.files.pickExportFolder({ title: 'Choose a folder for your artboards', suggestedName: zipName });
  if (!target) return 'cancelled';
  const files: { name: string; bytes: Uint8Array }[] = [];
  const notes: string[] = [];
  for (let k = 0; k < ids.length; k++) {
    const doc = artboardDoc(root, ids[k]);
    const name = exportNameOf(root, ids[k]);
    const plan = planExport(doc, settings, rememberedFrame(ids[k], doc.length));
    if (plan.problem) throw new ArtboardExportProblem(`${name}: ${plan.problem}`);
    const step = (p: Progress) => onProgress({ done: k * 100 + Math.round((p.done / Math.max(1, p.total)) * 100), total: ids.length * 100, label: `${name}: ${p.label}` });
    let videoCodec = null;
    let videoAlpha = false;
    if (settings.format === 'mp4' || settings.format === 'webm') {
      const caps = await detectCapabilities(plan.width, plan.height);
      const cap = caps[settings.format];
      if (!cap.ok) throw new ArtboardExportProblem(cap.reason ?? "This computer can't make that kind of video.");
      videoCodec = settings.format === 'webm' && settings.transparent && cap.alphaCodec ? cap.alphaCodec : cap.codec;
      videoAlpha = cap.alpha;
    }
    if (settings.format === 'prores') throw new ArtboardExportProblem('ProRes goes one artboard at a time. Pick "This artboard", or another format.');
    let result;
    try {
      result = await runExport({ doc, settings, currentFrame: rememberedFrame(ids[k], doc.length), signal, onProgress: step, videoCodec, videoAlpha, appVersion: api.versions.app, toAac: api.media?.toAac });
    } catch (e) {
      if (isCancelled(e)) return 'cancelled';
      throw e;
    }
    if (result.kind === 'file') {
      files.push({ name: result.name, bytes: result.bytes });
      if (result.note) notes.push(`${name}: ${result.note}`);
    } else for (const f of result.files) files.push(f);
  }
  let shown: string;
  if (where === 'zip') {
    const z: Zippable = {};
    for (const f of files) z[f.name] = [f.bytes, { level: 0 }];
    const w = await api.files.write(target, zipSync(z));
    if ('error' in w) throw new ArtboardExportProblem(w.error);
    shown = target;
  } else {
    const w = await api.files.writeMany(target, files);
    if (!w) return 'stopped';
    if ('error' in w) throw new ArtboardExportProblem(w.error);
    shown = w.paths[0];
  }
  const what = `${ids.length} artboard${ids.length === 1 ? '' : 's'} as ${info.title}`;
  notify(`Exported ${what}${where === 'zip' ? ` in ${baseName(target)}` : ''}.${notes.length ? ` ${notes[0]}` : ''}`, notes.length ? 'warn' : 'success', can('showInFolder') ? { label: 'Show in folder', run: () => void api.files.showInFolder(shown) } : undefined, 9000, 'cheer', 'exported');
  return 'done';
}

/** Draws every frame of each artboard and packs them onto one sheet with a JSON atlas. */
export async function atlasFiles(root: Doc, ids: Id[], settings: ExportSettings, signal: AbortSignal, onProgress: (p: Progress) => void): Promise<{ files: { name: string; bytes: Uint8Array }[]; main: string }> {
  const sets = [];
  const total = ids.reduce((t, id) => t + artboardDoc(root, id).length, 0);
  let done = 0;
  for (const id of ids) {
    const doc = artboardDoc(root, id);
    const name = exportNameOf(root, id);
    const scale = settings.scale;
    const w = Math.max(1, Math.round(doc.width * scale));
    const h = Math.max(1, Math.round(doc.height * scale));
    const canvas = makeCanvas(w, h);
    const bg = backgroundFor(doc, settings.transparent, true);
    const crisp = doc.layers.length > 0 && doc.layers.every((l) => l.kind !== 'vector' || !!l.rig);
    const frames: RawImage[] = [];
    for (let f = 0; f < doc.length; f++) {
      if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
      if (f % 2 === 0) await new Promise((r) => setTimeout(r, 0));
      onProgress({ done: done++, total, label: `Drawing ${name}, frame ${f + 1} of ${doc.length}` });
      const img = readPixels(drawFrame(canvas, doc, f, { width: w, height: h, scale, background: bg, crisp }));
      frames.push({ width: img.width, height: img.height, pixels: new Uint8ClampedArray(img.pixels) });
    }
    sets.push({ name, frames, clips: doc.clips });
  }
  onProgress({ done: total, total, label: 'Packing the sheet' });
  const base = `${fileSafe(root.name)}-atlas`;
  const r = packArtboardAtlas(sets, { fps: root.fps, scale: settings.scale, maxSide: MAX_SHEET_SIDE, image: `${base}.png`, pot: settings.sheet?.pot });
  if ('problem' in r) throw new ArtboardExportProblem(r.problem);
  return {
    main: `${base}.png`,
    files: [
      { name: `${base}.png`, bytes: encodePng(r.image) },
      { name: `${base}.json`, bytes: strToU8(JSON.stringify(r.json, null, 2)) },
    ],
  };
}

export { ArtboardExportProblem };
