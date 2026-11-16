// An OpenRaster (.ora) reader: the zip Krita, GIMP and MyPaint write, with a stack.xml that lists the layers (top first)
// and one PNG each. Keeps names, order, opacity, visibility, positions, groups and blend modes. Krita's own .kra is not
// read: it says how to get an .ora out of Krita instead. Pure apart from the PNG decoder.
import { unzipSync } from 'fflate';
import type { BlendMode } from '../../core/format';
import { decodePicture } from '../../pixel/import/picture';
import { elementKids, localName, parseXml, XmlProblem, type XmlEl } from '../svg/xml';
import { LayeredProblem, Leftovers, MAX_CANVAS_PIXELS, MAX_CANVAS_SIDE, namesOf, plural, type LayeredFile, type LayerNode } from './model';

const OPS: Record<string, BlendMode> = {
  'svg:src-over': 'normal',
  'svg:multiply': 'multiply',
  'svg:screen': 'screen',
  'svg:overlay': 'overlay',
  'svg:darken': 'darken',
  'svg:lighten': 'lighten',
  'svg:color-dodge': 'color-dodge',
  'svg:color-burn': 'color-burn',
  'svg:hard-light': 'hard-light',
  'svg:soft-light': 'soft-light',
  'svg:difference': 'difference',
  'svg:exclusion': 'exclusion',
  'svg:hue': 'hue',
  'svg:saturation': 'saturation',
  'svg:color': 'color',
  'svg:luminosity': 'luminosity',
  'svg:plus': 'linear-dodge',
};

const MAX_ENTRY_BYTES = 400 * 1024 * 1024;

export const isZip = (b: Uint8Array): boolean => b.length > 30 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) && (b[3] === 4 || b[3] === 6);

const num = (v: string | undefined, fallback: number): number => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : fallback;
};

/** Reads an .ora. Throws LayeredProblem in plain words when it can't. */
export async function readOra(bytes: Uint8Array): Promise<LayeredFile> {
  if (!isZip(bytes)) throw new LayeredProblem("That file isn't an OpenRaster (.ora) file: an .ora is a zip, and this isn't one.");
  const names: string[] = [];
  let all: Record<string, Uint8Array>;
  try {
    all = unzipSync(bytes, {
      filter: (f) => {
        names.push(f.name);
        return f.originalSize <= MAX_ENTRY_BYTES && (f.name === 'stack.xml' || f.name === 'mimetype' || /\.png$/i.test(f.name));
      },
    });
  } catch {
    throw new LayeredProblem("Frameling couldn't open that file as an OpenRaster zip. It may be damaged or locked with a password.");
  }
  if (!all['stack.xml']) {
    if (names.includes('maindoc.xml')) {
      throw new LayeredProblem("That is a Krita file (.kra), which Frameling can't read yet. In Krita choose File > Export, save it as OpenRaster (.ora) or Photoshop (.psd), and bring that in: the layers come across.");
    }
    throw new LayeredProblem("That zip has no stack.xml, so it isn't an OpenRaster file.");
  }
  let root: XmlEl;
  try {
    root = parseXml(new TextDecoder('utf-8').decode(all['stack.xml']));
  } catch (e) {
    throw new LayeredProblem(`The layer list in that file can't be read: ${e instanceof XmlProblem ? e.message.charAt(0).toLowerCase() + e.message.slice(1) : 'it is damaged.'}`);
  }
  if (localName(root) !== 'image') throw new LayeredProblem("The layer list in that file isn't an OpenRaster one.");
  const width = Math.round(num(root.attrs.w, 0));
  const height = Math.round(num(root.attrs.h, 0));
  if (width < 1 || height < 1) throw new LayeredProblem('That file does not say how big the picture is: it is damaged.');
  if (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE || width * height > MAX_CANVAS_PIXELS) throw new LayeredProblem(`That picture is ${width} x ${height}, which is bigger than Frameling can hold. Make it smaller first.`);

  const left = new Leftovers();
  const info: string[] = [];
  const stackEl = elementKids(root).find((k) => localName(k) === 'stack');
  if (!stackEl) throw new LayeredProblem('That file has no layers in its list.');

  const blendOf = (op: string | undefined, name: string): BlendMode => {
    if (!op) return 'normal';
    const b = OPS[op];
    if (b) return b;
    left.add(`blend:${op}`, (n, names) => `${plural(n, 'layer')} (${namesOf(names, n)}) used the blend mode "${op.replace(/^[a-z]+:/, '')}", which Frameling doesn't have: they came in as normal.`, name);
    return 'normal';
  };

  const walk = async (el: XmlEl): Promise<LayerNode[]> => {
    // The file lists the top layer first; the nodes go bottom first.
    const out: LayerNode[] = [];
    for (const k of elementKids(el).reverse()) {
      const ln = localName(k);
      const name = k.attrs.name ?? (ln === 'stack' ? 'Group' : 'Layer');
      const hidden = k.attrs.visibility === 'hidden';
      const opacity = Math.max(0, Math.min(1, num(k.attrs.opacity, 1)));
      const blend = blendOf(k.attrs['composite-op'], name);
      if (ln === 'stack') {
        out.push({ type: 'group', name, hidden, opacity, blend, children: await walk(k) });
      } else if (ln === 'layer') {
        const src = k.attrs.src;
        const data = src ? all[src.replace(/^\.?\//, '')] : undefined;
        if (!data) {
          left.add('missing', (n, names) => `${plural(n, 'layer')} (${namesOf(names, n)}) whose picture isn't in the file.`, name);
          continue;
        }
        try {
          const pic = await decodePicture(data);
          out.push({ type: 'layer', name, hidden, locked: k.attrs['edit-locked'] === 'true' || undefined, opacity, blend, clip: false, x: Math.round(num(k.attrs.x, 0)), y: Math.round(num(k.attrs.y, 0)), width: pic.width, height: pic.height, pixels: pic.frames[0].pixels });
        } catch {
          left.add('unreadable', (n, names) => `${plural(n, 'layer')} (${namesOf(names, n)}) whose picture can't be read.`, name);
        }
      }
    }
    return out;
  };
  const nodes = await walk(stackEl);
  if (!nodes.length) throw new LayeredProblem('That file has no layers that Frameling can read.');
  return { format: 'ora', width, height, nodes, left: left.sentences(), info };
}
