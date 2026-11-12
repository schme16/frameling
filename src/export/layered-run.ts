// The drawing side of the layered exports (PSD, PDF and .ai): pictures of single layers or groups of layers, through
// the same renderer as everything else, handed to the pure writers in psd.ts and pdf.ts.
import type { Doc, Layer, LayerFolder } from '../core/format';
import { renderFrame } from '../core/render';
import type { RawImage } from '../io/png';
import { drawFrame, makeCanvas, readPixels, type BackgroundMode } from './draw';
import { bakedFolderDoc, layeredPlan, soloDoc } from './layered';
import { psdRecords } from './psd-layers';
import { writePdf } from './pdf';
import { writePsd, type PsdLayer } from './psd';

/** A picture of some layers on their own, at `scale`. `plain` takes the layer's blend and opacity off (PSD keeps them itself). */
export function layersPicture(doc: Doc, frame: number, layers: Layer[], scale: number, plain: boolean, crisp: boolean): RawImage {
  const ids = new Set(layers.map((l) => l.id));
  // The camera layer stays, so a picture sees what the camera sees, like the merged frame does.
  const d: Doc = plain && layers.length === 1 ? soloDoc(doc, layers[0]) : doc;
  return drawPicture(d, frame, scale, crisp, plain && layers.length === 1, (l) => ids.has(l.id));
}

function drawPicture(doc: Doc, frame: number, scale: number, crisp: boolean, includeHidden: boolean, layerFilter: (l: Layer) => boolean): RawImage {
  const w = Math.max(1, Math.round(doc.width * scale));
  const h = Math.max(1, Math.round(doc.height * scale));
  const c = makeCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.scale(scale, scale);
  if (crisp) g.imageSmoothingEnabled = false;
  renderFrame(g, doc, frame, { background: false, includeHidden, layerFilter });
  return readPixels(c);
}

/** A folder's layers drawn together with its effects (not its opacity or blend), for a PSD group. */
export function bakedFolderPicture(doc: Doc, frame: number, folder: LayerFolder, members: Layer[], scale: number, crisp: boolean): RawImage {
  const ids = new Set(members.map((l) => l.id));
  return drawPicture(bakedFolderDoc(doc, folder.id), frame, scale, crisp, false, (l) => ids.has(l.id));
}

/** A layered PSD of one frame: a PSD layer per layer, folders as groups, the merged picture on top. */
export function psdFile(doc: Doc, frame: number, scale: number, background: BackgroundMode, crisp: boolean): Uint8Array {
  const w = Math.max(1, Math.round(doc.width * scale));
  const h = Math.max(1, Math.round(doc.height * scale));
  const out: PsdLayer[] = [];
  if (background !== 'none') {
    const bg = makeCanvas(w, h);
    const g = bg.getContext('2d', { willReadFrequently: true })!;
    g.fillStyle = background === 'doc' && doc.background ? doc.background : '#ffffff';
    g.fillRect(0, 0, w, h);
    out.push({ name: 'Background', image: readPixels(bg), opacity: 1, blend: 'normal' });
  }
  out.push(
    ...psdRecords(layeredPlan(doc, frame), {
      layer: (l) => layersPicture(doc, frame, [l], scale, true, crisp),
      folder: (f, members) => bakedFolderPicture(doc, frame, f, members, scale, crisp),
    }),
  );
  const merged = drawFrame(makeCanvas(w, h), doc, frame, { width: w, height: h, scale, background, crisp });
  return writePsd(w, h, out, readPixels(merged));
}

/** A PDF (or a PDF-compatible .ai) with a page per frame. */
export function pdfFile(doc: Doc, frames: number[], scale: number, transparent: boolean, crisp: boolean, onPage: (i: number) => void, ai = false, native = false): Uint8Array {
  // Pictures of flattened layers are drawn at twice the page size (at least the stage size), so they print sharp.
  const pictureScale = Math.min(4, Math.max(1, scale * 2), 8192 / Math.max(doc.width, doc.height));
  return writePdf(doc, {
    frames,
    scale,
    background: transparent ? null : (doc.background ?? '#ffffff'),
    title: doc.name || 'Untitled',
    creator: ai ? 'Frameling (PDF compatible Illustrator file)' : 'Frameling',
    picture: (frame, layers, own) => layersPicture(doc, frame, layers, pictureScale, own, crisp),
    pictureScale,
    crisp,
    onPage,
    native,
  });
}
