// Procreate brushes: a .brush (one brush) and a .brushset (many). Each brush is a zip holding `Brush.archive` (the settings,
// an Apple keyed archive: see bplist.ts), `Shape.png` (the tip), sometimes `Grain.png` (the paper), `QuickLook/Thumbnail.png`
// (Procreate's own picture of a stroke) and, for a dual brush, a `Sub01` folder. A set is a zip of one such folder per brush
// with a list, `brushset.plist`, for the set's name and the order.
//
// Read from real free files (a CC0 pack and an MIT repo), from notes others published about the format (topsd's, CC BY 4.0)
// and from Procreate's own handbook for what each setting is called. Not from any code with a copyleft licence. Procreate
// does not publish the format, so what a number means on screen was settled by laying a stroke drawn here beside Procreate's
// own thumbnail of the same brush (docs/brush-import.md says what that settled and what is still a guess). Anything that
// could not be mapped honestly is left out with a note, never guessed at silently. Pure, no DOM.
import { cleanDab } from '../../dab/maths';
import type { PaperKind } from '../../dry/paper';
import { cleanCurve } from '../../dab/curve';
import { type DynRoute, type DynSource, type DynTarget, MAX_ROUTES } from '../../dab/dynamics';
import { MAX_FILE_TEXTURE_SIDE, pictureFromPixels } from '../../dab/texturePicture';
import { parsePlist, PlistDate, Uid, unarchive, type PlistDict, type PlistValue } from './bplist';
import { decodeTipPng } from './krita';
import { tipFrom, type PixelReader } from './tip';
import { MAX_SOFT_STAMP } from '../stamps';
import { BrushProblem, plural, type ImportedBrush, type ImportResult } from './types';
import { fibrePaper } from './standInPaper';
import { openZip, type Zip, type ZipItem } from './zip';

/** The most one brush's settings may unpack to (the biggest real ones are about 10 KB). */
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024;
const MAX_PICTURE_BYTES = 32 * 1024 * 1024;
const MAX_LIST_BYTES = 4 * 1024 * 1024;
/** Tip and grain pixels a whole file may decode: a set of full size tips stops here, with a note, not after a minute of work. */
const MAX_PIXEL_BUDGET = 256 * 1024 * 1024;

/**
 * How big a brush comes in when there is nothing better to go on. Procreate keeps the size as a 0 to 1 number
 * (`paintSize`) and says nowhere how many pixels that is, and the same brush saved at two different sizes keeps the same
 * stroke picture, so `paintSize` cannot be turned into pixels. This is a choice, not a finding: 1 is a hundred pixels.
 * Nearly every real file carries a stroke picture, so this is the fallback, not the usual road: see `strokeWidth`.
 */
export const PIXELS_PER_SIZE = 100;

/** The widest a brush comes in at, whatever its stroke picture shows. */
const MAX_SIZE = 300;

/**
 * Procreate keeps a tip as a grey picture with the usual screen gamma on it, and paints with it as light, not as the
 * number in the file: a grey of 20 in 255 lays down under half a percent of paint, not eight. Graphite ink and Velvet int
 * both have a tip that is 20 all over where it looks black, and Procreate's own pictures of their strokes are clean
 * between the specks. Read as the plain number, that haze piled up dab on dab into a solid band.
 */
const TIP_GAMMA = 2.2;
const TIP_LIGHT = Array.from({ length: 256 }, (_, v) => 255 * Math.pow(v / 255, TIP_GAMMA));
/**
 * The faint speckle round a soft tip (the dust at the edge of Velvet int's claw) is thrown away by that curve, and it is
 * what makes Procreate's soft cloud: where only a few dabs reach, a faint speckle is a haze, and the solid middle is
 * built from the strong parts of the same dabs. So the curve keeps this much of the straight value as a floor. It is
 * taken only when it adds a halo that is really there (see HALO_MIN); every other tip is read as before.
 */
export const TIP_HAZE = 0.4;
const TIP_LIGHT_HAZE = TIP_LIGHT.map((v, i) => Math.max(v, 255 * TIP_HAZE * (i / 255)));
/** A haze counts when it pushes the furthest reach of the tip out by at least this much... */
const HALO_MIN = 1.15;
/** ...and the brush is at least this many pixels across: on a thinner line the haze is under a pixel wide (Fuzzy ink, 18 pixels, keeps its ragged edge). */
const HALO_MIN_SIZE = 40;

/** How far the tip's farthest visible cell is from its centre, as a share of half its longer side (1 is a tip that fills its square). */
export function reachOf(st: { w: number; h: number; cells: number[] }): number {
  const cx = (st.w - 1) / 2;
  const cy = (st.h - 1) / 2;
  let far = 0;
  for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) if (st.cells[y * st.w + x]) far = Math.max(far, Math.hypot(x - cx, y - cy));
  return far / Math.max(0.5, (Math.max(st.w, st.h) - 1) / 2);
}

/**
 * How long a taper of 1 is, in pixels of Procreate's own picture of the stroke (which is the scale a brush's size is
 * measured in): half the picture's width. Measured off the pictures: Ink Bleed 1 has no pressure on size at all, so
 * its width is the taper alone, and it reaches full width a fifth of the way along with a start of 0.26; the copy of it
 * with a start of 0.59 takes twice as long. Dry Ink v2 (end 1) and Graphite ink (start 0.86, end 1) fit the same rule
 * at 14 and 80 pixels across, so the length does not go with the brush's size.
 */
const TAPER_PIXELS = 530;

/**
 * How far Procreate's jitter throws a dab off the line, as a share of the brush width for a jitter of 1. Settled by
 * eye against Procreate's own pictures: Graphite ink (0.54) is a loose cloud about half as wide again as its tip, and
 * Basic 01 (1.67) has a ragged edge but is still one stroke.
 */
const JITTER_THROW = 0.25;

/**
 * The smallest a brush comes in at. Some files ask for a size near nothing (Cat Thorne's Basic 01 asks for 0.0177 of
 * the slider, which is one pixel), and a one pixel brush draws a faint dotted thread rather than the stroke Procreate
 * shows. Since the size is a choice anyway, nothing arrives unusable.
 */
const MIN_SIZE = 6;

/** The built in blank grain Procreate names when a brush has no paper: nothing to catch on. */
const BLANK_GRAIN = /blank/i;

/**
 * Procreate's own papers are not inside a .brush: the file only names one (`Brush-Artery-Charcoal-Corse.jpg`), and the
 * picture itself stays in Procreate. A pencil that arrives with no paper at all is smooth where Procreate's is gritty,
 * which is the single biggest thing that made an imported pencil look wrong.
 *
 * So a named paper is matched by its words to the nearest paper Frameling draws itself, and the brush says which one it
 * asked for and which one stood in. Frameling's papers are its own (see texture.ts); nothing is copied out of Procreate.
 * A paper whose words say nothing about tooth gets no stand in. Splatters does count as grit: Shenbot's Inking Pen
 * names it and draws a smooth line, but that is its grain being stamped (movement 0.04), where every dab finds new
 * paper and they fill each other in. Dry Ink 1 names the same paper, rolling, and its stroke is rough all through.
 */
const PAPER_STAND_INS: { words: RegExp; paper: PaperKind; fibre?: boolean; grit: boolean; share: number; what: string }[] = [
  // Grit (charcoal, graphite, sand): the paint catches on the peaks first, so the soft edge of the tip and a light
  // touch break into specks, and the middle of a firm stroke fills in nearly solid. That is Procreate's own picture of
  // the 6B Pencil: 97% covered in the middle with pin holes through it, ragged and speckled at the edge and the ends.
  // So it keeps Frameling's own way with paper (see `grainCut`), and holds the whole stroke back only a little.
  { words: /charcoal|coarse|corse|rough|grit|chalk|sand|noise|grain|graphite|pencil|concrete|stone|gravel|splatter/i, paper: 'fine', grit: true, share: 0.75, what: 'a gritty paper' },
  // A soft paper (pastel, watercolour, cotton) is drawn here, with fibres and a tooth (see standInPaper.ts), because
  // none of Frameling's tidy papers looks like one: the laid paper that stood in at first is a ruled grid, and
  // Procreate's own picture of Shenbot's Background brush (Pastel Paper) is wavy fibres lying across the stroke.
  { words: /pastel|watercolou?r|cotton|paper|fibre|fiber|felt|wash/i, paper: 'laid', fibre: true, grit: false, share: 1, what: 'a soft fibrous paper' },
  // A weave (canvas, linen) is Frameling's laid paper, thinning the paint as Procreate's grain does. Its bumps are
  // spread evenly from pit to peak, which bites harder than a photograph of cloth, so it takes 0.7 of the depth.
  { words: /canvas|linen|laid|weave|cloth/i, paper: 'laid', grit: false, share: 0.7, what: 'a paper with a weave' },
];

/** How much of a gritty stand in's depth holds the whole stroke back: enough for pin holes, not enough to grey it. */
const GRIT_HOLD = 0.12;

// ---------------------------------------------------------------- the settings

class Settings {
  constructor(readonly d: PlistDict) {}
  num(k: string, fallback: number): number {
    const v = this.d[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  }
  /** A number only when the file really has one. */
  has(k: string): boolean {
    return typeof this.d[k] === 'number';
  }
  bool(k: string): boolean {
    return this.d[k] === true;
  }
  str(k: string): string | undefined {
    const v = this.d[k];
    return typeof v === 'string' && v ? v : undefined;
  }
  /** A pen curve (`{ points: ["{0.0, 0.0}", ...] }`) as points, or null when it is not one or not there. */
  curve(k: string): [number, number][] | null {
    const v = this.d[k];
    if (typeof v !== 'object' || v === null || Array.isArray(v) || v instanceof Uint8Array || v instanceof PlistDate) return null;
    const pts = (v as PlistDict).points;
    if (!Array.isArray(pts)) return null;
    const out: [number, number][] = [];
    for (const p of pts.slice(0, 64)) {
      if (typeof p !== 'string') continue;
      const m = /^\s*\{\s*(-?[\d.eE+-]+)\s*,\s*(-?[\d.eE+-]+)\s*\}\s*$/.exec(p);
      if (m && Number.isFinite(+m[1]) && Number.isFinite(+m[2])) out.push([+m[1], +m[2]]);
    }
    return out.length >= 2 ? out : null;
  }
}

/** The settings of a brush's `Brush.archive`. Throws a `BrushProblem` when it is not a Procreate brush's. */
function settingsOf(bytes: Uint8Array): Settings {
  const root = unarchive(parsePlist(bytes));
  const ok = typeof root === 'object' && root !== null && !Array.isArray(root) && !(root instanceof Uint8Array) && !(root instanceof PlistDate);
  if (!ok) throw new BrushProblem('That does not look like a Procreate brush: the settings in it are not in the shape Procreate keeps them.');
  const d = root as PlistDict;
  // A brush has at least a size or a name and says its class; anything else is some other keyed archive.
  if (d.$classname !== 'SilicaBrush' && !('paintSize' in d) && !('plotSpacing' in d)) throw new BrushProblem('That does not look like a Procreate brush: it has none of the settings a brush has.');
  return new Settings(d);
}

// ---------------------------------------------------------------- pictures

export interface Pictures {
  shape: Uint8Array | null;
  grain: Uint8Array | null;
  /** Procreate's own picture of a stroke with this brush (`QuickLook/Thumbnail.png`), when the file carries one. */
  thumb: Uint8Array | null;
  /** The brush has a second brush inside it (a dual brush). */
  sub: boolean;
}

/** Spends the file's pixel budget; throws a plain message when it is gone. */
export class Budget {
  left = MAX_PIXEL_BUDGET;
  spend(px: number): void {
    this.left -= px;
    if (this.left < 0) throw new BrushProblem('That file has more tip pictures than Frameling will open at once.');
  }
}

/** Dark means paint? No: in Procreate's tip, white paints. `inverted` flips it, as the brush's own flag does. */
function shapeTip(png: Uint8Array, inverted: boolean, budget: Budget) {
  const { w, h, px } = decodeTipPng(png);
  budget.spend(w * h);
  const lum = (i: number): number => (px[i] * 77 + px[i + 1] * 151 + px[i + 2] * 28) >> 8;
  const paintWith = (light: number[]) => (i: number): number => (light[inverted ? 255 - lum(i) : lum(i)] * px[i + 3]) / 255;
  const paint = paintWith(TIP_LIGHT);
  // A tip that is white all over (some brushes paint with a plain square) is a square, not a picture of one.
  let weakest = 255;
  for (let i = 0; i < px.length && weakest > 250; i += 4) weakest = Math.min(weakest, paint(i));
  const readWith = (f: (i: number) => number): PixelReader => (x, y, out) => {
    out[0] = out[1] = out[2] = 0;
    out[3] = f((y * w + x) * 4);
  };
  if (weakest > 250) return { solid: true as const, w, h };
  const plain = tipFrom(w, h, readWith(paint), false, MAX_SOFT_STAMP);
  // Does the faint speckle add a halo? Then keep it, and say how much further out the tip now reaches: a tip that turns
  // sweeps a cloud as wide as its reach, so the size measured off the picture has to come down by as much.
  const hazy = tipFrom(w, h, readWith(paintWith(TIP_LIGHT_HAZE)), false, MAX_SOFT_STAMP);
  const halo = reachOf(hazy.stamp) / Math.max(0.01, reachOf(plain.stamp));
  return { solid: false as const, w, h, tip: plain, hazy: halo >= HALO_MIN ? hazy : null, halo };
}

/**
 * How wide one dab is in Procreate's own picture of the stroke, in pixels, or null when the picture cannot say.
 *
 * Every .brush carries `QuickLook/Thumbnail.png`: Procreate drawing one stroke with this brush. `paintSize` cannot be
 * turned into pixels (the same brush saved at two sizes keeps one picture), but the picture itself can be measured, and
 * it is the picture the artist chose the brush by. Down each column, the longest unbroken run of paint is one dab across
 * the line: a gap between scattered dabs breaks the run, so scatter does not widen it. The ninth of ten is taken rather
 * than the widest, so a blotch on one column cannot decide the whole brush, and the thin tapered ends are left out.
 *
 * Checked against the three brushes whose dabs were measured by hand off their pictures: Sequins comes out 57 where the
 * hand said 57, Seed 219 where the hand said 190, Plain Stitch 27 where the hand said 34.
 */
function strokeWidth(png: Uint8Array, budget: Budget, thrown = false, slanted = false, ran?: { length: number }): number | null {
  const { w, h, px } = decodeTipPng(png);
  budget.spend(w * h);
  if (w < 8 || h < 8) return null;
  const runs: number[] = [];
  for (let x = 0; x < w; x++) {
    let best = 0;
    let run = 0;
    let first = -1;
    let last = -1;
    for (let y = 0; y < h; y++) {
      if (px[(y * w + x) * 4 + 3] > 12) {
        run++;
        if (run > best) best = run;
        if (first < 0) first = y;
        last = y;
      } else run = 0;
    }
    // A brush that throws its dabs off the line draws a cloud: there the longest unbroken run is one speck, so the
    // whole reach of the cloud is measured instead, and the caller takes the throw back off it.
    if (best > 0) runs.push(thrown ? last - first + 1 : best);
  }
  if (runs.length < 8) return null;
  if (ran) ran.length = runs.length;
  runs.sort((a, b) => a - b);
  // A long thin tip that turns along the line (a stitch, a dash) is cut on the slant by most columns, which reads it
  // thicker than it is: there the middle column is the fair one, not the ninth of ten.
  const wide = runs[Math.floor(runs.length * (slanted ? 0.5 : 0.9))];
  // A stroke that fills the picture top to bottom was drawn bigger than the picture: it cannot say how wide the dab is.
  return wide > 0 && wide < h - 1 ? wide : null;
}

// ---------------------------------------------------------------- one brush

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** Where each source of a pen control sits: the part of the setting's name, and our input. */
const SOURCES: { word: string; from: DynSource; what: string }[] = [
  { word: 'Pressure', from: 'pressure', what: 'pressure' },
  { word: 'Tilt', from: 'tilt', what: 'tilt' },
  { word: 'Speed', from: 'speed', what: 'speed' },
  { word: 'Roll', from: 'twist', what: 'pen twist' },
];
const TARGETS: { words: string[]; to: DynTarget; what: string }[] = [
  { words: ['Size'], to: 'size', what: 'size' },
  { words: ['Opacity'], to: 'opacity', what: 'opacity' },
  { words: ['Hue'], to: 'hue', what: 'hue' },
  { words: ['Saturation'], to: 'saturation', what: 'saturation' },
  { words: ['Brightness', 'Lightness'], to: 'lightness', what: 'brightness' },
];

/** Settings that Frameling has nothing for, said only when the brush really uses them (more than this). */
const DROPS: { keys: string[]; flag?: boolean; over?: number; words: string }[] = [
  { keys: ['shapeFlipXJitter', 'shapeFlipYJitter'], flag: true, words: 'Its random flipping of the tip.' },
  { keys: ['shapeAzimuth', 'shapeRoll'], flag: true, words: "Its tip turning with the pen's direction or roll." },
  { keys: ['plotSmoothing', 'plotMovingAverageStabilization', 'plotFFTSmoothingAmount', 'dynamicsPressureSmoothing'], over: 0.01, words: "Its stroke smoothing. Frameling's stabiliser is a setting of the tool, not of the brush." },
  { keys: ['metallicAmount'], over: 0.01, words: 'Its metallic look.' },
  { keys: ['burntEdgesAmount'], over: 0.01, words: 'Its burnt edges.' },
  { keys: ['wetEdgesAmount'], over: 0.01, words: 'Its wet edges.' },
  { keys: ['dynamicsGlaze', 'renderingModulatedTransfer', 'renderingRecursiveMixing'], flag: true, words: 'Its glazing (how the paint builds up over itself).' },
  { keys: ['dynamicsPressureBleed', 'dynamicsTiltBleed', 'dynamicsRollBleed', 'dynamicsBlur', 'dynamicsBlurJitter'], over: 0.01, words: 'Its bleed and blur.' },
  { keys: ['dynamicsPressureSecondaryColor', 'dynamicsTiltSecondaryColor', 'dynamicsRollSecondaryColor', 'jitterSecondary', 'jitterStrokeSecondary'], over: 0.01, words: 'Its secondary colour.' },
  { keys: ['dynamicsJitterStrokeHue', 'dynamicsJitterStrokeSaturation', 'dynamicsJitterStrokeLightness', 'dynamicsJitterStrokeDarkness'], over: 0.01, words: 'Its colour change from one stroke to the next.' },
  { keys: ['dynamicsJitterDarkness'], over: 0.01, words: 'Its darkness jitter.' },
];

/** One brush from its settings and pictures, or a `BrushProblem` saying why not. */
export function brushFromArchive(archive: Uint8Array, pics: Pictures, fallbackName: string, budget: Budget = new Budget()): ImportedBrush {
  const s = settingsOf(archive);
  const name = (s.str('name') ?? fallbackName).replace(/\s+/g, ' ').trim().slice(0, 80) || fallbackName;
  const dropped: string[] = [];
  const changed: string[] = [];
  const raw: Record<string, unknown> = { aliased: false };

  // ---- the tip
  const inverted = s.bool('shapeInverted');
  let share = 1;
  // How much further out a hazy tip reaches than its strong part does (1 when it adds nothing).
  let hazy: ReturnType<typeof tipFrom> | null = null;
  let halo = 1;
  let tipSide = 1;
  if (pics.shape) {
    const t = shapeTip(pics.shape, inverted, budget);
    if (t.solid) {
      raw.tip = 'square';
      raw.hardness = 1;
    } else {
      raw.tip = 'picture';
      raw.picture = t.tip.stamp;
      hazy = t.hazy;
      halo = t.halo;
      tipSide = Math.max(t.w, t.h);
      share = clamp(t.tip.size / Math.max(t.w, t.h), 0.02, 1);
      if (t.tip.shrunk) changed.push(`Its tip picture was shrunk from ${t.w} by ${t.h} to ${t.tip.stamp.w} by ${t.tip.stamp.h} pixels, the most a picture tip holds, so fine detail is lost.`);
    }
  } else {
    raw.tip = 'round';
    // A brush with a paper is a pencil or a chalk, and Procreate's tips for those fade at the edge, which is where the
    // paper shows through. A pen with no paper keeps a hard edge.
    const hasPaper = !!pics.grain || (!!s.str('bundledGrainPath') && !BLANK_GRAIN.test(s.str('bundledGrainPath') ?? '') && PAPER_STAND_INS.some((g) => g.words.test(s.str('bundledGrainPath') ?? '')));
    // A soft paper's brush is softer still: Background's edge is a blur in Procreate's picture, the pencils' a ragged line.
    const softPaper = !pics.grain && !!PAPER_STAND_INS.find((g) => g.words.test(s.str('bundledGrainPath') ?? ''))?.fibre;
    raw.hardness = softPaper ? 0.3 : hasPaper ? 0.65 : 1;
    const named = (s.str('bundledShapePath') ?? '').replace(/^.*[/\\]/, '').slice(0, 40);
    changed.push(`Its tip is one of Procreate's own built in shapes${named ? ` ("${named}")` : ''}, which is not in the file, so it came as a plain round tip.`);
  }

  // ---- size, spacing, scatter, angle
  const roundness = clamp(s.num('shapeRoundness', 1), 0.05, 1);
  raw.roundness = roundness;
  // How much of the brush's own size one dab actually lays across the line: a picture tip's longer side runs along the
  // line, so only its shorter side shows across, and roundness squashes either tip the same way.
  const stamp = raw.picture as { w: number; h: number } | undefined;
  const across = clamp((stamp ? stamp.h / Math.max(stamp.w, stamp.h) : 1) * roundness, 0.05, 1);
  // The size comes from Procreate's own picture of the stroke when the file has one, measured across the line, because
  // `paintSize` cannot be turned into pixels. Without a picture it falls back to the plain `paintSize` reading.
  const paintSize = s.num('paintSize', 0.2);
  // How far a dab lands off the line is Procreate's jitter (Stroke path), a share of the brush width. Its scatter
  // (Shape) is something else: how far the tip is turned at random for each dab. The two were read as one thing at
  // first, which is what made inking pens arrive as clouds (their scatter is 1 and their jitter 0) and then, once
  // scatter was tied to the spacing to stop that, left Graphite ink (jitter 0.54) as a tight band with no cloud.
  const jitter = s.num('plotJitter', 0);
  let scatter = (jitter * JITTER_THROW) / share;
  // Files from before Procreate 5 (they have no `shapeCount`) had one scatter that threw the tip as well as turning it:
  // Sequins (2015) has scatter 0.877, no jitter, and its sequins sit above and below the line. There the throw goes
  // with the spacing, which fits Sequins as it was measured, because its dabs sit a whole width apart.
  if (!s.has('shapeCount')) scatter += (s.num('shapeScatter', 0) * s.num('plotSpacing', 0.1)) / share;
  let measured: number | null = null;
  if (pics.thumb) {
    try {
      // Only a new file's jitter makes a cloud; an old file's scatter goes with wide spacing, where each dab stands alone.
      const thrown = (jitter * JITTER_THROW) / share > 0.05;
      const ran = { length: 0 };
      let wide = strokeWidth(pics.thumb, budget, thrown, across < 0.5 && s.num('shapeRotation', 0) >= 0.5, ran);
      // The picture is drawn with the taper on, so its widest point may be short of the brush's real width. A short
      // picture is the start of a stroke that never gets out of its start taper (Teardrop Ink's runs 177 pixels of a
      // taper 530 long). A whole one whose two tapers meet in the middle never reaches full width either (the 6B
      // Pencil's tapers are each two thirds of the stroke). So the width is divided by the most the tapers let through.
      const tv = s.has('pencilTaperStartLength') || s.has('pencilTaperEndLength') ? 'pencilTaper' : 'taper';
      const tEndLen = clamp(s.num(`${tv}EndLength`, 0), 0, 1) * TAPER_PIXELS;
      const tStartLen = s.num('taperVersion', 0) < 1 && s.num(`${tv}StartLength`, 0) < 0.02 ? tEndLen : clamp(s.num(`${tv}StartLength`, 0), 0, 1) * TAPER_PIXELS;
      const tAmount = clamp(s.num(`${tv}Size`, 0), 0, 1);
      if (wide !== null && tAmount > 0.01) {
        const whole = ran.length >= 500;
        let most = 0;
        for (let x = 0; x <= ran.length; x += 4) {
          const a = tStartLen > 0 ? 1 - tAmount * (1 - Math.min(1, x / tStartLen)) : 1;
          const b = whole && tEndLen > 0 ? 1 - tAmount * (1 - Math.min(1, (ran.length - x) / tEndLen)) : 1;
          most = Math.max(most, a * b);
        }
        wide /= Math.max(0.2, most);
      }
      // The picture shows the tip and the throw together; most dabs land well inside the furthest throw.
      // A tip that turns at random sweeps a cloud as wide as its reach, haze included.
      if (wide !== null) measured = Math.round(clamp(wide / (across + (thrown ? (1.5 * jitter * JITTER_THROW) / share : 0)), MIN_SIZE, MAX_SIZE));
    } catch (e) {
      if (!(e instanceof BrushProblem)) throw e;
    }
  }
  const wanted = Math.round(paintSize * PIXELS_PER_SIZE * share);
  // A wide brush with a haze round its tip takes the haze (see TIP_HAZE). The tip is bigger with it, and one that turns
  // at random sweeps a cloud as wide as its reach, so the size measured off the picture comes down by as much.
  if (hazy && measured !== null && measured >= HALO_MIN_SIZE) {
    raw.picture = hazy.stamp;
    share = clamp(hazy.size / tipSide, 0.02, 1);
    if (s.bool('shapeRandomise') || s.num('shapeScatter', 0) >= 0.5) measured = Math.max(MIN_SIZE, Math.round(measured / halo));
    changed.push('Its tip keeps the faint speckle round its edge, which is what makes the soft cloud round the line in Procreate.');
  }
  raw.size = measured ?? Math.max(MIN_SIZE, wanted);
  if (measured !== null)
    changed.push(
      `It came ${measured} pixels across, measured off Procreate's own picture of the stroke in the file. Procreate's size is a share of its own slider and never says how many pixels it is, so the picture is the closest thing to an answer the file has. Set the size you want after it lands.`,
    );
  else if (wanted < MIN_SIZE) changed.push(`It asked for a brush ${wanted} pixel${wanted === 1 ? '' : 's'} across, too small to draw with, so it came at ${MIN_SIZE}. Procreate's sizes are a share of its own slider and do not say how many pixels they are, so set the size you want after it lands.`);
  // Procreate counts spacing and scatter in the whole tip picture; ours count in the part you can see, which is `share` of it.
  // Procreate can stamp the tip several times at each step (count, 1 to 16), each turned its own way. Frameling lays
  // one dab a step, so the same number of dabs comes from steps that many times closer.
  const count = 1 + Math.round(clamp(s.num('shapeCount', 0), 0, 1) * 15);
  const spacing = s.num('plotSpacing', 0.1) / count;
  if (count > 1) changed.push(`It stamps its tip ${count} times at each step. Frameling lays one dab a step, so its steps came ${count} times closer instead.`);
  raw.spacing = spacing / share;
  if ((raw.spacing as number) > 4) changed.push(`Its spacing of ${pct(spacing)} was wider than Frameling goes, so it came at the widest, 400%.`);
  if (s.num('plotSpacingVersion', 0) >= 1 && (raw.spacing as number) > 0.06) changed.push('This file keeps its spacing the way newer Procreate does. That has not been checked, so the dabs may sit closer or further apart than in Procreate.');
  raw.scatter = clamp(scatter, 0, 2);
  if (scatter > 0.01) changed.push("Its jitter came as scatter, which spreads dabs in every direction, not only across the line. How far it throws them was matched by eye against Procreate's own picture of the stroke.");
  if (scatter > 2) changed.push('Its scatter was more than Frameling goes, so it came at the most, 200%.');
  const rot = s.num('shapeRotation', 0);
  if (rot >= 0.5) raw.follow = true;
  if (rot > 0.01 && rot < 0.99) changed.push(`Its tip follows the line ${pct(rot)} of the way; Frameling's tip either follows it or does not, so it came as ${rot >= 0.5 ? 'following' : 'not following'}.`);
  // Procreate's scatter turns the tip at random for each dab, up to the whole way round at 1. Its own pictures say
  // so: Cat Thorne's sequins lie at a different angle in every stamp, and Graphite ink, whose tip is a page of little
  // scratches, draws a cloud of specks rather than rows of combed scratches. A brush that leaves scatter alone (Plain
  // Stitch) keeps its stitches lined up along the line.
  const turn = s.bool('shapeRandomise') ? 1 : clamp(s.num('shapeScatter', 0), 0, 1);
  if (turn > 0.01) raw.angleJitter = turn;
  // ---- taper: the line thinning to a point at each end. Procreate keeps one for a pen and one for a finger; its own
  // pictures are drawn with the pen's (Ink Bleed 1 and its copy differ only there, and their pictures differ).
  const pen = s.has('pencilTaperStartLength') || s.has('pencilTaperEndLength') ? 'pencilTaper' : 'taper';
  const tEnd = clamp(s.num(`${pen}EndLength`, 0), 0, 1);
  // An older file (taper version 0) keeps one length that counts at both ends, whatever its start says: Velvet int,
  // Basic 01, the 6B Pencil and Dry Ink v2 all have a start of nearly nothing, and Procreate's pictures of all four
  // grow from a point over the length their end gives.
  const oneLength = s.num('taperVersion', 0) < 1 && s.num(`${pen}StartLength`, 0) < 0.02;
  const tStart = oneLength ? tEnd : clamp(s.num(`${pen}StartLength`, 0), 0, 1);
  const tSize = clamp(s.num(`${pen}Size`, 0), 0, 1);
  const tOpacity = clamp(s.num(`${pen}Opacity`, 0), 0, 1);
  if ((tStart > 0.01 || tEnd > 0.01) && (tSize > 0.01 || tOpacity > 0.01)) {
    const size = raw.size as number;
    // A taper that thins the line does not fade it as well: the 6B Pencil, Dry Ink 1 and Dry Ink v2 all ask for a full
    // fade and Procreate's pictures of them are as dark at the tip as in the middle. One that only fades does fade:
    // Shenbot's Background keeps its width and its picture goes soft at both ends.
    raw.taper = { start: tStart > 0.01 ? (tStart * TAPER_PIXELS) / size : 0, end: tEnd > 0.01 ? (tEnd * TAPER_PIXELS) / size : 0, size: tSize, opacity: tSize > 0.01 ? 0 : tOpacity };
    changed.push("Its taper came across: the line thins to a point at each end. The end is drawn when you lift the pen. How long a taper is was measured off Procreate's own pictures, at the size the brush came in at.");
  }
  const fixed = s.num('shapeAngle', 0);
  if (Math.abs(fixed) > 0.001) dropped.push('Its fixed tip angle. Frameling has not seen how Procreate stores it, so the tip came at its own angle.');

  // ---- opacity and what the pen does
  // `paintOpacity` is where the opacity slider was left, like `paintSize` for size: Procreate's own picture of the
  // stroke is drawn at full strength whatever it says (the Sketch pencil is saved at 53% and its picture is black).
  raw.opacity = 1;
  const slider = s.num('paintOpacity', 1);
  if (slider < 0.97) changed.push(`It was saved with the opacity slider at ${pct(slider)}. It came at full strength, as in Procreate's own picture of the stroke: turn the opacity down if you want it as it was left.`);
  raw.flow = 1;
  // Under a gritty paper a lighter touch reaches fewer of the peaks, so the line breaks into specks instead of going
  // evenly faint: there Procreate's opacity controls come as flow. Everywhere else they come as opacity.
  const standIn = pics.grain ? undefined : PAPER_STAND_INS.find((g) => g.words.test((s.str('bundledGrainPath') ?? '').replace(/^.*[/\\]/, '')));
  const fade: DynTarget = standIn?.grit && !BLANK_GRAIN.test(s.str('bundledGrainPath') ?? '') ? 'flow' : 'opacity';
  const routes: DynRoute[] = [];
  const used: string[] = [];
  for (const src of SOURCES)
    for (const tg of TARGETS) {
      const key = tg.words.map((w) => `dynamics${src.word}${w}`).find((k) => s.has(k));
      if (!key) continue;
      const v = s.num(key, 0);
      const amount = Math.abs(v);
      if (amount < 0.02) continue;
      // Procreate's speed runs the other way from its pressure: a positive number thins or fades the line as the hand
      // goes faster, so a slow hand draws at full strength.
      const route: DynRoute = { from: src.from, to: tg.to === 'opacity' ? fade : tg.to, amount: Math.min(1, amount), invert: src.from === 'speed' ? v > 0 : v < 0 };
      const curve = cleanCurve(s.curve(`${key}Curve`));
      if (curve) route.curve = curve;
      if (routes.length >= MAX_ROUTES) {
        dropped.push(`Its ${src.what} control of ${tg.what}: Frameling holds at most ${MAX_ROUTES} pen controls.`);
        continue;
      }
      routes.push(route);
      used.push(`${src.what} on ${tg.what}`);
    }
  raw.dynamics = routes;
  if (used.length)
    changed.push(`Its pen controls (${used.slice(0, 6).join(', ')}${used.length > 6 ? ', and more' : ''}) are read by their names only: they have not been checked against Procreate, so they may feel different.`);
  const jSize = Math.abs(s.num('dynamicsJitterSize', 0));
  if (jSize >= 0.02) raw.sizeJitter = Math.min(1, jSize);
  const jOpacity = Math.abs(s.num('dynamicsJitterOpacity', 0));
  if (jOpacity >= 0.02 && routes.length < MAX_ROUTES) {
    routes.push({ from: 'random', to: fade, amount: Math.min(1, jOpacity), invert: false });
  }
  for (const [word, to] of [['Hue', 'hue'], ['Saturation', 'saturation'], ['Lightness', 'lightness'], ['Brightness', 'lightness']] as const) {
    const j = Math.abs(s.num(`dynamicsJitter${word}`, 0));
    if (j >= 0.02 && routes.length < MAX_ROUTES && !routes.some((r) => r.from === 'random' && r.to === to)) routes.push({ from: 'random', to, amount: Math.min(1, j), invert: false });
  }
  if (Math.abs(s.num('dynamicsPressureShapeRoundness', 0)) > 0.01 && s.num('dynamicsPressureShapeRoundnessMinimum', 1) < 0.99) dropped.push('Its tip getting rounder or flatter with pen pressure.');
  if (Math.abs(s.num('dynamicsTiltShapeRoundness', 0)) > 0.01 && s.num('dynamicsTiltShapeRoundnessMinimum', 1) < 0.99) dropped.push('Its tip getting rounder or flatter with pen tilt.');

  // ---- grain (the paper)
  const grainName = (s.str('bundledGrainPath') ?? '').replace(/^.*[/\\]/, '').slice(0, 40);
  if (pics.grain) {
    try {
      const g = decodeTipPng(pics.grain);
      budget.spend(g.w * g.h);
      // Procreate's brightness and contrast for the grain are baked into the picture: Basic 01 lifts its grain by
      // three quarters, which is why it draws a dense stroke with only the darkest threads of the paper showing.
      const bright = clamp(s.num('textureBrightness', 0), -1, 1);
      const contrast = clamp(s.num('textureContrast', 0), -1, 1);
      if (Math.abs(bright) > 0.01 || Math.abs(contrast) > 0.01) {
        const k = 1 + contrast;
        for (let i = 0; i < g.px.length; i += 4) for (let c = 0; c < 3; c++) g.px[i + c] = clamp((g.px[i + c] - 127.5) * k + 127.5 + bright * 255, 0, 255);
      }
      // The whole tile's worth of the picture is kept (256 across), not the 64 a picture you pick is boiled down to:
      // the fine tooth is what makes Barely There a wisp of specks, and at 64 it was a few grey lumps.
      const r = pictureFromPixels(g.w, g.h, g.px, MAX_FILE_TEXTURE_SIDE);
      if (r.ok) {
        raw.grain = {
          picture: r.picture,
          ...(s.bool('textureInverted') ? { invert: true } : {}),
          depth: clamp(s.num('grainDepth', 0.8), 0, 1),
          scale: clamp(Math.round(s.num('textureScale', 1)), 1, 8),
          // A grain picture stays put under the stroke. Procreate's movement runs from stamped (0) to rolling (1),
          // but Barely There is nearly stamped (0.16) and its picture is a sparse wisp, which only a paper that
          // stays put and holds the stroke back gives: one that moved filled it in solid.
          moving: false,
          thin: true,
        };
        changed.push('Its grain picture came as a small repeating paper. Which way round the light and dark parts catch the paint, and how big the paper is, have not been checked against Procreate.');
      }
    } catch (e) {
      if (!(e instanceof BrushProblem)) throw e;
      dropped.push(`Its grain picture: ${e.message}`);
    }
  } else if (grainName && !BLANK_GRAIN.test(grainName)) {
    const stand = PAPER_STAND_INS.find((g) => g.words.test(grainName));
    if (stand) {
      raw.grain = {
        ...(stand.fibre ? { picture: fibrePaper() } : { paper: stand.paper }),
        depth: clamp(s.num('grainDepth', 1) * stand.share, 0.1, 1),
        // `textureScale` is about Procreate's own picture of the paper, so it says nothing about a stand in's.
        scale: 1,
        moving: s.num('textureMovement', 1) < 0.5,
        ...(stand.grit ? { hold: GRIT_HOLD } : { thin: true }),
      };
      changed.push(`Its paper ("${grainName}") is one of Procreate's own, which is not in the file, so ${stand.what} of Frameling's own stood in for it. Pick another in the brush options if it is not the tooth you wanted.`);
    } else {
      dropped.push(`Its paper ("${grainName}") is one of Procreate's own, which is not in the file, and its name says nothing about the tooth it has, so this brush came with no paper. Pick one in the brush options if you want the paint to catch.`);
    }
  }

  // ---- wet mix, dual brush, blend
  const mix = s.num('dynamicsMix', 0);
  if (mix > 0.01) {
    raw.wet = clamp(mix, 0, 1);
    changed.push("Its wet mix came as Frameling's wet setting at the same amount. How the two compare has not been checked.");
  }
  if (pics.sub) dropped.push('Its dual brush (a second brush the first is painted through). Frameling reads only the main brush of a Procreate dual brush.');
  const blend = s.num('blendMode', 0);
  const ext = s.num('extendedBlend', 0);
  if (blend !== 0 || ext !== 0) dropped.push(`Its blend mode (number ${Math.round(blend || ext)}). Frameling has not checked how Procreate numbers its blend modes.`);

  // ---- what Frameling has nothing for
  for (const d of DROPS) {
    const hit = d.keys.some((k) => (d.flag ? s.bool(k) : Math.abs(s.num(k, 0)) > (d.over ?? 0)));
    if (hit) dropped.push(d.words);
  }

  return { name, dab: cleanDab(raw), dropped, changed };
}

// ---------------------------------------------------------------- the files

const GENERAL_ERROR = 'Frameling could not read that Procreate file. It may be damaged.';

/** The folders of a zip that hold a brush: the part of each name before `Brush.archive`. A dual brush's inner folder and a reset copy are not brushes of their own. */
function brushFolders(zip: Zip): string[] {
  const out: string[] = [];
  for (const it of zip.items) {
    if (!/(^|\/)Brush\.archive$/i.test(it.name)) continue;
    const prefix = it.name.slice(0, it.name.length - 'Brush.archive'.length);
    if (/(^|\/)(Sub\d+|Reset)\/$/i.test(prefix) || /(^|\/)__MACOSX\//.test(prefix)) continue;
    if (!out.includes(prefix)) out.push(prefix);
  }
  return out.slice(0, 1000);
}

/** The brush folders of a set, in the order `brushset.plist` gives when it can be read, else by name. */
function orderFolders(zip: Zip, folders: string[]): { order: string[]; name: string | null; listed: boolean } {
  const byName = new Map(folders.map((f) => [f.replace(/\/$/, '').toLowerCase(), f]));
  const sorted = [...folders].sort((a, b) => a.localeCompare(b));
  const item = zip.items.find((i) => /^(?:[^/]+\/)?brushset\.plist$/i.test(i.name));
  if (!item) return { order: sorted, name: null, listed: false };
  try {
    const list = parsePlist(zip.read(item, MAX_LIST_BYTES));
    const strings: string[][] = [];
    let name: string | null = null;
    let seen = 0;
    const walk = (v: PlistValue, depth: number): void => {
      if (depth > 6 || ++seen > 5000) return;
      if (Array.isArray(v)) {
        const own = v.filter((x): x is string => typeof x === 'string');
        if (own.length && own.length === v.length) strings.push(own);
        for (const x of v) walk(x, depth + 1);
      } else if (v && typeof v === 'object' && !(v instanceof Uint8Array) && !(v instanceof PlistDate) && !(v instanceof Uid)) {
        for (const k of Object.keys(v as PlistDict)) {
          const x = (v as PlistDict)[k];
          if (k === 'name' && typeof x === 'string' && !name) name = x.replace(/\s+/g, ' ').trim().slice(0, 80) || null;
          walk(x, depth + 1);
        }
      }
    };
    walk(list, 0);
    // The first list whose entries are folders we have, whole or in part, is the order.
    for (const own of strings) {
      const hits = own.map((n) => byName.get(n.replace(/\/$/, '').toLowerCase())).filter((f): f is string => !!f);
      if (hits.length) {
        const rest = sorted.filter((f) => !hits.includes(f));
        return { order: [...new Set([...hits, ...rest])], name, listed: true };
      }
    }
    return { order: sorted, name, listed: false };
  } catch (e) {
    if (e instanceof BrushProblem && /far more than/.test(e.message)) throw e;
    return { order: sorted, name: null, listed: false };
  }
}

function readZipBrushes(bytes: Uint8Array, fileName: string, expectSet: boolean): ImportResult {
  const zip = openZip(bytes, 'Procreate brush');
  const folders = brushFolders(zip);
  if (!folders.length) return { ok: false, format: 'procreate', error: `That ${expectSet ? 'Procreate brush set' : 'Procreate brush'} has no brush in it (no Brush.archive file). It may be damaged, or not from Procreate.` };
  const isSet = folders.length > 1 || folders[0] !== '';
  const { order, name: setTitle, listed } = isSet ? orderFolders(zip, folders) : { order: folders, name: null, listed: true };
  const budget = new Budget();
  const brushes: ImportedBrush[] = [];
  let broken = 0;
  let firstReason = '';
  for (const folder of order) {
    if (brushes.length >= 1000) break;
    const find = (n: string): ZipItem | undefined => zip.items.find((i) => i.name.toLowerCase() === `${folder}${n}`.toLowerCase());
    try {
      const arch = find('Brush.archive');
      if (!arch) continue;
      const shape = find('Shape.png');
      const grain = find('Grain.png');
      const thumb = find('QuickLook/Thumbnail.png');
      const pics: Pictures = {
        shape: shape ? zip.read(shape, MAX_PICTURE_BYTES) : null,
        grain: grain ? zip.read(grain, MAX_PICTURE_BYTES) : null,
        thumb: thumb ? zip.read(thumb, MAX_PICTURE_BYTES) : null,
        sub: zip.items.some((i) => i.name.toLowerCase().startsWith(`${folder}sub`.toLowerCase()) && /\/Brush\.archive$/i.test(i.name)),
      };
      const fallback = folder.replace(/\/$/, '').split('/').pop() || fileName;
      brushes.push(brushFromArchive(zip.read(arch, MAX_ARCHIVE_BYTES), pics, isSet ? fallback.slice(0, 40) : fileName, budget));
    } catch (e) {
      if (!(e instanceof BrushProblem)) throw e;
      // A ceiling (too much unpacked) ends the whole file; anything else only costs that one brush.
      if (/far more than/.test(e.message)) throw e;
      if (!firstReason) firstReason = e.message;
      broken++;
    }
  }
  if (!brushes.length) return { ok: false, format: 'procreate', error: firstReason || GENERAL_ERROR };
  const notes: string[] = [];
  if (broken) notes.push(`${plural(broken, 'brush', 'brushes')} could not be read (damaged or not understood), so ${broken === 1 ? 'it was' : 'they were'} left out.`);
  if (isSet && !listed) notes.push("The set's own list of brushes could not be read, so the brushes are in name order, not the order Procreate shows them.");
  const setName = isSet ? (setTitle ?? (fileName.replace(/[_]+/g, ' ').trim() || 'Procreate brushes')) : brushes[0].name;
  return { ok: true, format: 'procreate', setName, brushes, notes };
}

/** A `.brush`: one Procreate brush (a set that was renamed is read as a set). */
export function readProcreateFile(bytes: Uint8Array, fileName: string): ImportResult {
  return readZipBrushes(bytes, fileName, false);
}

/** A `.brushset`: many Procreate brushes, one folder each. */
export function readBrushsetFile(bytes: Uint8Array, fileName: string): ImportResult {
  return readZipBrushes(bytes, fileName, true);
}
