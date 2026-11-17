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
import { pictureFromPixels } from '../../dab/texturePicture';
import { parsePlist, PlistDate, Uid, unarchive, type PlistDict, type PlistValue } from './bplist';
import { decodeTipPng } from './krita';
import { tipFrom, type PixelReader } from './tip';
import { BrushProblem, plural, type ImportedBrush, type ImportResult } from './types';
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
 * How much of a Procreate paper's depth a stand in paper takes. Procreate's own papers are gentler at the same number
 * than Frameling's, so a 6B pencil at full depth came out as a dotted scrape rather than a gritty line. Settled by eye
 * against Procreate's own picture of the 6B Pencil and the Sketch pencil. It came down from 0.7 once a paper that
 * stays put began holding the whole stroke back rather than each dab (see stroke.ts): the speckles now stay open on
 * their own, so the paper no longer has to be deep to keep them.
 */
const GRAIN_DEPTH_SHARE = 0.45;

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
 * A paper whose words say nothing about tooth (splatters, drips) gets no stand in: Shenbot's Inking Pen names
 * "Brush-Artery-Splatters.png" and Procreate's own picture of its stroke is smooth, so guessing a paper there made the
 * pens speckly in a way the file never asked for.
 */
const PAPER_STAND_INS: { words: RegExp; paper: PaperKind; what: string }[] = [
  // Frameling's papers are tooth on the page, the same size whatever brush crosses them, while Procreate's grain is
  // scaled to the brush. So the paper is picked by how the stroke reads, not by the name: the fine tooth is what grit
  // looks like under a pencil, and the coarse ones come out as blobs at any brush size worth drawing with. Settled by
  // eye against Procreate's own picture of the 6B Pencil (139 pixels across) and the Sketch pencil (17).
  { words: /charcoal|coarse|corse|rough|grit|chalk|sand|noise|grain|graphite|pencil|concrete|stone|gravel/i, paper: 'fine', what: 'a gritty paper' },
  { words: /pastel|canvas|cotton|linen|watercolou?r|laid|weave|paper|cloth/i, paper: 'laid', what: 'a paper with a weave' },
];

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
  const paint = (i: number): number => ((inverted ? 255 - lum(i) : lum(i)) * px[i + 3]) / 255;
  // A tip that is white all over (some brushes paint with a plain square) is a square, not a picture of one.
  let weakest = 255;
  for (let i = 0; i < px.length && weakest > 250; i += 4) weakest = Math.min(weakest, paint(i));
  const read: PixelReader = (x, y, out) => {
    out[0] = out[1] = out[2] = 0;
    out[3] = paint((y * w + x) * 4);
  };
  if (weakest > 250) return { solid: true as const, w, h };
  return { solid: false as const, w, h, tip: tipFrom(w, h, read, false) };
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
function strokeWidth(png: Uint8Array, budget: Budget): number | null {
  const { w, h, px } = decodeTipPng(png);
  budget.spend(w * h);
  if (w < 8 || h < 8) return null;
  const runs: number[] = [];
  for (let x = 0; x < w; x++) {
    let best = 0;
    let run = 0;
    for (let y = 0; y < h; y++) {
      if (px[(y * w + x) * 4 + 3] > 12) {
        run++;
        if (run > best) best = run;
      } else run = 0;
    }
    if (best > 0) runs.push(best);
  }
  if (runs.length < 8) return null;
  runs.sort((a, b) => a - b);
  const wide = runs[Math.floor(runs.length * 0.9)];
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
  { words: ['Opacity'], to: 'flow', what: 'opacity' },
  { words: ['Hue'], to: 'hue', what: 'hue' },
  { words: ['Saturation'], to: 'saturation', what: 'saturation' },
  { words: ['Brightness', 'Lightness'], to: 'lightness', what: 'brightness' },
];

/** Settings that Frameling has nothing for, said only when the brush really uses them (more than this). */
const DROPS: { keys: string[]; flag?: boolean; over?: number; words: string }[] = [
  { keys: ['taperStartLength', 'taperEndLength', 'pencilTaperStartLength', 'pencilTaperEndLength'], over: 0.001, words: 'Its taper (the line thinning out at the start and end of a stroke).' },
  { keys: ['shapeCount', 'shapeCountJitter'], over: 0.001, words: 'Its count (several stamps at each spot).' },
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
  if (pics.shape) {
    const t = shapeTip(pics.shape, inverted, budget);
    if (t.solid) {
      raw.tip = 'square';
      raw.hardness = 1;
    } else {
      raw.tip = 'picture';
      raw.picture = t.tip.stamp;
      share = clamp(t.tip.size / Math.max(t.w, t.h), 0.02, 1);
      if (t.tip.shrunk) changed.push(`Its tip picture was shrunk from ${t.w} by ${t.h} to ${t.tip.stamp.w} by ${t.tip.stamp.h} pixels, the most a picture tip holds, so fine detail is lost.`);
    }
  } else {
    raw.tip = 'round';
    raw.hardness = 1;
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
  let measured: number | null = null;
  if (pics.thumb) {
    try {
      const wide = strokeWidth(pics.thumb, budget);
      if (wide !== null) measured = Math.round(clamp(wide / across, MIN_SIZE, MAX_SIZE));
    } catch (e) {
      if (!(e instanceof BrushProblem)) throw e;
    }
  }
  const wanted = Math.round(paintSize * PIXELS_PER_SIZE * share);
  raw.size = measured ?? Math.max(MIN_SIZE, wanted);
  if (measured !== null)
    changed.push(
      `It came ${measured} pixels across, measured off Procreate's own picture of the stroke in the file. Procreate's size is a share of its own slider and never says how many pixels it is, so the picture is the closest thing to an answer the file has. Set the size you want after it lands.`,
    );
  else if (wanted < MIN_SIZE) changed.push(`It asked for a brush ${wanted} pixel${wanted === 1 ? '' : 's'} across, too small to draw with, so it came at ${MIN_SIZE}. Procreate's sizes are a share of its own slider and do not say how many pixels they are, so set the size you want after it lands.`);
  // Procreate counts spacing and scatter in the whole tip picture; ours count in the part you can see, which is `share` of it.
  const spacing = s.num('plotSpacing', 0.1);
  raw.spacing = spacing / share;
  if ((raw.spacing as number) > 4) changed.push(`Its spacing of ${pct(spacing)} was wider than Frameling goes, so it came at the widest, 400%.`);
  if (s.num('plotSpacingVersion', 0) >= 1 && (raw.spacing as number) > 0.06) changed.push('This file keeps its spacing the way newer Procreate does. That has not been checked, so the dabs may sit closer or further apart than in Procreate.');
  // How far a dab lands off the line, and this is the part that used to make inking pens arrive as wide clouds.
  //
  // `shapeScatter` is not a share of the brush width on its own: it goes with the spacing. Procreate's own picture of
  // the stroke, which every .brush file carries, settles it both ways. Sequins has shapeScatter 0.877 with the dabs a
  // whole width apart, and its sequins really do sit above and below the line. Shenbot's Dry Ink v2 has shapeScatter 1,
  // more than Sequins, with spacing 0, and its stroke is a clean thin tapered line with nothing off it. The same
  // number cannot mean the same throw in both. Multiplying by the spacing fits every real file seen: a brush whose
  // dabs sit on top of each other has nowhere to scatter to, and one that stamps a shape every width or so scatters
  // as far as the gap. It also leaves Sequins where it was measured, because its spacing is almost exactly 1.
  //
  // This is a model fitted to the real files, not something Procreate documents, so the brush says so.
  const rawSpacing = s.num('plotSpacing', 0.1);
  let scatter = (s.num('shapeScatter', 0) * rawSpacing) / share;
  const jitter = s.num('plotJitter', 0);
  if (jitter > 0.001) {
    scatter += (jitter * rawSpacing) / share;
    changed.push('Its jitter came as scatter, which spreads dabs in every direction, not only across the line.');
  }
  raw.scatter = clamp(scatter, 0, 2);
  if (scatter > 0.01) changed.push("How far its dabs land off the line was worked out from the scatter and the spacing together, matched against Procreate's own picture of the stroke in the file. Procreate does not say how it does this, so a very scattered brush may sit differently.");
  if (scatter > 2) changed.push('Its scatter was more than Frameling goes, so it came at the most, 200%.');
  const rot = s.num('shapeRotation', 0);
  if (rot >= 0.5) raw.follow = true;
  if (rot > 0.01 && rot < 0.99) changed.push(`Its tip follows the line ${pct(rot)} of the way; Frameling's tip either follows it or does not, so it came as ${rot >= 0.5 ? 'following' : 'not following'}.`);
  // Procreate's scatter turns the tip as well as throwing it. Its own pictures say so: Cat Thorne's sequins lie at a
  // different angle in every stamp, and Graphite ink, whose tip is a page of little scratches, draws a cloud of specks
  // rather than the rows of combed scratches an unturned tip gives. A brush that leaves scatter alone (Plain Stitch)
  // keeps its stitches lined up along the line. Frameling turns a tip at random or not at all, so any scatter at all
  // means the whole way round.
  if (s.bool('shapeRandomise') || (s.num('shapeScatter', 0) > 0.01 && !raw.follow)) {
    raw.angleJitter = 1;
    changed.push('Its tip is turned at random for every dab. Frameling turns a tip the whole way round or not at all, so a brush that only turned its tip a little now turns it the whole way.');
  }
  const fixed = s.num('shapeAngle', 0);
  if (Math.abs(fixed) > 0.001) dropped.push('Its fixed tip angle. Frameling has not seen how Procreate stores it, so the tip came at its own angle.');

  // ---- opacity and what the pen does
  raw.opacity = clamp(s.num('paintOpacity', 1), 0.05, 1);
  raw.flow = 1;
  const routes: DynRoute[] = [];
  const used: string[] = [];
  let opacityRoute = false;
  for (const src of SOURCES)
    for (const tg of TARGETS) {
      const key = tg.words.map((w) => `dynamics${src.word}${w}`).find((k) => s.has(k));
      if (!key) continue;
      const v = s.num(key, 0);
      const amount = Math.abs(v);
      if (amount < 0.02) continue;
      const route: DynRoute = { from: src.from, to: tg.to, amount: Math.min(1, amount), invert: v < 0 };
      const curve = cleanCurve(s.curve(`${key}Curve`));
      if (curve) route.curve = curve;
      if (routes.length >= MAX_ROUTES) {
        dropped.push(`Its ${src.what} control of ${tg.what}: Frameling holds at most ${MAX_ROUTES} pen controls.`);
        continue;
      }
      routes.push(route);
      used.push(`${src.what} on ${tg.what}`);
      if (tg.to === 'flow') opacityRoute = true;
    }
  raw.dynamics = routes;
  if (used.length)
    changed.push(`Its pen controls (${used.slice(0, 6).join(', ')}${used.length > 6 ? ', and more' : ''}) are read by their names only: they have not been checked against Procreate, so they may feel different.${opacityRoute ? ' Opacity controls came as flow ones: the paint thins per dab, so on a brush with close dabs a fade is shorter than in Procreate.' : ''}`);
  const jSize = Math.abs(s.num('dynamicsJitterSize', 0));
  if (jSize >= 0.02) raw.sizeJitter = Math.min(1, jSize);
  const jOpacity = Math.abs(s.num('dynamicsJitterOpacity', 0));
  if (jOpacity >= 0.02 && routes.length < MAX_ROUTES) {
    routes.push({ from: 'random', to: 'flow', amount: Math.min(1, jOpacity), invert: false });
    changed.push('Its opacity jitter came as flow jitter.');
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
      const r = pictureFromPixels(g.w, g.h, g.px);
      if (r.ok) {
        raw.grain = {
          picture: r.picture,
          ...(s.bool('textureInverted') ? { invert: true } : {}),
          depth: clamp(s.num('grainDepth', 0.8), 0, 1),
          scale: clamp(Math.round(s.num('textureScale', 1)), 1, 8),
          moving: s.num('textureMovement', 0) >= 0.5,
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
        paper: stand.paper,
        depth: clamp(s.num('grainDepth', 1) * GRAIN_DEPTH_SHARE, 0.1, 1),
        scale: clamp(Math.round(s.num('textureScale', 1)), 1, 8),
        // A stand in paper stays put. Frameling's moving grain picks a fresh spot on the paper for every dab, and a
        // pencil lays its dabs a twentieth of its width apart, so a moving paper averages itself away to a solid line.
        moving: false,
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
