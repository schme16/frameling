// Krita brushes: a .kpp (one preset: a PNG picture with the settings written inside it as text) and a .bundle (a zip of
// presets and the brush pictures they use). Read from the files Krita itself writes (its own default brush bundles, which are
// CC0) and from the options Krita documents, never from Krita's code (that is GPL, and Frameling is MIT). Every inner
// document is read with the careful reader in xml.ts, every unpacking has a ceiling, and a preset that cannot be read well
// is left out with its reason, never guessed at. Pure, no DOM.
import { cleanDab } from '../../dab/maths';
import { cleanCurve, MAX_CURVE_POINTS as ROUTE_CURVE_POINTS } from '../../dab/curve';
import { type DynRoute, type DynSource, type DynTarget, MAX_ROUTES } from '../../dab/dynamics';
import { decodePng, readChunks } from '../../io/png';
import { Reader } from './bytes';
import { readGbr, readGihPipe, pipePicks, readerOf } from './gimp';
import { unzlibCapped } from './inflate';
import { tipFrom, type PixelReader, type Tip } from './tip';
import { BrushProblem, plural, type ImportedBrush, type ImportResult } from './types';
import { child, parseXml, type XNode } from './xml';
import { openZip, type Zip } from './zip';

/** No side of a tip picture is longer than this, and none holds more pixels than this. */
const MAX_SIDE = 8192;
const MAX_PIXELS = 24 * 1024 * 1024;
const MAX_PNG_CHUNKS = 4096;
/** The most one preset's settings may be (the biggest real ones, with a texture inside, are about half a megabyte). */
const MAX_PRESET_BYTES = 16 * 1024 * 1024;
const MAX_TIP_BYTES = 32 * 1024 * 1024;
const MAX_CURVE_POINTS = 64;

// ---------------------------------------------------------------- the settings inside a .kpp

/** The `preset` text of a Krita preset PNG (a text chunk, compressed or not). Walks the chunks without checking the picture. */
export function presetTextOf(png: Uint8Array): string {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.length < 20 || sig.some((b, i) => png[i] !== b)) throw new BrushProblem('That does not look like a Krita brush preset (it should be a PNG picture with the settings inside).');
  const r = new Reader(png, 8, 'Krita brush preset');
  for (let n = 0; n < MAX_PNG_CHUNKS && r.left >= 12; n++) {
    const len = r.u32();
    const type = r.tag();
    if (len > r.left - 4) throw new BrushProblem('That Krita brush preset ends too soon, so it is probably damaged or only partly downloaded.');
    const body = r.take(len);
    r.skip(4);
    if (type === 'IEND') break;
    if (type !== 'tEXt' && type !== 'zTXt' && type !== 'iTXt') continue;
    const z = body.indexOf(0);
    if (z < 0 || String.fromCharCode(...body.subarray(0, Math.min(z, 16))) !== 'preset') continue;
    let text: Uint8Array;
    if (type === 'tEXt') text = body.subarray(z + 1);
    else if (type === 'zTXt') text = unzlibCapped(body.subarray(z + 2), MAX_PRESET_BYTES, 'the brush settings');
    else {
      // iTXt: compression flag, method, language, translated keyword, then the text.
      const compressed = body[z + 1] === 1;
      let p = z + 3;
      for (let k = 0; k < 2; k++) {
        const e = body.indexOf(0, p);
        if (e < 0) throw new BrushProblem('That Krita brush preset has damaged text in it.');
        p = e + 1;
      }
      text = compressed ? unzlibCapped(body.subarray(p), MAX_PRESET_BYTES, 'the brush settings') : body.subarray(p);
    }
    if (text.length > MAX_PRESET_BYTES) throw new BrushProblem('The settings in that Krita file are too big to be real.');
    return new TextDecoder('utf-8', { fatal: false }).decode(text);
  }
  throw new BrushProblem('That picture has no Krita brush settings in it. A .kpp is a PNG with the brush written inside it; this one is only a picture.');
}

/** The settings of a preset, by name. */
class Settings {
  private readonly map = new Map<string, string>();
  readonly root: XNode;
  constructor(xml: string) {
    this.root = parseXml(xml, 'brush settings');
    if (this.root.name !== 'Preset') throw new BrushProblem('That does not look like a Krita brush preset.');
    for (const p of this.root.children) if (p.name === 'param' && p.attrs.name) this.map.set(p.attrs.name, p.text.trim());
  }
  str(k: string): string | undefined {
    return this.map.get(k);
  }
  num(k: string, fallback: number): number {
    const v = parseFloat(this.map.get(k) ?? '');
    return Number.isFinite(v) ? v : fallback;
  }
  /** True when it says true, false when it says false, undefined when it says nothing. */
  bool(k: string): boolean | undefined {
    const v = this.map.get(k);
    return v === 'true' ? true : v === 'false' ? false : undefined;
  }
}

// ---------------------------------------------------------------- the tip pictures

export type TipLookup = (fileName: string) => Uint8Array | null;

/** A PNG tip as pixels, after checking its size and that it does not unpack to more than it says. */
export function decodeTipPng(bytes: Uint8Array): { w: number; h: number; px: Uint8ClampedArray } {
  try {
    const chunks = readChunks(bytes);
    const head = chunks[0]?.type === 'IHDR' ? chunks[0].data : null;
    if (!head || head.length < 13) throw new BrushProblem('A tip picture in that file has no header.');
    const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
    const w = dv.getUint32(0);
    const h = dv.getUint32(4);
    const depth = head[8];
    const ctype = head[9];
    if (w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS) throw new BrushProblem(`A tip picture in that file says it is ${w} by ${h} pixels, which Frameling will not open.`);
    if (head[12] === 1) throw new BrushProblem('A tip picture in that file is an interlaced PNG, which Frameling does not read for tips.');
    const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[ctype];
    if (!channels) throw new BrushProblem('A tip picture in that file is a kind of PNG Frameling does not read.');
    // The picture data may not unpack to more than the header says it should: checked before the picture is decoded for real.
    const raw = (Math.ceil((w * channels * depth) / 8) + 1) * h;
    const idat: Uint8Array[] = [];
    let total = 0;
    for (const c of chunks) if (c.type === 'IDAT') (idat.push(c.data), (total += c.data.length));
    const joined = new Uint8Array(total);
    let p = 0;
    for (const c of idat) (joined.set(c, p), (p += c.length));
    unzlibCapped(joined, raw + 64, 'a tip picture');
    const img = decodePng(bytes);
    return { w: img.width, h: img.height, px: img.pixels };
  } catch (e) {
    if (e instanceof BrushProblem) throw e;
    throw new BrushProblem('A tip picture in that file is damaged, so it can not be read.');
  }
}

interface TipResult {
  tip: Tip;
  changed: string[];
  colour: boolean;
}

/** Krita paints an image tip as a mask when it is grey (dark is paint) and with its own colours when it is not. */
function pngTipOf(bytes: Uint8Array, asMask: boolean): TipResult {
  const { w, h, px } = decodeTipPng(bytes);
  let grey = true;
  for (let i = 0; i < px.length && grey; i += 4) if (px[i] !== px[i + 1] || px[i] !== px[i + 2]) grey = false;
  const mask = grey || asMask;
  const changed: string[] = [];
  const lum = (i: number): number => (px[i] * 77 + px[i + 1] * 151 + px[i + 2] * 28) >> 8;
  const read: PixelReader = mask
    ? (x, y, out) => {
        const i = (y * w + x) * 4;
        out[0] = out[1] = out[2] = 0;
        out[3] = ((255 - lum(i)) * px[i + 3]) / 255;
      }
    : (x, y, out) => {
        const i = (y * w + x) * 4;
        out[0] = px[i];
        out[1] = px[i + 1];
        out[2] = px[i + 2];
        out[3] = px[i + 3];
      };
  try {
    const tip = tipFrom(w, h, read, !mask);
    if (tip.shrunk) changed.push(`Its tip picture was shrunk from ${w} by ${h} to ${tip.stamp.w} by ${tip.stamp.h} pixels, the most a picture tip holds, so fine detail is lost.`);
    return { tip, changed, colour: !mask };
  } catch (e) {
    // A white shape on see-through: Krita's dark-is-paint rule leaves nothing, so the see-through is the shape instead.
    let seeThrough = false;
    for (let i = 3; i < px.length && !seeThrough; i += 4) if (px[i] < 255) seeThrough = true;
    if (!(e instanceof BrushProblem) || !mask || !seeThrough) throw e;
    const alpha: PixelReader = (x, y, out) => {
      out[0] = out[1] = out[2] = 0;
      out[3] = px[(y * w + x) * 4 + 3];
    };
    const tip = tipFrom(w, h, alpha, false);
    changed.push('Its tip picture is light on see-through, so the see-through is used as the shape (Krita would paint dark parts only).');
    if (tip.shrunk) changed.push(`Its tip picture was shrunk from ${w} by ${h} to ${tip.stamp.w} by ${tip.stamp.h} pixels, the most a picture tip holds, so fine detail is lost.`);
    return { tip, changed, colour: false };
  }
}

function gbrTipOf(bytes: Uint8Array, fileName: string): TipResult & { extra: string[] } {
  const changed: string[] = [];
  const extra: string[] = [];
  let g;
  if (/\.gih$/i.test(fileName)) {
    const pipe = readGihPipe(bytes, true);
    g = pipe.first;
    const how = pipePicks(pipe.params);
    extra.push(
      `Its tip is a pipe of ${plural(pipe.count, 'picture')}${pipe.found < pipe.count ? ` (the file holds only ${pipe.found})` : ''}, and Krita switches between them ${how ?? 'by a rule'} as you paint. Frameling's brush has one tip, so only the first picture came across.`,
    );
  } else g = readGbr(new Reader(bytes, 0, 'brush tip'));
  const colour = g.bytes >= 3;
  const tip = tipFrom(g.w, g.h, readerOf(g), colour);
  if (tip.shrunk) changed.push(`Its tip picture was shrunk from ${g.w} by ${g.h} to ${tip.stamp.w} by ${tip.stamp.h} pixels, the most a picture tip holds, so fine detail is lost.`);
  return { tip, changed, colour, extra };
}

// ---------------------------------------------------------------- dynamics

interface Sensor {
  id: string;
  /** Pairs of x, y on the curve, sorted by x. Null when it has none (a straight line). */
  curve: [number, number][] | null;
  node: XNode;
}

function parseCurve(text: string): [number, number][] | null {
  const pts: [number, number][] = [];
  for (const part of text.split(';')) {
    if (pts.length >= MAX_CURVE_POINTS) break;
    const [x, y] = part.split(',').map((s) => parseFloat(s));
    if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  return pts.length >= 2 ? pts : null;
}

function sensorsOf(xml: string | undefined): Sensor[] {
  if (!xml) return [{ id: 'pressure', curve: null, node: { name: '', attrs: {}, children: [], text: '' } }];
  let root: XNode;
  try {
    root = parseXml(xml, 'brush sensor');
  } catch {
    return [];
  }
  const kids = root.attrs.id === 'sensorslist' ? root.children.filter((c) => c.name === 'ChildSensor') : [root];
  return kids.slice(0, 8).map((n) => ({ id: n.attrs.id ?? '', curve: parseCurve(child(n, 'curve')?.text ?? ''), node: n }));
}

const at = (pts: [number, number][], x: number): number => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
};

/**
 * A Krita sensor curve (what the pen does to the setting: input on x, the setting's share on y) as a Frameling route. The
 * ends and the lowest and highest the line reaches give `amount` (`1 - low / high`) and `invert` (when it ends lower than
 * it starts); the bend between is the route's `curve`, held to 0 to 1 across that range, so a jump early in Krita jumps
 * early here. `amount` is 0 when the curve does not move the setting at all. Out of range or odd points are held to 0 to 1.
 * `height` is the highest the line reaches (0 to 1): the route is scaled to its own high point, so the caller scales the base
 * setting by `height` to bring back what the route leaves out (a curve that tops out at half paints at half, not full).
 */
export function routeOf(raw: readonly (readonly [number, number])[]): { amount: number; invert: boolean; curve: [number, number][] | null; points: number; height: number } {
  const clamp = (v: number): number => Math.min(1, Math.max(0, v));
  const pts = raw.map(([x, y]) => [clamp(x), clamp(y)] as [number, number]).sort((a, b) => a[0] - b[0]);
  // Krita's line may start after 0 or stop before 1: the first and last heights hold out to the ends.
  if (pts[0][0] > 0) pts.unshift([0, pts[0][1]]);
  if (pts[pts.length - 1][0] < 1) pts.push([1, pts[pts.length - 1][1]]);
  const y0 = pts[0][1];
  const y1 = pts[pts.length - 1][1];
  const lo = Math.min(...pts.map((q) => q[1]));
  const hi = Math.max(...pts.map((q) => q[1]));
  // A line that sits at nothing is not trusted as "paint nothing"; one that sits level elsewhere still scales the setting.
  if (hi < 0.001) return { amount: 0, invert: false, curve: null, points: 0, height: 1 };
  if (hi - lo < 0.01) return { amount: 0, invert: false, curve: null, points: 0, height: hi };
  const invert = y1 < y0;
  const flat = pts.map(([x, y]) => [x, invert ? (hi - y) / (hi - lo) : (y - lo) / (hi - lo)] as [number, number]);
  // Points that all sit on the diagonal are a straight line however many there are.
  const curve = flat.every(([x, y]) => Math.abs(y - x) < 0.002) ? null : cleanCurve(flat);
  return { amount: Math.min(1, Math.max(0, 1 - lo / hi)), invert, curve: curve ? curve.map((q) => [q[0], q[1]] as [number, number]) : null, points: raw.length, height: hi };
}

/** What each Krita sensor is called in words, and which Frameling input it is nearest. */
const SENSORS: Record<string, { from: DynSource | null; what: string; note?: string }> = {
  pressure: { from: 'pressure', what: 'pen pressure' },
  xtilt: { from: 'tilt', what: 'pen tilt left and right', note: 'tilt left and right came as how far the pen leans in any direction' },
  ytilt: { from: 'tilt', what: 'pen tilt up and down', note: 'tilt up and down came as how far the pen leans in any direction' },
  declination: { from: 'tilt', what: 'how far the pen leans' },
  ascension: { from: null, what: 'the direction the pen leans' },
  speed: { from: 'speed', what: 'drawing speed' },
  drawingangle: { from: 'direction', what: 'the direction you draw' },
  rotation: { from: 'twist', what: 'pen twist' },
  fuzzy: { from: 'random', what: 'chance' },
  fuzzystroke: { from: 'random', what: 'chance' },
  fade: { from: 'fade', what: 'distance along the stroke' },
  distance: { from: null, what: 'distance along the stroke' },
  time: { from: null, what: 'time' },
  perspective: { from: null, what: 'perspective' },
  tangentialpressure: { from: null, what: 'the pen\'s barrel pressure' },
};

/** What an option is, in words, for the notes. */
type Option = { key: string; label: string; to: DynTarget | null; enable: string[] };
const OPTIONS: Option[] = [
  { key: 'Size', label: 'Size', to: 'size', enable: ['PressureSize'] },
  { key: 'Opacity', label: 'Opacity', to: 'flow', enable: ['PressureOpacity', 'OpacityUseCurve'] },
  { key: 'Flow', label: 'Flow', to: 'flow', enable: ['PressureFlow', 'FlowUseCurve'] },
  { key: 'Rotation', label: 'Rotation', to: 'angle', enable: ['PressureRotation'] },
  { key: 'Scatter', label: 'Scatter', to: null, enable: ['PressureScatter'] },
  { key: 'Softness', label: 'Softness', to: null, enable: ['PressureSoftness'] },
  { key: 'Sharpness', label: 'Sharpness', to: null, enable: ['PressureSharpness'] },
  { key: 'Ratio', label: 'Roundness', to: null, enable: ['PressureRatio'] },
  { key: 'Spacing', label: 'Spacing', to: null, enable: ['PressureSpacing'] },
  { key: 'Mirror', label: 'Flip', to: null, enable: ['PressureMirror'] },
  { key: 'Darken', label: 'Darken', to: null, enable: ['PressureDarken'] },
  { key: 'Mix', label: 'Colour mixing', to: null, enable: ['PressureMix'] },
  { key: 'Rate', label: 'Airbrush rate', to: null, enable: ['PressureRate'] },
  { key: 'h', label: 'Hue', to: null, enable: ['Pressureh'] },
  { key: 's', label: 'Saturation', to: null, enable: ['Pressures'] },
  { key: 'v', label: 'Value (lightness)', to: null, enable: ['Pressurev'] },
];

// ---------------------------------------------------------------- one preset

/** A preset that is not brought in, with the plain reason. */
class Skip extends Error {
  constructor(readonly why: string, readonly kind: 'engine' | 'tip' | 'broken' = 'broken') {
    super(why);
  }
}

const ENGINES: Record<string, string> = {
  paintbrush: 'Pixel brush',
  colorsmudge: 'Smudge',
  sketchbrush: 'Sketch',
  spraybrush: 'Spray',
  hairybrush: 'Bristle',
  gridbrush: 'Grid',
  experimentbrush: 'Shape',
  duplicate: 'Clone',
  deformbrush: 'Deform',
  curvebrush: 'Curve',
  hatchingbrush: 'Hatching',
  roundmarker: 'Round marker',
  tangentnormal: 'Tangent normal',
  filter: 'Filter',
  particlebrush: 'Particle',
  mypaintbrush: 'MyPaint',
};

const tidyName = (name: string): string => name.replace(/^[A-Za-z]\)\s*[_ ]*/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

/** One preset's settings as a brush, or a `Skip` saying why not. */
export function brushFromPreset(xml: string, tips: TipLookup | null, fallbackName: string): ImportedBrush {
  const s = new Settings(xml);
  const engine = (s.root.attrs.paintopid || s.str('paintop') || '').slice(0, 40);
  const name = tidyName(s.root.attrs.name || '') || fallbackName;
  if (engine !== 'paintbrush' && engine !== 'colorsmudge') {
    throw new Skip(`${name} uses Krita's ${ENGINES[engine] ? `"${ENGINES[engine]}"` : 'own'} brush engine, which Frameling has no equivalent of.`, 'engine');
  }
  const def = s.str('brush_definition');
  if (!def) throw new Skip(`${name} has no brush tip in it.`);
  const brush = parseXml(def, 'brush tip');
  if (brush.name !== 'Brush') throw new Skip(`${name} has a brush tip Frameling can not read.`);
  const dropped: string[] = [];
  const changed: string[] = [];
  const raw: Record<string, unknown> = { aliased: false };
  const type = brush.attrs.type;
  const spacingRaw = parseFloat(brush.attrs.spacing ?? '');
  raw.spacing = Number.isFinite(spacingRaw) ? spacingRaw : 0.1;
  const angle = parseFloat(brush.attrs.angle ?? '0');
  raw.angle = Number.isFinite(angle) ? ((angle * 180) / Math.PI) % 360 : 0;
  let sizePx = 20;

  if (type === 'auto_brush') {
    const mg = child(brush, 'MaskGenerator');
    if (!mg) throw new Skip(`${name} has a generated tip with no shape in it.`);
    const diameter = parseFloat(mg.attrs.diameter ?? '');
    sizePx = Number.isFinite(diameter) ? diameter : 20;
    raw.tip = mg.attrs.type === 'rect' ? 'square' : 'round';
    const ratio = parseFloat(mg.attrs.ratio ?? '1');
    raw.roundness = Number.isFinite(ratio) ? ratio : 1;
    const h = parseFloat(mg.attrs.hfade ?? '1');
    const v = parseFloat(mg.attrs.vfade ?? '1');
    const id = mg.attrs.id;
    if (id === 'gauss' || id === 'soft') {
      raw.hardness = id === 'gauss' ? 0.2 : 0.25;
      changed.push(`Its ${id === 'gauss' ? 'gaussian' : 'curved'} soft edge came as a soft edge of hardness ${Math.round((raw.hardness as number) * 100)}%: the exact falloff curve is not kept.`);
    } else {
      const hardness = Math.min(1, Math.max(0, ((Number.isFinite(h) ? h : 1) + (Number.isFinite(v) ? v : 1)) / 2));
      raw.hardness = hardness;
      // A hard edge with the anti-aliasing switched off is all-or-nothing pixels.
      raw.aliased = mg.attrs.antialiasEdges === '0' && hardness >= 0.999;
    }
    const spikes = Math.round(parseFloat(mg.attrs.spikes ?? '2'));
    if (Number.isFinite(spikes) && spikes > 2) dropped.push(`Its ${spikes} spikes. It came as a plain ${raw.tip === 'round' ? 'circle' : 'square'}.`);
    const density = parseFloat(brush.attrs.density ?? '1');
    if (Number.isFinite(density) && density < 0.99) dropped.push(`Its density of ${Math.round(density * 100)}% (Krita lays down only that share of the tip's pixels, at random). The tip is solid.`);
    const randomness = parseFloat(brush.attrs.randomness ?? '0');
    if (Number.isFinite(randomness) && randomness > 0.01) dropped.push(`Its randomness of ${Math.round(randomness * 100)}%.`);
  } else if (type === 'png_brush' || type === 'gbr_brush') {
    const file = (brush.attrs.filename ?? '').slice(0, 200);
    const picture = tips && file ? tips(file) : null;
    if (!picture) throw new Skip(`${name} paints with the picture "${file.slice(0, 60)}" from Krita's own brush folder, and the picture is not in this file. A bundle made in Krita's Manage Resources window carries its pictures.`, 'tip');
    let r: TipResult & { extra?: string[] };
    try {
      r = type === 'png_brush' ? pngTipOf(picture, brush.attrs.ColorAsMask === '1') : gbrTipOf(picture, file);
    } catch (e) {
      throw new Skip(`${name}: ${e instanceof BrushProblem ? e.message : 'its tip picture could not be read.'}`, 'broken');
    }
    const scale = parseFloat(brush.attrs.scale ?? '1');
    raw.tip = 'picture';
    raw.picture = r.tip.stamp;
    sizePx = r.tip.size * (Number.isFinite(scale) && scale > 0 ? scale : 1);
    changed.push(...r.changed);
    if (r.extra) dropped.push(...r.extra);
    const adj = ['BrightnessAdjustment', 'ContrastAdjustment'].some((k) => Math.abs(parseFloat(brush.attrs[k] ?? '0')) > 0.5);
    if (adj) dropped.push('Its tip brightness and contrast adjustment: the picture came as it is.');
  } else if (type === 'svg_brush') {
    throw new Skip(`${name} paints with a drawing (an SVG) as its tip, which Frameling can not draw as a tip yet.`, 'tip');
  } else {
    throw new Skip(`${name} has a kind of tip (${(type ?? 'unknown').slice(0, 20)}) Frameling does not read.`);
  }
  raw.size = sizePx;
  if (sizePx > 300) changed.push(`It was wider than a pixel brush can be (${Math.round(sizePx)} pixels), so it came at the widest, 300.`);
  if (brush.attrs.useAutoSpacing === '1') changed.push(`Its spacing is automatic in Krita (it follows the size); it came as ${Math.round((raw.spacing as number) * 100)}%, the spacing it was saved with.`);

  // Flow and opacity as set; Krita's dynamics are applied on top of these.
  const flow = s.num('FlowValue', 1);
  const opacity = s.num('OpacityValue', 1);
  raw.flow = Math.min(1, Math.max(0.05, flow));
  raw.opacity = Math.min(1, Math.max(0.05, opacity));

  // Dynamics: one route per sensor that Frameling has an input for.
  const routes: DynRoute[] = [];
  for (const o of OPTIONS) {
    const on = o.enable.some((k) => s.bool(k) === true);
    if (!on) continue;
    const sensors = sensorsOf(s.str(`${o.key}Sensor`));
    const useCurve = s.bool(`${o.key}UseCurve`) !== false;
    // Krita saves a strength beside the size curve (`SizeValue`). Every real preset we hold has it at 1, so how it combines with
    // the curve is not known and it is not applied; a preset that sets it says so rather than guessing.
    if (o.key === 'Size') {
      const strength = s.num('SizeValue', 1);
      if (Math.abs(strength - 1) > 0.01) dropped.push(`Its size strength (${Math.round(strength * 100)}%). Frameling has not seen how Krita combines it with the size curve, so the brush came at the size it was saved with.`);
    }
    if (o.key === 'Scatter') {
      const amount = s.num('ScatterValue', 0);
      raw.scatter = Math.min(2, Math.max(0, amount));
      const what = sensors.map((x) => SENSORS[x.id]?.what).filter(Boolean)[0];
      if (what && sensors.some((x) => x.curve && Math.abs(at(x.curve, 0) - at(x.curve, 1)) > 0.05)) dropped.push(`Its scatter changing with ${what}. The scatter is the same all the way.`);
      continue;
    }
    if (!o.to) {
      dropped.push(`Its ${o.label.toLowerCase()} dynamics: Frameling has no such setting to drive.`);
      continue;
    }
    for (const sn of sensors) {
      const info = SENSORS[sn.id];
      if (!info) {
        dropped.push(`Its ${o.label.toLowerCase()} control by "${sn.id.slice(0, 20)}": Frameling has no such input.`);
        continue;
      }
      if (o.to === 'angle' && sn.id === 'drawingangle') {
        raw.follow = true;
        continue;
      }
      if (!info.from) {
        dropped.push(`Its ${o.label.toLowerCase()} control by ${info.what}: Frameling has no such input.`);
        continue;
      }
      const shaped = useCurve && sn.curve ? routeOf(sn.curve) : { amount: 1, invert: false, curve: null, points: 0, height: 1 };
      if (shaped.points > ROUTE_CURVE_POINTS) changed.push(`Its ${o.label.toLowerCase()} curve for ${info.what} had ${shaped.points} points; it came as the nearest ${ROUTE_CURVE_POINTS}.`);
      if (info.note) changed.push(`Its ${o.label.toLowerCase()} control by ${info.note}.`);
      const dupe = routes.some((r) => r.from === info.from && r.to === o.to);
      // The route only carries the shape of the curve. Its height (a curve that tops out at half) scales the base setting, as
      // Krita multiplies the setting by what the curve says. Sensors on one option multiply there too, so each one scales it.
      if (!dupe && shaped.height < 0.999 && (o.key === 'Size' || o.key === 'Flow' || o.key === 'Opacity')) {
        if (o.key === 'Size') raw.size = (raw.size as number) * shaped.height;
        else if (o.key === 'Flow') raw.flow = Math.max(0.05, (raw.flow as number) * shaped.height);
        else raw.opacity = Math.max(0.05, (raw.opacity as number) * shaped.height);
        const pct = Math.round(shaped.height * 100);
        const what = o.key === 'Size' ? 'size' : o.label.toLowerCase();
        changed.push(`Its ${what} curve for ${info.what} tops out at ${pct}%, so the brush's ${what} was set to ${pct}% of what it was saved with. Raise the ${what} to bring the full one back.`);
      }
      if (shaped.amount === 0) continue;
      const route: DynRoute = { from: info.from, to: o.to, amount: shaped.amount, invert: shaped.invert };
      if (shaped.curve) route.curve = shaped.curve;
      if (dupe) continue;
      routes.push(route);
      if (o.key === 'Opacity') changed.push('Its opacity dynamics came as flow dynamics (the paint thins per dab instead of per stroke).');
      if (info.from === 'fade') {
        const length = parseFloat(sn.node.attrs.length ?? '1000');
        const px = (Number.isFinite(length) ? length : 1000) * (raw.spacing as number) * sizePx;
        raw.fadeLength = Math.round(px);
      }
    }
  }
  if (routes.length > MAX_ROUTES) routes.length = MAX_ROUTES;
  raw.dynamics = routes;

  if (s.bool('Texture/Pattern/Enabled')) {
    const strength = s.num('Texture/Pattern/Strength', s.num('Texture/Strength/Value', 1));
    const scale = Math.min(8, Math.max(1, Math.round(s.num('Texture/Pattern/Scale', 1))));
    raw.grain = { depth: Math.min(1, Math.max(0, strength)), scale, moving: s.bool('Texture/Pattern/isRandomOffsetX') === true };
    const tn = (s.str('Texture/Pattern/Name') || '').replace(/^.*[/\\]/, '').slice(0, 40);
    changed.push(`Its texture${tn ? ` "${tn}"` : ''} came as your sheet's paper at the same strength. Texture pictures are not kept.`);
  }
  if (s.bool('MaskingBrush/Enabled')) dropped.push('Its masking brush (a second tip the first is painted through).');
  if (s.bool('EraserMode')) dropped.push("It is an eraser in Krita. Frameling's brushes paint; the Eraser tool does the erasing.");
  const op = s.str('CompositeOp');
  if (op && op !== 'normal') dropped.push(`Its blend mode (${op.slice(0, 24)}).`);
  if (s.bool('AirbrushOption/isAirbrushing') || s.bool('PaintOpSettings/isAirbrushing')) dropped.push('Its airbrush mode (the paint keeps building while you hold still).');
  if (engine === 'colorsmudge') dropped.push('Its smudging: Krita carries colour along as it goes; Frameling has the tip and the spacing, and its own wet setting is left as it was.');

  return { name: name.slice(0, 80), dab: cleanDab(raw), dropped, changed };
}

// ---------------------------------------------------------------- the files

const GENERAL_ERROR = 'Frameling could not read that Krita file. It may be damaged.';

export function readKppFile(bytes: Uint8Array, fileName: string): ImportResult {
  const xml = presetTextOf(bytes);
  try {
    const brush = brushFromPreset(xml, null, fileName);
    return { ok: true, format: 'kpp', setName: brush.name, brushes: [brush], notes: [] };
  } catch (e) {
    if (e instanceof Skip) return { ok: false, format: 'kpp', error: e.why };
    throw e;
  }
}

const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

export function readBundleFile(bytes: Uint8Array, fileName: string): ImportResult {
  const zip: Zip = openZip(bytes, 'Krita bundle');
  const presets = zip.items.filter((i) => /^paintoppresets\/[^/]+\.kpp$/i.test(i.name)).slice(0, 4000);
  if (!presets.length) return { ok: false, format: 'bundle', error: 'That Krita bundle has no brush presets in it (it may hold only patterns, palettes or other things).' };
  const tipItems = new Map(zip.items.filter((i) => /^brushes\/[^/]+$/i.test(i.name)).map((i) => [baseName(i.name).toLowerCase(), i]));
  const tipCache = new Map<string, Uint8Array | null>();
  const tips: TipLookup = (name) => {
    const key = baseName(name).toLowerCase();
    const have = tipCache.get(key);
    if (have !== undefined) return have;
    const it = tipItems.get(key);
    let out: Uint8Array | null = null;
    if (it) {
      try {
        out = zip.read(it, MAX_TIP_BYTES);
      } catch (e) {
        if (e instanceof BrushProblem && /far more than/.test(e.message)) throw e;
      }
    }
    tipCache.set(key, out);
    return out;
  };
  const brushes: ImportedBrush[] = [];
  const engines = new Map<string, number>();
  let noTip = 0;
  let broken = 0;
  let firstReason = '';
  for (const it of presets) {
    if (brushes.length >= 1000) break;
    try {
      const png = zip.read(it, MAX_PRESET_BYTES);
      const b = brushFromPreset(presetTextOf(png), tips, baseName(it.name).replace(/\.kpp$/i, ''));
      brushes.push(b);
    } catch (e) {
      if (e instanceof Skip) {
        if (!firstReason) firstReason = e.why;
        if (e.kind === 'engine') {
          const m = /Krita's (?:"([^"]+)"|own) brush engine/.exec(e.why);
          const k = m?.[1] ?? 'other';
          engines.set(k, (engines.get(k) ?? 0) + 1);
        } else if (e.kind === 'tip') noTip++;
        else broken++;
      } else if (e instanceof BrushProblem) {
        // A ceiling (too much unpacked) ends the whole file: it says so.
        if (/far more than/.test(e.message)) throw e;
        if (!firstReason) firstReason = e.message;
        broken++;
      } else throw e;
    }
  }
  const notes: string[] = [];
  const engineTotal = [...engines.values()].reduce((a, b) => a + b, 0);
  if (engineTotal)
    notes.push(`${plural(engineTotal, 'preset')} use${engineTotal === 1 ? 's' : ''} another Krita brush engine (${[...engines.keys()].join(', ')}), which Frameling has no equivalent of, so ${engineTotal === 1 ? 'it was' : 'they were'} left out.`);
  if (noTip) notes.push(`${plural(noTip, 'preset')} paint${noTip === 1 ? 's' : ''} with a tip picture (an SVG drawing, or a file that is not in the bundle) Frameling can not use, so ${noTip === 1 ? 'it was' : 'they were'} left out.`);
  if (broken) notes.push(`${plural(broken, 'preset')} could not be read (damaged or not understood), so ${broken === 1 ? 'it was' : 'they were'} left out.`);
  if (!brushes.length) return { ok: false, format: 'bundle', error: firstReason || GENERAL_ERROR };
  return { ok: true, format: 'bundle', setName: tidyName(fileName) || 'Krita bundle', brushes, notes };
}
