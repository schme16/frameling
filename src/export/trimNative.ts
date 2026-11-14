/**
 * Lines that draw themselves, kept as one line with a moving trim in the formats that have one: Lottie's trim path and
 * animated SVG's stroke-dashoffset. Pure: no DOM.
 *
 * `nativeTrim` says whether one path shape across the frames of a run is the same line with only its trim changing, and
 * if so gives the line once (trim off) with the trim of each frame. Anything else (a line that also changes shape, has
 * arrow heads or a changing width, several outlines) is drawn frame by frame as before, which is still vector.
 */
import type { PathShape, Shape, SubPath, Trim } from '../core/format';
import { sameTrim, trimActive, trimWindows } from '../geometry/trim';

export interface NativeTrim {
  /** The line with its trim taken off. */
  base: PathShape;
  /** The trim on each frame (undefined = the whole line). */
  trims: (Trim | undefined)[];
}

export interface NativeOptions {
  /** The format can dash the same line while it trims (Lottie), or not (SVG uses the dashes for the trim). */
  dash: boolean;
  /** The format's trim also cuts a fill (Lottie), so a filled shape can't use it. */
  noFill: boolean;
  /** The format wraps an open line's slide round (Lottie), so a slid open line can't use it. */
  noOpenSlide: boolean;
}

const usable = (sp: SubPath | undefined): sp is SubPath => !!sp && sp.points.length >= 2;

export function nativeTrim(shapes: readonly Shape[], opts: NativeOptions): NativeTrim | null {
  const first = shapes[0];
  if (!first || first.type !== 'path' || !first.stroke || first.paths.length !== 1 || !usable(first.paths[0])) return null;
  const closed = first.paths[0].closed && first.paths[0].points.length > 2;
  const trims: (Trim | undefined)[] = [];
  const rest = (s: PathShape) => JSON.stringify({ ...s, id: 0, paths: 0, stroke: { ...s.stroke, trim: undefined } });
  const want = rest(first);
  for (const s of shapes) {
    if (s.type !== 'path' || !s.stroke || (s.paths !== first.paths && JSON.stringify(s.paths) !== JSON.stringify(first.paths))) return null;
    if (rest(s) !== want) return null;
    trims.push(s.stroke.trim);
  }
  const st = first.stroke;
  if (st.arrowStart || st.arrowEnd || (st.widths && st.widths.length)) return null;
  if (!opts.dash && st.dash && st.dash.length) return null;
  if (opts.noFill && (first.fill || first.fillGradient)) return null;
  if (!trims.some((t) => trimActive(t)) || trims.every((t) => sameTrim(t, trims[0]))) return null;
  if (opts.noOpenSlide && !closed && trims.some((t) => t && Math.abs(t.offset) > 1e-9)) return null;
  const { trim: _t, ...plain } = st;
  return { base: { ...first, stroke: plain }, trims };
}

/** The window of a trim on one line as [from, to, length] in fractions, or null when nothing shows. A wrapped loop window is one piece that runs on past the end. */
export function trimSpan(t: Trim | undefined, closed: boolean): { from: number; len: number } | null {
  if (!trimActive(t)) return { from: 0, len: 1 };
  const w = trimWindows(t, closed);
  if (!w.length) return null;
  if (w.length === 2) return { from: w[0][0], len: 1 - w[0][0] + w[1][1] };
  return { from: w[0][0], len: w[0][1] - w[0][0] };
}
