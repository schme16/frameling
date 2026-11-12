// Exporting with a plugin: Frameling draws the frames (exactly as the canvas shows them) and hands them to the plugin,
// which hands back files. Frameling asks where to save and writes them; the plugin never touches the disk.
import { sceneOf } from '../core/symbols';
import { store } from '../core/store';
import { baseName, desktop } from '../io/desktop';
import { notify } from '../io/notify';
import { can } from '../platform';
import { backgroundFor, drawFrame, makeCanvas, readPixels } from '../export/draw';
import { defaultSettings, planExport } from '../export/plan';
import { runtimeOf } from './manager';
import { exportClips, type ExportFrame, type PluginExporterDef } from './runtime';

export interface PluginExportJob {
  pluginId: string;
  pluginName: string;
  def: PluginExporterDef;
}

export interface PluginExportChoice {
  range: 'all' | 'clip' | 'frame';
  clipId: string | null;
  scale: number;
}

export type Progress = { done: number; total: number; label: string };

export async function runPluginExport(job: PluginExportJob, choice: PluginExportChoice, signal: AbortSignal, onProgress: (p: Progress) => void): Promise<'done' | 'cancelled'> {
  const api = desktop();
  if (!api) throw new Error('Exporting needs the Frameling app.');
  const rt = runtimeOf(job.pluginId);
  if (!rt) throw new Error(`"${job.pluginName}" is turned off.`);
  const st = store().get();
  const { doc, frame } = sceneOf(st.doc, st.ui.frame);
  // planExport works out the range and size; 'pngseq' is just an animated format with see-through allowed.
  const settings = { ...defaultSettings(doc), format: 'pngseq' as const, range: choice.range, clipId: choice.clipId, scale: choice.scale, transparent: job.def.transparent };
  const plan = planExport(doc, settings, frame);
  if (plan.problem) throw new Error(plan.problem);

  const target = job.def.multiple
    ? await api.files.pickExportFolder({ title: `Choose a folder for ${job.def.label}`, suggestedName: plan.name })
    : await api.files.pickExportFile({ suggestedName: `${plan.name}.${job.def.extension}`, filters: [{ name: job.def.label, extensions: [job.def.extension] }], title: `Export ${job.def.label}` });
  if (!target) return 'cancelled';

  const crisp = doc.layers.length > 0 && doc.layers.every((l) => l.kind !== 'vector');
  const t = { width: plan.width, height: plan.height, scale: choice.scale, background: backgroundFor(doc, job.def.transparent, true), crisp };
  const canvas = makeCanvas(plan.width, plan.height);
  const frames: ExportFrame[] = [];
  const frameNumbers: number[] = [];
  for (let i = 0; i < plan.count; i++) {
    if (signal.aborted) return 'cancelled';
    onProgress({ done: i, total: plan.count, label: 'Drawing the frames' });
    const img = readPixels(drawFrame(canvas, doc, plan.range.start + i, t));
    frames.push({ width: img.width, height: img.height, data: new Uint8ClampedArray(img.pixels) });
    frameNumbers.push(plan.range.start + i);
    if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
  }
  onProgress({ done: plan.count, total: plan.count, label: `${job.pluginName} is making the files` });
  const info = {
    name: plan.name,
    fps: doc.fps,
    width: plan.width,
    height: plan.height,
    scale: choice.scale,
    frameNumbers,
    clips: exportClips(doc.clips),
    markers: doc.markers.map((m) => ({ name: m.name, frame: m.frame })),
  };
  let files;
  try {
    files = await rt.runExport(job.def.id, frames, info, signal);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    throw e;
  }
  let shown = target;
  if (job.def.multiple) {
    const w = await api.files.writeMany(target, files);
    if (!w) return 'cancelled';
    if ('error' in w) throw new Error(w.error);
    shown = w.paths[0] ?? target;
  } else {
    if (files.length !== 1) throw new Error(`"${job.pluginName}" made ${files.length} files, but this export saves one.`);
    const w = await api.files.write(target, files[0].bytes);
    if ('error' in w) throw new Error(w.error);
  }
  notify(`Exported ${baseName(shown)}.`, 'success', can('showInFolder') ? { label: 'Show in folder', run: () => void api.files.showInFolder(shown) } : undefined, 9000, 'cheer');
  return 'done';
}
