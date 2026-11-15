// Makes the timelapse video through the app's own export (src/export): the saved pictures are handed to the same MP4,
// WebM and GIF writers the Export dialog uses, so the result is a normal Frameling export (H.264 for MP4, even sizes,
// the usual colours). Nothing here draws or encodes by itself.
import { withChoice } from '../core/choices';
import { store } from '../core/store';
import { newDoc } from '../core/doc';
import { desktop, baseName } from '../io/desktop';
import { notifySaved } from '../io/notify';
import { can } from '../platform';
import { library } from '../platform/library';
import { targetFor } from '../export/exporter';
import { ExportProblem } from '../export/problem';
import { defaultSettings, extensionFor, filtersFor, planExport } from '../export/plan';
import { exporterOf } from '../export/registry';
import { isCancelled, runExport, type Progress } from '../export/run';
import { clearPictures, findKept, recorder } from './recorder';
import { exportSize, fpsFor, timing, type TimelapseFormat, type Timing } from './plan';
import type { Kept } from './plan';
import { displayFile } from '../core/streamSafe';

export type TimelapseOutcome = 'done' | 'cancelled' | 'empty';

/** Decodes one saved picture into pixels at the size of the file. The last one is kept, because held pictures come in a row. */
function pictureLoader(pictures: Kept[], size: { width: number; height: number }) {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  let lastIndex = -1;
  let last: { width: number; height: number; pixels: Uint8ClampedArray } | null = null;
  return async (index: number) => {
    if (index === lastIndex && last) return last;
    const bytes = await library.read('timelapse', pictures[index].id);
    if (!bytes) throw new ExportProblem('A picture of the timelapse has gone missing, so the video cannot be made. Record it again.');
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/webp' }));
    } catch {
      throw new ExportProblem('A picture of the timelapse could not be read, so the video cannot be made. Record it again.');
    }
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, size.width, size.height);
    bmp.close();
    const d = g.getImageData(0, 0, size.width, size.height);
    lastIndex = index;
    last = { width: d.width, height: d.height, pixels: d.data };
    return last;
  };
}

/** The size the pictures of this session were taken at, from the first one. */
async function sessionBox(first: Kept): Promise<{ width: number; height: number }> {
  const bytes = await library.read('timelapse', first.id);
  if (!bytes) throw new ExportProblem('The pictures of the timelapse have gone missing. Record it again.');
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/webp' }));
  const out = { width: bmp.width, height: bmp.height };
  bmp.close();
  return out;
}

export interface TimelapseRequest {
  format: TimelapseFormat;
  /** About this many seconds, or null for every picture once. */
  seconds: number | null;
  signal: AbortSignal;
  onProgress: (p: Progress) => void;
}

/** What a request would make, for the dialog to say before anyone presses Export. */
export function previewTiming(pictures: number, seconds: number | null, format: TimelapseFormat): Timing {
  return timing(pictures, seconds, fpsFor(format));
}

/** Asks where to save, makes the file, writes it, and says so with a Show in folder button. */
export async function exportTimelapse(req: TimelapseRequest): Promise<TimelapseOutcome> {
  const api = desktop();
  if (!api) throw new ExportProblem('Exporting works in the Frameling desktop app.');
  const found = await findKept();
  const pictures = found?.pictures ?? [];
  if (!pictures.length) return 'empty';
  const box = await sessionBox(pictures[0]);
  const size = exportSize(box.width, box.height, req.format);
  const t = timing(pictures.length, req.seconds, fpsFor(req.format));
  const name = recorder.get().docName || store().rootDoc().name || 'Drawing';
  // A drawing of the right size and length stands in for the pictures: the export plan reads it for the size, the frame
  // count, the speed and the file name.
  const doc = newDoc({ name: `${name} timelapse`, width: size.width, height: size.height, fps: t.fps, length: Math.max(2, t.indices.length), background: '#ffffff' });
  const settings = { ...defaultSettings(doc), format: req.format, range: 'all' as const, scale: 1, transparent: false, loop: true };
  const plan = planExport(doc, settings, 0);
  if (plan.problem) throw new ExportProblem(plan.problem);
  const made = exporterOf(req.format);
  if (!made) throw new ExportProblem('That kind of export is turned off. Turn it on in Preferences > Features.');
  const target = await api.files.pickExportFile({ suggestedName: `${plan.name}.${extensionFor(settings)}`, filters: filtersFor(req.format, settings), title: 'Save the timelapse' });
  if (!target) return 'cancelled';
  const prepared = made.prepare ? await made.prepare(plan, settings) : {};
  const load = pictureLoader(pictures, size);
  let result;
  try {
    result = await runExport({
      doc,
      settings,
      currentFrame: 0,
      signal: req.signal,
      onProgress: req.onProgress,
      ...prepared,
      appVersion: api.versions.app,
      frames: { width: size.width, height: size.height, load: (i) => load(t.indices[i]) },
    });
  } catch (e) {
    if (isCancelled(e)) return 'cancelled';
    throw e;
  }
  if (result.kind !== 'file') throw new ExportProblem('The timelapse could not be made into one file.');
  const dest = targetFor(target, result.name);
  const w = await api.files.write(dest, result.bytes);
  if ('error' in w) throw new ExportProblem(w.error);
  notifySaved(`Exported ${displayFile(dest)}.`, 'success', can('showInFolder') ? { label: 'Show in folder', run: () => void api.files.showInFolder(dest) } : undefined, 9000, 'cheer', 'exported');
  // Keep the pictures or clear them: asked once, then remembered (Preferences > Behaviour).
  withChoice<string>('timelapse.afterExport', (v) => void (v === 'clear' && clearPictures()), { gently: true });
  return 'done';
}
