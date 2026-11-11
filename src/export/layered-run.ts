// The drawing side of the layered exports (PSD, PDF and .ai): pictures of single layers or groups of layers, through
// the same renderer as everything else, handed to the pure writers in psd.ts and pdf.ts.
import type { Doc, Layer } from '../core/format';
import { renderFrame } from '../core/render';
import type { RawImage } from '../io/png';
import { drawFrame, makeCanvas, readPixels, type BackgroundMode } from './draw';
import { layeredPlan, type LayeredItem } from './layered';
import { writePdf } from './pdf';
import { writePsd, type PsdLayer } from './psd';

/** A picture of some layers on their own, at `scale`. `plain` takes the layer's blend and opacity off (PSD keeps them itself). */
export function layersPicture(doc: Doc, frame: number, layers: Layer[], scale: number, plain: boolean, crisp: boolean): RawImage {
  const ids = new Set(layers.map((l) => l.id));
  const only = plain && layers.length === 1 ? [{ ...layers[0], opacity: 1, blend: undefined, clipToBelow: false, mask: undefined, folder: undefined, visible: true }] : null;
  const d: Doc = only ? { ...doc, layers: only as Layer[] } : doc;
  const w = Math.max(1, Math.round(doc.width * scale));
  const h = Math.max(1, Math.round(doc.height * scale));
  const c = makeCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.scale(scale, scale);
  if (crisp) g.imageSmoothingEnabled = false;
  renderFrame(g, d, frame, { background: false, includeHidden: !!only, layerFilter: (l) => ids.has(l.id) });
  return readPixels(c);
}

function maskPixels(img: RawImage, invert: boolean): Uint8Array {
  const out = new Uint8Array(img.width * img.height);
  for (let i = 0; i < out.length; i++) out[i] = invert ? 255 - img.pixels[i * 4 + 3] : img.pixels[i * 4 + 3];
  return out;
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
  const layer = (it: Extract<LayeredItem, { kind: 'layer' }>): PsdLayer => ({
    name: it.mask ? `${it.layer.name} (mask)` : it.layer.name,
    image: layersPicture(doc, frame, [it.layer], scale, true, crisp),
    opacity: it.layer.opacity,
    blend: it.layer.blend ?? 'normal',
    hidden: it.hidden,
    clipping: it.clipping,
  });
  for (const it of layeredPlan(doc, frame)) {
    if (it.kind === 'layer') {
      out.push(layer(it));
      continue;
    }
    out.push({ name: it.folder.name, group: 'end', opacity: 1, blend: 'pass' });
    for (const x of it.layers) if (x.kind === 'layer') out.push(layer(x));
    // Mask layers in a folder become the group's mask: where they have drawing shows ('show') or hides ('hide').
    let mask: Uint8Array | undefined;
    for (const m of it.masks) {
      const a = maskPixels(layersPicture(doc, frame, [m], scale, true, crisp), m.mask === 'hide');
      if (!mask) mask = a;
      else for (let i = 0; i < mask.length; i++) mask[i] = (mask[i] * a[i]) / 255;
    }
    out.push({ name: it.folder.name, group: 'open', opacity: it.folder.opacity, blend: it.passThrough ? 'pass' : (it.folder.blend ?? 'normal'), hidden: !it.folder.visible, mask });
  }
  const merged = drawFrame(makeCanvas(w, h), doc, frame, { width: w, height: h, scale, background, crisp });
  return writePsd(w, h, out, readPixels(merged));
}

/** A PDF (or a PDF-compatible .ai) with a page per frame. */
export function pdfFile(doc: Doc, frames: number[], scale: number, transparent: boolean, crisp: boolean, onPage: (i: number) => void, ai = false): Uint8Array {
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
    onPage,
  });
}
