// The part of exporting that talks to the desktop side: ask where to save, run the export, write the result, and say
// how it went. The dialog and "Export again" both come through here.
import type { VideoCodec } from 'mediabunny';
import { store } from '../core/store';
import { baseName, desktop } from '../io/desktop';
import { notify } from '../io/notify';
import { detectCapabilities } from './capabilities';
import { filtersFor, planExport } from './plan';
import { isCancelled, runExport, type Progress } from './run';
import { formatInfo, type ExportSettings } from './types';

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

export type ExportOutcome = 'done' | 'cancelled' | 'stopped';

export class ExportProblem extends Error {}

/** Plain words for whatever went wrong. */
export function describeError(e: unknown): string {
  if (e instanceof ExportProblem) return e.message;
  const m = e instanceof Error ? e.message : '';
  if (/memory|allocation/i.test(m)) return 'There was not enough memory for that. Try a smaller size, or export one clip at a time.';
  return `Something went wrong while exporting${m ? ` (${m})` : ''}. Try a smaller size or another format.`;
}

/**
 * Asks where to save, draws and encodes, writes the file(s) and says so with a "Show in folder" button.
 * Resolves 'cancelled' when they back out of the save dialog or press Cancel, and throws for real problems.
 */
export async function exportDocument(settings: ExportSettings, signal: AbortSignal, onProgress: (p: Progress) => void): Promise<ExportOutcome> {
  const api = desktop();
  if (!api) throw new ExportProblem('Exporting works in the Frameling desktop app.');
  const { doc, ui } = store().get();
  const plan = planExport(doc, settings, ui.frame);
  if (plan.problem) throw new ExportProblem(plan.problem);
  const info = formatInfo(settings.format);

  // Ask where first, so nobody waits for a long render just to cancel at the end.
  let target: string | null;
  if (settings.format === 'sheet') target = await api.files.pickExportFolder({ title: 'Choose a folder for your sprite sheet' });
  else target = await api.files.pickExportFile({ suggestedName: `${plan.name}.${info.ext}`, filters: filtersFor(settings.format), title: `Export ${info.title}` });
  if (!target) return 'cancelled';

  let videoCodec: VideoCodec | null = null;
  let videoAlpha = false;
  if (settings.format === 'mp4' || settings.format === 'webm') {
    const caps = await detectCapabilities(plan.width, plan.height);
    const c = caps[settings.format];
    if (!c.ok) throw new ExportProblem(c.reason ?? "This computer can't make that kind of video.");
    videoCodec = c.codec;
    videoAlpha = c.alpha;
  }

  let result;
  try {
    result = await runExport({ doc, settings, currentFrame: ui.frame, signal, onProgress, videoCodec, videoAlpha, appVersion: api.versions.app });
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
  saveLastSettings(settings);
  notify(`Exported ${baseName(shown)}.`, 'success', { label: 'Show in folder', run: () => void api.files.showInFolder(shown) }, 9000);
  return 'done';
}
