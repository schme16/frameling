// The part of exporting that talks to the desktop side: ask where to save, run the export, write the result, and say
// how it went. The dialog and "Export again" both come through here.
import { sceneOf } from '../core/symbols';
import { store } from '../core/store';
import { baseName, desktop } from '../io/desktop';
import { can } from '../platform';
import { notifySaved } from '../io/notify';
import { extensionFor, filtersFor, planExport } from './plan';
import { isCancelled, runExport, type Progress } from './run';
import { SheetProblem } from './engines';
import './choices';
import { exporterOf } from './registry';
import { ExportProblem } from './problem';
import type { RunContext } from './runtime';
import type { Doc } from '../core/format';
import { ArtboardExportProblem, exportArtboards, exportsSeveral } from '../artboards/export';
import { DEFAULT_SHEET, formatInfo, normalizeSheet, type ExportSettings, type SheetSettings } from './types';

const KEY = 'frameling.export.last';

/** The settings used last time, if any (kept in the browser's own storage, so they survive restarts). */
export function loadLastSettings(): ExportSettings | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ExportSettings) : null;
  } catch {
    return null;
  }
}

export function saveLastSettings(s: ExportSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Remembering is a nicety, never a problem.
  }
}

const EXTRAS_KEY = 'frameling.export.sheetExtras';

/** The sprite sheet choices that stay put between exports: the engine, the "also save" ticks and how the sheet is laid out. */
export type SheetExtras = Pick<SheetSettings, 'json' | 'godot' | 'godotScene'> & Partial<Pick<SheetSettings, 'engine' | 'layout' | 'content' | 'separateFiles' | 'jsonStyle' | 'unityScript' | 'godotRig'>>;

const EXTRA_KEYS = ['engine', 'layout', 'content', 'separateFiles', 'jsonStyle', 'unityScript', 'godotRig'] as const;

/** The sprite sheet's remembered choices as last left (JSON on and Godot off to begin with). */
export function loadSheetExtras(): SheetExtras | null {
  try {
    const raw = localStorage.getItem(EXTRAS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    const out: SheetExtras = { json: v.json !== false, godot: v.godot === true, godotScene: v.godotScene === true };
    // Only what was saved comes back, through the same checks as everything else.
    const n = normalizeSheet({ ...DEFAULT_SHEET, ...v });
    for (const k of EXTRA_KEYS) if (k in v) (out as Record<string, unknown>)[k] = n[k];
    return out;
  } catch {
    return null;
  }
}

export function saveSheetExtras(s: SheetSettings): void {
  try {
    const v: Record<string, unknown> = { json: s.json, godot: s.godot, godotScene: s.godotScene };
    for (const k of EXTRA_KEYS) if (s[k] !== undefined) v[k] = s[k];
    localStorage.setItem(EXTRAS_KEY, JSON.stringify(v));
  } catch {
    // Remembering is a nicety, never a problem.
  }
}

export type ExportOutcome = 'done' | 'cancelled' | 'stopped';

export { ExportProblem };

/** Plain words for whatever went wrong. */
export function describeError(e: unknown): string {
  if (e instanceof ExportProblem || e instanceof SheetProblem) return e.message;
  const m = e instanceof Error ? e.message : '';
  if (/memory|allocation/i.test(m)) return 'There was not enough memory for that. Try a smaller size, or export one clip at a time.';
  return `Something went wrong while exporting${m ? ` (${m})` : ''}. Try a smaller size or another format.`;
}

/**
 * Asks where to save, draws and encodes, writes the file(s) and says so with a "Show in folder" button.
 * Resolves 'cancelled' when they back out of the save dialog or press Cancel, and throws for real problems.
 */
export async function exportDocument(settings: ExportSettings, signal: AbortSignal, onProgress: (p: Progress) => void, only?: Doc): Promise<ExportOutcome> {
  const api = desktop();
  if (!api) throw new ExportProblem('Exporting works in the Frameling desktop app.');
  const st = store().get();
  // Several artboards at once (each its own file, all in order, or one atlas): see src/artboards/export.ts.
  if (!only && exportsSeveral(store().rootDoc(), settings)) {
    try {
      return await exportArtboards(settings, signal, onProgress, (d, st) => exportDocument(st, signal, onProgress, d));
    } catch (e) {
      throw e instanceof ArtboardExportProblem ? new ExportProblem(e.message) : e;
    }
  }
  // While a symbol is open, export the scene as it is saved.
  const { doc, frame } = only ? { doc: only, frame: 0 } : sceneOf(st.doc, st.ui.frame);
  const picked = settings;
  const def = exporterOf(settings.format);
  if (!def) throw new ExportProblem('That kind of export is turned off. Turn it on in Preferences > Features.');
  // A format may need to settle something first (an MP4 whose sound would not play everywhere: ask what to do).
  if (def.settle) settings = await def.settle(doc, settings);
  const plan = planExport(doc, settings, frame);
  if (plan.problem) throw new ExportProblem(plan.problem);
  const info = formatInfo(settings.format);
  const made = exporterOf(settings.format) ?? def;

  // Ask where first, so nobody waits for a long render just to cancel at the end.
  let target: string | null;
  if (made.folderTitle) target = await api.files.pickExportFolder({ title: made.folderTitle, suggestedName: plan.name });
  else target = await api.files.pickExportFile({ suggestedName: `${plan.name}.${extensionFor(settings)}`, filters: filtersFor(settings.format, settings), title: `Export ${info.title}` });
  if (!target) return 'cancelled';

  // Whether this computer can make it, and what it needs (the video codec).
  const prepared: Partial<RunContext> = made.prepare ? await made.prepare(plan, settings) : {};

  if (made.direct) {
    try {
      await made.direct(doc, settings, frame, target, signal, onProgress);
    } catch (e) {
      if (isCancelled(e)) return 'cancelled';
      throw new ExportProblem(e instanceof Error ? e.message : String(e));
    }
    saveLastSettings(settings);
    notifySaved(`Exported ${baseName(target)}.`, 'success', can('showInFolder') ? { label: 'Show in folder', run: () => void api.files.showInFolder(target!) } : undefined, 9000, 'cheer', 'exported');
    return 'done';
  }

  let result;
  try {
    result = await runExport({ doc, settings, currentFrame: frame, signal, onProgress, ...prepared, appVersion: api.versions.app, toAac: api.media?.toAac });
  } catch (e) {
    if (isCancelled(e)) return 'cancelled';
    throw e;
  }

  let shown: string;
  if (result.kind === 'file') {
    const w = await api.files.write(target, result.bytes);
    if ('error' in w) throw new ExportProblem(w.error);
    shown = target;
  } else {
    const w = await api.files.writeMany(target, result.files);
    if (!w) return 'stopped';
    if ('error' in w) throw new ExportProblem(w.error);
    shown = w.paths.find((p) => baseName(p) === result.main) ?? w.paths[0];
  }
  saveLastSettings(picked);
  const note = result.kind === 'file' ? result.note : undefined;
  notifySaved(`Exported ${baseName(shown)}.${note ? ` ${note}` : ''}`, note ? 'warn' : 'success', can('showInFolder') ? { label: 'Show in folder', run: () => void api.files.showInFolder(shown) } : undefined, 9000, 'cheer', 'exported');
  return 'done';
}
