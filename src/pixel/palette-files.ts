// Loading and saving palette files from the app: a file picker for .gpl, .hex, .pal and pictures, and the export
// dialog (or a download, outside the desktop app) for saving.
import type { DocPalette } from '../core/format';
import { hint } from '../canvas/controller';
import { desktop } from '../io/desktop';
import { notify } from '../io/notify';
import { setDocPalette } from './commands';
import { PaletteProblem, paletteFromPixels, parsePaletteFile, writePalette, type PaletteFormat } from './palette-io';
import { docPalette } from './palette';
import { store } from '../core/store';
import { activeDrawing } from '../tools/edit';

const IMAGE = /\.(png|gif|jpe?g|webp|bmp)$/i;

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

async function imagePixels(file: File): Promise<Uint8ClampedArray> {
  const bmp = await createImageBitmap(file);
  // Big photos are shrunk first: a palette doesn't need every pixel, and it keeps this quick.
  const scale = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(bmp, 0, 0, w, h);
  return g.getImageData(0, 0, w, h).data;
}

/** Reads a palette from a file the person picks: a palette file, or the colours of a picture. */
export async function importPalette(): Promise<void> {
  const file = await pickFile('.gpl,.hex,.pal,.txt,image/png,image/gif,image/jpeg,image/webp,image/bmp');
  if (!file) return;
  try {
    let p: DocPalette;
    if (IMAGE.test(file.name) || file.type.startsWith('image/')) p = paletteFromPixels(await imagePixels(file), file.name.replace(/\.[^.]+$/, ''), 32);
    else p = parsePaletteFile(file.name, await file.text());
    setDocPalette(p, 'Load palette');
    notify(`Loaded "${p.name}": ${p.colors.length} colour${p.colors.length === 1 ? '' : 's'}.`, 'success');
  } catch (e) {
    notify(e instanceof PaletteProblem ? e.message : "That file couldn't be read as a palette.", 'warn');
  }
}

/** Makes a palette from the colours on the current frame of the active layer. */
export function paletteFromDrawing(): void {
  const d = activeDrawing();
  if (!d || d.kind !== 'pixel') return hint('Pick a pixel layer with a drawing on this frame first.');
  try {
    const p = paletteFromPixels(d.pixels, `${store().get().doc.name} colours`, 64);
    setDocPalette(p, 'Palette from drawing');
    notify(`Made a palette of ${p.colors.length} colour${p.colors.length === 1 ? '' : 's'} from this drawing.`, 'success');
  } catch (e) {
    notify(e instanceof PaletteProblem ? e.message : 'No colours found.', 'warn');
  }
}

const FORMAT_INFO: Record<PaletteFormat, { ext: string; name: string }> = {
  gpl: { ext: 'gpl', name: 'GIMP palette' },
  hex: { ext: 'hex', name: 'Hex list' },
  pal: { ext: 'pal', name: 'JASC palette' },
};

/** Saves the document palette as a file. */
export async function exportPalette(format: PaletteFormat): Promise<void> {
  const p = docPalette(store().get().doc);
  const text = writePalette(p, format);
  const info = FORMAT_INFO[format];
  const name = `${p.name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'palette'}.${info.ext}`;
  const api = desktop();
  if (api) {
    const path = await api.files.pickExportFile({ suggestedName: name, filters: [{ name: info.name, extensions: [info.ext] }], title: 'Save palette' });
    if (!path) return;
    const r = await api.files.write(path, new TextEncoder().encode(text));
    if ('error' in r) notify(r.error, 'error');
    else notify(`Saved the palette as ${name}.`, 'success');
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
