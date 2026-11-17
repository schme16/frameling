// Photoshop brush sets (.abr). Adobe has never published this format as a whole, so this is read from what is public:
// Adobe's Photoshop 6 file format notes for the old version 1 and 2 records, the "descriptor" section of Adobe's current
// file format notes for the modern version 6 and later, AbrKit's interoperability notes (MIT, docs/ABR.md in
// github.com/focale-editor/abrkit) for how the two fit together, and real files exported from Photoshop (see
// test/fixtures/brushes/abr/NOTICE.txt). No GPL loader code was read or copied. Pure, no DOM.
import { cleanDab } from '../../dab/maths';
import { type DynRoute, type DynSource, FADE_RANGE } from '../../dab/dynamics';
import { Reader, textOf } from './bytes';
import { getBool, getEnum, getList, getNum, getObj, getStr, isObject, readDescriptor, type DescObject } from './descriptor';
import { tipFrom, type Tip } from './tip';
import { BrushProblem, MAX_BRUSHES_PER_FILE, plural, type ImportedBrush, type ImportResult } from './types';

/** No sampled tip is wider or taller than this, whatever the file says. */
const MAX_SIDE = 8192;
/** All the pixels of one tip together (a tip bigger than this is refused before anything is allocated). */
const MAX_PIXELS = 24 * 1024 * 1024;

interface Sample {
  w: number;
  h: number;
  /** 0 to 255 paint, row by row. */
  alpha: Uint8Array;
}

// ---------------------------------------------------------------- the picture of a sampled tip

/** Rows packed with PackBits: a count of bytes per row first, then each row. */
function unpackRow(src: Uint8Array, want: number): Uint8Array {
  const out = new Uint8Array(want);
  let i = 0;
  let o = 0;
  while (o < want && i < src.length) {
    const n = (src[i++] << 24) >> 24;
    if (n >= 0) {
      const len = n + 1;
      if (i + len > src.length || o + len > want) throw new BrushProblem('A tip in that Photoshop brush file is packed wrongly, so it is probably damaged.');
      out.set(src.subarray(i, i + len), o);
      i += len;
      o += len;
    } else if (n !== -128) {
      const len = 1 - n;
      if (i >= src.length || o + len > want) throw new BrushProblem('A tip in that Photoshop brush file is packed wrongly, so it is probably damaged.');
      out.fill(src[i++], o, o + len);
      o += len;
    }
  }
  if (o < want) throw new BrushProblem('A tip in that Photoshop brush file ends too soon, so it is probably damaged.');
  return out;
}

/** The pixels of a sampled tip: `depth` 1, 8 or 16 bits, raw (0) or packed (1). Higher is more paint. */
function readTipPixels(r: Reader, w: number, h: number, depth: number, compression: number): Sample {
  if (w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS) throw new BrushProblem(`A tip in that Photoshop brush file says it is ${w} by ${h} pixels, which Frameling will not open.`);
  if (depth !== 1 && depth !== 8 && depth !== 16) throw new BrushProblem(`A tip in that Photoshop brush file uses ${depth}-bit pixels, which Frameling does not read.`);
  if (compression !== 0 && compression !== 1) throw new BrushProblem('A tip in that Photoshop brush file is compressed in a way Frameling does not read.');
  const rowBytes = depth === 1 ? Math.ceil(w / 8) : (depth / 8) * w;
  const alpha = new Uint8Array(w * h);
  let counts: number[] | null = null;
  if (compression === 1) {
    counts = [];
    for (let y = 0; y < h; y++) counts.push(r.u16());
  }
  for (let y = 0; y < h; y++) {
    const row = counts ? unpackRow(r.take(counts[y]), rowBytes) : r.take(rowBytes);
    const o = y * w;
    if (depth === 8) alpha.set(row.subarray(0, w), o);
    else if (depth === 16) for (let x = 0; x < w; x++) alpha[o + x] = row[x * 2];
    else for (let x = 0; x < w; x++) alpha[o + x] = (row[x >> 3] >> (7 - (x & 7))) & 1 ? 255 : 0;
  }
  return { w, h, alpha };
}

const lazySamples = (section: Uint8Array, subversion: number): Map<string, () => Sample> => {
  const out = new Map<string, () => Sample>();
  const r = new Reader(section, 0, 'Photoshop brush set');
  // Each entry: a length, then (an id as a short string, a block of settings, the bounds, the depth, how it's packed, the pixels), then padding to four bytes.
  while (r.left >= 4 && out.size < MAX_BRUSHES_PER_FILE * 2) {
    const len = r.u32();
    if (len > r.left) break;
    const entry = r.take(len);
    r.skip(Math.min((4 - (len % 4)) % 4, r.left));
    try {
      const e = new Reader(entry, 0, 'Photoshop brush tip');
      const id = textOf(e.take(e.u8()));
      e.skip(subversion === 1 ? 10 : 264);
      const top = e.i32();
      const left = e.i32();
      const bottom = e.i32();
      const right = e.i32();
      const depth = e.u16();
      const compression = e.u8();
      const at = e.pos;
      out.set(id, () => readTipPixels(new Reader(entry, at, 'Photoshop brush tip'), right - left, bottom - top, depth, compression));
    } catch {
      // A tip with a damaged header is left out; the brush that wanted it says so.
    }
  }
  return out;
};

// ---------------------------------------------------------------- tips, kept once per picture

class Tips {
  private cache = new Map<string, { tip: Tip; w: number; h: number } | Error>();
  constructor(private samples: Map<string, () => Sample>) {}
  get(id: string, flipX: boolean, flipY: boolean): { tip: Tip; w: number; h: number } {
    const key = `${id}|${flipX ? 1 : 0}${flipY ? 1 : 0}`;
    let hit = this.cache.get(key);
    if (!hit) {
      const make = this.samples.get(id);
      if (!make) hit = new BrushProblem('Its tip picture is not in the file.');
      else {
        try {
          const s = make();
          const read = (x: number, y: number, out: number[]): void => {
            const sx = flipX ? s.w - 1 - x : x;
            const sy = flipY ? s.h - 1 - y : y;
            out[0] = out[1] = out[2] = 0;
            out[3] = s.alpha[sy * s.w + sx];
          };
          hit = { tip: tipFrom(s.w, s.h, read, false), w: s.w, h: s.h };
        } catch (e) {
          hit = e instanceof Error ? e : new BrushProblem('Its tip picture could not be read.');
        }
      }
      this.cache.set(key, hit);
    }
    if (hit instanceof Error) throw hit;
    return hit;
  }
}

// ---------------------------------------------------------------- the settings of one preset

const pct = (n: number | undefined, fallback = 0): number => (n === undefined ? fallback : n) / 100;
const patternName = (o: DescObject | undefined): string => {
  const n = getStr(getObj(o, 'Txtr'), 'Nm  ') ?? '';
  const i = n.lastIndexOf('=');
  return (i >= 0 ? n.slice(i + 1) : n).slice(0, 40);
};

/** What a "Control" menu entry (the number in bVTy) drives, as a Frameling source, or a plain word for what has none. */
function controlOf(code: number | undefined): { from: DynSource | null; what: string } {
  switch (code) {
    case 1:
      return { from: 'fade', what: 'fade' };
    case 2:
      return { from: 'pressure', what: 'pen pressure' };
    case 3:
      return { from: 'tilt', what: 'pen tilt' };
    case 4:
      return { from: null, what: 'stylus wheel' };
    case 5:
      return { from: 'direction', what: 'initial direction' };
    case 6:
      return { from: 'direction', what: 'direction' };
    case 7:
      return { from: 'twist', what: 'initial pen rotation' };
    case 8:
      return { from: 'twist', what: 'pen rotation' };
    default:
      return { from: null, what: '' };
  }
}

/** Photoshop's blend mode codes (four letters, or a word in newer files), as words. Only the ones a brush file is likely to use. */
const BLEND: Record<string, string> = {
  Mltp: 'multiply', multiply: 'multiply', CBrn: 'colour burn', colorBurn: 'colour burn', Drkn: 'darken', darken: 'darken', Sbtr: 'subtract', subtract: 'subtract',
  Nrml: 'normal', normal: 'normal', Ovrl: 'overlay', overlay: 'overlay', LghC: 'lighten', lighten: 'lighten', Lghn: 'lighten', linearBurn: 'linear burn', LnBr: 'linear burn', hardMix: 'hard mix', HrdM: 'hard mix', linearHeight: 'linear height',
};

interface Build {
  dab: Record<string, unknown>;
  routes: DynRoute[];
  dropped: string[];
  changed: string[];
}

/** One Photoshop dynamics group (a Control menu, a Jitter and a Minimum) as routes onto `to`. Returns its jitter, 0 to 1. */
function dynamics(b: Build, group: DescObject | undefined, to: DynRoute['to'], label: string, spacingPx: number, minimum: number | undefined): number {
  if (!group) return 0;
  const jitter = Math.min(1, Math.max(0, pct(getNum(group, 'jitter'))));
  const code = getNum(group, 'bVTy');
  if (code) {
    const c = controlOf(code);
    if (!c.from) b.dropped.push(`${label} control by ${c.what || `a pen setting (number ${Math.round(code)})`}: Frameling has no such input.`);
    else {
      const min = Math.min(1, Math.max(0, pct(minimum ?? getNum(group, 'Mnm '))));
      // Opacity and flow often both say "pen pressure": counting it twice would square it.
      if (!b.routes.some((x) => x.from === c.from && x.to === to)) b.routes.push({ from: c.from, to, amount: 1 - min, invert: false });
      if (c.from === 'fade') {
        const steps = getNum(group, 'fStp') ?? 25;
        b.dab.fadeLength = Math.round(steps * spacingPx);
      }
      if (code === 5 || code === 7) b.changed.push(`${label} control by ${c.what} came as ${c.what.replace('initial ', '')}, which follows the pen all through the stroke.`);
    }
  }
  return jitter;
}

function mapPreset(preset: DescObject, tips: Tips, index: number): ImportedBrush {
  const b: Build = { dab: { aliased: false }, routes: [], dropped: [], changed: [] };
  const name = getStr(preset, 'Nm  ') || `Brush ${index + 1}`;
  const shape = getObj(preset, 'Brsh');
  if (!shape) throw new BrushProblem('It has no tip.');
  const diameter = getNum(shape, 'Dmtr') ?? 20;
  const spacingOn = getBool(shape, 'Intr') !== false;
  const spacing = spacingOn ? pct(getNum(shape, 'Spcn'), 25) : 0.25;
  b.dab.spacing = spacing;
  if (!spacingOn) b.changed.push('Its spacing was set to follow the stroke automatically; it came at 25%.');
  b.dab.roundness = pct(getNum(shape, 'Rndn'), 100);
  // Photoshop's angle turns counter-clockwise on screen (checked in Photoshop 2026), Frameling's clockwise.
  b.dab.angle = -(getNum(shape, 'Angl') ?? 0);
  let size = diameter;
  if (shape.type === 'computedBrush') {
    b.dab.tip = 'round';
    b.dab.hardness = pct(getNum(shape, 'Hrdn'), 100);
  } else if (shape.type === 'sampledBrush') {
    const id = getStr(shape, 'sampledData');
    const t = tips.get(id ?? '', getBool(shape, 'flipX') === true, getBool(shape, 'flipY') === true);
    b.dab.tip = 'picture';
    b.dab.picture = t.tip.stamp;
    // Photoshop's diameter is across the whole picture, empty margin and all; the stamp has its margin trimmed.
    size = diameter * (t.tip.size / Math.max(t.w, t.h));
    if (t.tip.shrunk) b.changed.push(`Its tip picture was shrunk from ${t.w} by ${t.h} to ${t.tip.stamp.w} by ${t.tip.stamp.h} pixels, the most a picture tip holds, so fine detail is lost.`);
  } else if (shape.type === 'dBrush') {
    b.dab.tip = 'round';
    b.dab.hardness = 1;
    b.dropped.push('Its bristle tip (a brush with real bristles). It came as a plain round tip.');
  } else if (shape.type === 'dTips') {
    b.dab.tip = 'round';
    b.dab.hardness = 0.5;
    b.dropped.push('Its erodible or airbrush tip (it wears down as you paint). It came as a soft round tip.');
  } else {
    throw new BrushProblem(`Its tip is a kind Frameling does not know ("${shape.type.slice(0, 20)}").`);
  }
  b.dab.size = size;
  const px = Math.max(1, size) * spacing;

  if (getBool(preset, 'useTipDynamics')) {
    const jitter = dynamics(b, getObj(preset, 'szVr'), 'size', 'Size', px, getNum(preset, 'minimumDiameter'));
    if (jitter > 0) b.dab.sizeJitter = jitter;
    const aj = getObj(preset, 'angleDynamics');
    const angleJitter = Math.min(1, Math.max(0, pct(getNum(aj, 'jitter'))));
    if (angleJitter > 0) b.dab.angleJitter = angleJitter;
    const ac = controlOf(getNum(aj, 'bVTy'));
    if (getNum(aj, 'bVTy')) {
      if (ac.from === 'direction') {
        b.dab.follow = true;
        if (getNum(aj, 'bVTy') === 5) b.changed.push('Angle control by initial direction came as turning with the line all through the stroke.');
      } else dynamics(b, aj, 'angle', 'Angle', px, undefined);
    }
    const rd = getObj(preset, 'roundnessDynamics');
    if (pct(getNum(rd, 'jitter')) > 0 || getNum(rd, 'bVTy')) b.dropped.push('Its roundness jitter and roundness control. The tip keeps one roundness.');
    const flips = getBool(preset, 'flipX') || getBool(preset, 'flipY');
    if (flips) b.dropped.push('Its Flip X and Flip Y jitter. The tip is not flipped at random.');
  }
  if (getBool(preset, 'useScatter')) {
    const sd = getObj(preset, 'scatterDynamics');
    const j = pct(getNum(sd, 'jitter'));
    if (j > 0) b.dab.scatter = j;
    if (j > 2) b.changed.push(`Its scatter of ${Math.round(j * 100)}% was held to 200%.`);
    if (getNum(sd, 'bVTy')) b.dropped.push('Its scatter control by a pen setting. The scatter is the same all the way.');
    const count = getNum(preset, 'Cnt ') ?? 1;
    if (count > 1) b.dropped.push(`Its count of ${Math.round(count)} (several dabs at each spot). It paints one.`);
    if (pct(getNum(getObj(preset, 'countDynamics'), 'jitter')) > 0 || getNum(getObj(preset, 'countDynamics'), 'bVTy')) b.dropped.push('Its count jitter.');
  }
  if (getBool(preset, 'usePaintDynamics')) {
    // Opacity and flow dynamics both thin the paint of one dab: here that is flow.
    for (const [key, label] of [['opVr', 'Opacity'], ['prVr', 'Flow']] as const) {
      const g = getObj(preset, key);
      const j = dynamics(b, g, 'flow', label, px, undefined);
      if (j > 0) b.routes.push({ from: 'random', to: 'flow', amount: j, invert: false });
      if (key === 'opVr' && (j > 0 || getNum(g, 'bVTy'))) b.changed.push('Its opacity dynamics came as flow dynamics (the paint thins per dab instead of per stroke).');
    }
    const mx = getObj(preset, 'mxVr');
    const mj = dynamics(b, mx, 'mix', 'Mix', px, undefined);
    if (mj > 0) b.routes.push({ from: 'random', to: 'mix', amount: mj, invert: false });
    const wt = getObj(preset, 'wtVr');
    if (pct(getNum(wt, 'jitter')) > 0 || getNum(wt, 'bVTy')) b.dropped.push('Its wetness jitter and control.');
  }
  if (getBool(preset, 'useTexture')) {
    const depth = pct(getNum(preset, 'textureDepth'), 100);
    const scale = Math.min(8, Math.max(1, Math.round(pct(getNum(preset, 'textureScale'), 100) * 2)));
    b.dab.grain = { depth, scale, moving: getBool(preset, 'TxtC') === true };
    const n = patternName(preset);
    b.changed.push(`Its texture${n ? ` "${n}"` : ''} came as your sheet's paper at the same depth. Texture pictures are not kept.`);
  }
  if (getBool(getObj(preset, 'dualBrush'), 'useDualBrush')) {
    const d = getObj(preset, 'dualBrush');
    const dtip = getObj(d, 'Brsh');
    const count = getNum(d, 'Cnt ') ?? 1;
    const code = getEnum(d, 'BlnM') ?? 'Mltp';
    const burn = BLEND[code] ?? 'its';
    if (dtip?.type !== 'sampledBrush') {
      // A plain round second tip stamped along the line is nearly the line again: a field of dots would make something up.
      b.dropped.push(`Its dual brush (a plain round second tip with a ${burn} blend). Frameling's dual brush is a field of dots, which would look nothing like it.`);
    } else {
      // A textured second tip: dots no bigger than a quarter of the brush, so the paint keeps its shape and gets the texture.
      const dSize = Math.min(64, Math.max(1, Math.round(Math.min(getNum(dtip, 'Dmtr') ?? 6, Math.max(1, size / 4)))));
      b.dab.dual = { tip: 'round', size: dSize, density: Math.min(1, 0.6 + 0.1 * (count - 1)), cut: code === 'Sbtr' || code === 'subtract' };
      b.dropped.push(`Its dual brush's own tip picture, spacing, scatter and ${burn} blend.`);
      b.changed.push(`Its dual brush came as a field of round dots about ${dSize} pixels wide, which lets the paint through in a similar texture.`);
    }
  }
  if (getBool(preset, 'useColorDynamics')) b.dropped.push('Its colour dynamics (foreground and background, hue, saturation and brightness jitter). The brush paints in one colour.');
  if (getBool(preset, 'Wtdg')) b.dropped.push('Its wet edges.');
  if (getBool(preset, 'Nose')) b.dropped.push('Its noise.');
  if (getBool(preset, 'Rpt ')) b.dropped.push('Its build-up (it keeps painting while held still). Frameling paints only as you move.');
  if (getBool(preset, 'useBrushPose')) b.dropped.push('Its brush pose (tilt and pressure that change where the tip points).');
  if (getBool(getObj(preset, 'brushGroup'), 'useBrushGroup')) b.dropped.push('Its brush group (a brush made of several tips).');
  const tool = getObj(preset, 'toolOptions');
  if (tool && getBool(tool, 'brushPreset')) {
    const flow = getNum(tool, 'flow');
    const opacity = getNum(tool, 'Opct');
    if (flow !== undefined) b.dab.flow = flow / 100;
    if (opacity !== undefined) b.dab.opacity = opacity / 100;
    const sm = getNum(tool, 'smoothingValue');
    if (getBool(tool, 'smoothing') && sm && sm > 0) b.dropped.push(`Its smoothing of ${Math.round(sm)}%. Frameling's own smoothing is in the Pen settings.`);
  }
  b.dab.dynamics = b.routes;
  const dab = cleanDab(b.dab);
  if (dab.size !== Math.round(size) && size > 300) b.changed.push('It was wider than a pixel brush can be, so it came at the widest, 300 pixels.');
  if (typeof b.dab.fadeLength === 'number' && (b.dab.fadeLength < FADE_RANGE.min || b.dab.fadeLength > FADE_RANGE.max)) b.changed.push(`Its fade length was held to ${dab.fadeLength} pixels.`);
  return { name, dab, dropped: b.dropped, changed: b.changed };
}

// ---------------------------------------------------------------- legacy (version 1 and 2)

function readLegacy(r: Reader, version: number, fileName: string): ImportResult {
  const count = r.u16();
  const brushes: ImportedBrush[] = [];
  const notes: string[] = [];
  let skipped = 0;
  for (let i = 0; i < count && brushes.length < MAX_BRUSHES_PER_FILE; i++) {
    const type = r.u16();
    const len = r.u32();
    const body = new Reader(r.take(len), 0, 'Photoshop brush');
    try {
      if (type === 1) {
        // Computed: a round brush from numbers.
        body.skip(4);
        const spacing = body.u16();
        const diameter = body.u16();
        const roundness = body.u16();
        const angle = body.i16();
        const hardness = body.u16();
        const dab = cleanDab({ tip: 'round', size: diameter, hardness: hardness / 100, roundness: roundness / 100, angle: -angle, spacing: spacing / 100, aliased: false });
        brushes.push({ name: `Round ${diameter}`, dab, dropped: [], changed: [] });
      } else if (type === 2) {
        body.skip(4);
        const spacing = body.u16();
        let name = '';
        if (version === 2) {
          const n = body.u32();
          if (n * 2 > body.left) throw new BrushProblem('A name runs off the end.');
          for (let k = 0; k < n; k++) name += String.fromCharCode(body.u16());
          name = textOf(new TextEncoder().encode(name));
        }
        body.skip(1);
        body.skip(8);
        const top = body.i32();
        const left = body.i32();
        const bottom = body.i32();
        const right = body.i32();
        const depth = body.u16();
        const compression = body.u8();
        const s = readTipPixels(body, right - left, bottom - top, depth, compression);
        const tip = tipFrom(s.w, s.h, (x, y, out) => ((out[0] = out[1] = out[2] = 0), (out[3] = s.alpha[y * s.w + x])), false);
        const changed: string[] = [];
        if (tip.shrunk) changed.push(`Its tip picture was shrunk from ${s.w} by ${s.h} to ${tip.stamp.w} by ${tip.stamp.h} pixels, the most a picture tip holds, so fine detail is lost.`);
        const dab = cleanDab({ tip: 'picture', picture: tip.stamp, size: tip.size, spacing: spacing / 100, aliased: false });
        brushes.push({ name: name || `Brush ${i + 1}`, dab, dropped: [], changed });
      } else skipped++;
    } catch (e) {
      if (e instanceof BrushProblem) skipped++;
      else throw e;
    }
  }
  if (skipped) notes.push(`${plural(skipped, 'brush', 'brushes')} in the set could not be read and ${skipped === 1 ? 'was' : 'were'} left out.`);
  if (!brushes.length) throw new BrushProblem('There is no brush in that Photoshop file Frameling can read.');
  return { ok: true, format: 'abr', setName: fileName, brushes, notes };
}

// ---------------------------------------------------------------- modern (version 6 and later)

export function readAbrFile(bytes: Uint8Array, fileName: string): ImportResult {
  const r = new Reader(bytes, 0, 'Photoshop brush set');
  const version = r.u16();
  if (version === 1 || version === 2) return readLegacy(r, version, fileName);
  if (![6, 7, 9, 10].includes(version)) throw new BrushProblem(`That Photoshop brush set is version ${version}, which Frameling does not know how to read.`);
  const sub = r.u16();
  if (sub !== 1 && sub !== 2) throw new BrushProblem(`That Photoshop brush set has a sub-version (${sub}) Frameling does not know how to read.`);
  let samples = new Map<string, () => Sample>();
  const descs: DescObject[] = [];
  let sawDesc = false;
  while (r.left >= 12) {
    const sig = r.tag();
    const key = r.tag();
    const len = r.u32();
    if (sig !== '8BIM') throw new BrushProblem('That Photoshop brush set has a damaged section, so it is probably damaged or only partly downloaded.');
    // A section that runs past the end of the file is a download that stopped: keep what is there.
    const body = r.take(Math.min(len, r.left));
    r.skip(Math.min((4 - (len % 4)) % 4, r.left));
    if (key === 'samp') samples = lazySamples(body, sub);
    else if (key === 'desc') {
      sawDesc = true;
      const d = new Reader(body, 0, 'Photoshop brush set');
      d.u32();
      descs.push(readDescriptor(d));
    }
  }
  const tips = new Tips(samples);
  const brushes: ImportedBrush[] = [];
  const notes: string[] = [];
  let skipped = 0;
  const failed: string[] = [];
  let n = 0;
  for (const d of descs) {
    const list = getList(d, 'Brsh') ?? [];
    for (const item of list) {
      if (brushes.length >= MAX_BRUSHES_PER_FILE) break;
      n++;
      if (!isObject(item)) {
        skipped++;
        continue;
      }
      try {
        brushes.push(mapPreset(item, tips, n - 1));
      } catch (e) {
        if (!(e instanceof BrushProblem)) throw e;
        skipped++;
        if (failed.length < 3) failed.push(`"${(getStr(item, 'Nm  ') ?? `Brush ${n}`).slice(0, 30)}": ${e.message}`);
      }
    }
  }
  if (!sawDesc) {
    // An older version 6 file with the pictures and nothing else: one brush for each picture.
    let i = 0;
    for (const id of samples.keys()) {
      if (brushes.length >= MAX_BRUSHES_PER_FILE) break;
      i++;
      try {
        const t = tips.get(id, false, false);
        brushes.push({ name: `Brush ${i}`, dab: cleanDab({ tip: 'picture', picture: t.tip.stamp, size: t.tip.size, aliased: false }), dropped: [], changed: t.tip.shrunk ? [`Its tip picture was shrunk from ${t.w} by ${t.h} pixels to fit.`] : [] });
      } catch {
        skipped++;
      }
    }
  }
  if (skipped) notes.push(`${plural(skipped, 'brush', 'brushes')} in the set could not be read and ${skipped === 1 ? 'was' : 'were'} left out${failed.length ? ` (${failed.join(' ')})` : ''}.`);
  if (!brushes.length) throw new BrushProblem(skipped ? `None of the brushes in that Photoshop file could be read.${failed.length ? ` ${failed[0]}` : ''}` : 'There are no brushes in that Photoshop file.');
  return { ok: true, format: 'abr', setName: fileName, brushes, notes };
}

