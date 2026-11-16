// GIMP brushes: .gbr (a picture), .gih (a pipe of pictures) and .vbr (a brush made from numbers). Read from the
// descriptions GIMP publishes in its source tree (devel-docs/gbr.txt, gih.txt and vbr.txt) and checked against the brushes
// that come with GIMP, never from GIMP's loader code (that is GPL, and Frameling is MIT). Pure, no DOM.
import { cleanDab, type DabBrush } from '../../dab/maths';
import { Reader, textOf } from './bytes';
import { tipFrom, type PixelReader } from './tip';
import { BrushProblem, plural, type ImportedBrush, type ImportResult } from './types';

/** No side of a picture is longer than this, however big the file says it is. */
const MAX_SIDE = 16384;
const MAX_NAME_BYTES = 1024;
const MAX_HEADER = 4096;

interface Gbr {
  name: string;
  w: number;
  h: number;
  /** 1 grey shape, 2 grey with see-through, 3 colour, 4 colour with see-through. */
  bytes: number;
  /** Percent of the width. */
  spacing: number;
  version: number;
  data: Uint8Array;
}

/** One .gbr from `pos`. Returns it and where the next thing starts (a .gih keeps several end to end). `keepData` false skips the pixels. */
function readGbr(r: Reader, keepData = true): Gbr {
  const headerSize = r.u32();
  const version = r.u32();
  if (version === 3) throw new BrushProblem('That is a CinePaint (FilmGimp) brush with 16-bit float pixels. Frameling reads the ordinary GIMP .gbr only.');
  if (version !== 1 && version !== 2) throw new BrushProblem(`That does not look like a GIMP brush (it says it is version ${version}).`);
  const fixed = version === 1 ? 20 : 28;
  if (headerSize < fixed || headerSize > fixed + MAX_NAME_BYTES || headerSize > MAX_HEADER) throw new BrushProblem('That GIMP brush has a damaged header.');
  const w = r.u32();
  const h = r.u32();
  const bytes = r.u32();
  if (!(w >= 1 && h >= 1) || w > MAX_SIDE || h > MAX_SIDE) throw new BrushProblem(`That GIMP brush says it is ${w} by ${h} pixels, which can't be right.`);
  if (bytes < 1 || bytes > 4) throw new BrushProblem('That GIMP brush stores its pixels in a way Frameling does not read (it reads grey and colour ones).');
  let spacing = 20;
  if (version === 2) {
    if (r.tag() !== 'GIMP') throw new BrushProblem('That GIMP brush is missing its GIMP marker, so it is probably damaged.');
    spacing = r.u32();
  }
  const name = textOf(r.take(headerSize - fixed));
  const size = w * h * bytes;
  if (size > r.left) throw new BrushProblem('That GIMP brush ends before its picture does, so it is probably damaged or only partly downloaded.');
  const data = keepData ? r.take(size) : (r.skip(size), new Uint8Array(0));
  return { name, w, h, bytes, spacing, version, data };
}

function readerOf(g: Gbr): PixelReader {
  const { w, bytes, data } = g;
  return (x, y, out) => {
    const i = (y * w + x) * bytes;
    if (bytes === 1) {
      out[0] = out[1] = out[2] = 0;
      out[3] = data[i];
    } else if (bytes === 2) {
      out[0] = out[1] = out[2] = data[i];
      out[3] = data[i + 1];
    } else {
      out[0] = data[i];
      out[1] = data[i + 1];
      out[2] = data[i + 2];
      out[3] = bytes === 4 ? data[i + 3] : 255;
    }
  };
}

const fixName = (name: string, fallback: string): string => name || fallback;

/** A picture brush from one GIMP picture, with notes on what the conversion did. */
function brushFromGbr(g: Gbr, fallbackName: string): ImportedBrush {
  const colour = g.bytes >= 3;
  const tip = tipFrom(g.w, g.h, readerOf(g), colour);
  const changed: string[] = [];
  if (tip.shrunk) changed.push(`The picture was shrunk from ${g.w} by ${g.h} to ${tip.stamp.w} by ${tip.stamp.h} pixels, the most a picture tip holds, so fine detail is lost.`);
  if (tip.reduced) changed.push(`Its colours were cut down to ${plural(tip.stamp.colours.length, 'colour')}.`);
  const dab = cleanDab({
    tip: 'picture',
    picture: tip.stamp,
    size: tip.size,
    spacing: g.spacing / 100,
    // GIMP brushes are smooth; the person's pixel layer rules still apply when they draw.
    aliased: false,
  });
  return { name: fixName(g.name, fallbackName), dab, dropped: [], changed };
}

export function readGbrFile(bytes: Uint8Array, fileName: string): ImportResult {
  const r = new Reader(bytes, 0, 'GIMP brush');
  const g = readGbr(r);
  const brush = brushFromGbr(g, fileName);
  return { ok: true, format: 'gbr', setName: brush.name, brushes: [brush], notes: [] };
}

/** The settings line of a pipe, as words: "ncells:6 step:20 dim:1 cols:3 rows:2 rank0:6 selection:incremental". */
function pipeParams(line: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const part of line.split(/\s+/)) {
    const i = part.indexOf(':');
    if (i > 0) m.set(part.slice(0, i), part.slice(i + 1));
  }
  return m;
}

const SELECTIONS: Record<string, string> = {
  incremental: 'one after another',
  angular: 'by the direction you draw',
  random: 'at random',
  velocity: 'by how fast you draw',
  pressure: 'by how hard you press',
  xtilt: 'by how far the pen leans sideways',
  ytilt: 'by how far the pen leans up and down',
  fixed: 'by a fixed pick',
};

export function readGihFile(bytes: Uint8Array, fileName: string): ImportResult {
  // Two lines of text, then the pictures end to end.
  const lineEnd = (from: number): number => {
    const stop = Math.min(bytes.length, from + 2048);
    for (let i = from; i < stop; i++) if (bytes[i] === 10) return i;
    throw new BrushProblem('That GIMP brush pipe has a damaged header: its first lines of text never end.');
  };
  const e1 = lineEnd(0);
  const e2 = lineEnd(e1 + 1);
  const name = textOf(bytes.subarray(0, e1));
  const second = textOf(bytes.subarray(e1 + 1, e2));
  const count = parseInt(second, 10);
  if (!Number.isInteger(count) || count < 1 || count > 4096) throw new BrushProblem('That GIMP brush pipe does not say how many pictures it holds, so it is probably damaged.');
  const params = pipeParams(second.slice(String(count).length));
  const r = new Reader(bytes, e2 + 1, 'GIMP brush pipe');
  // The first picture is the brush. The rest are read only far enough to check the file is whole and to count them.
  const first = readGbr(r);
  let found = 1;
  for (; found < count; found++) readGbr(r, false);
  const brush = brushFromGbr(first, name || fileName);
  brush.name = fixName(name, brush.name);
  const how = SELECTIONS[params.get('selection') ?? ''];
  brush.dropped.push(
    `This is a pipe of ${plural(count, 'picture')}, and GIMP ${how ? `picks one ${how}` : 'switches between them'} as you paint. Frameling's brush has one tip, so only the first picture came across.`,
  );
  // The pictures vary in size within a pipe; keep the first one's size.
  return { ok: true, format: 'gih', setName: brush.name, brushes: [brush], notes: [] };
}

// ---------------------------------------------------------------- .vbr

const num = (s: string | undefined, fallback: number): number => {
  const v = s === undefined ? NaN : parseFloat(s);
  return Number.isFinite(v) ? v : fallback;
};

export function readVbrFile(bytes: Uint8Array, fileName: string): ImportResult {
  if (bytes.length > 4096) throw new BrushProblem('That is too big to be a GIMP generated brush.');
  const lines = new TextDecoder('utf-8').decode(bytes).split(/\r?\n/);
  if (lines[0]?.trim() !== 'GIMP-VBR') throw new BrushProblem('That does not look like a GIMP generated brush (it should start with GIMP-VBR).');
  const version = lines[1]?.trim();
  if (version !== '1.0' && version !== '1.5') throw new BrushProblem(`That GIMP generated brush says it is version ${version ?? '?'}, which Frameling does not read.`);
  const name = (lines[2] ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const shaped = version === '1.5';
  const shape = shaped ? (lines[3] ?? '').trim() : 'circle';
  const base = shaped ? 4 : 3;
  const spacing = num(lines[base], 20);
  const radius = num(lines[base + 1], 5);
  const spikes = shaped ? Math.round(num(lines[base + 2], 2)) : 2;
  const rest = shaped ? base + 3 : base + 2;
  const hardness = num(lines[rest], 1);
  const aspect = Math.max(1, num(lines[rest + 1], 1));
  const angle = num(lines[rest + 2], 0);
  const dropped: string[] = [];
  const changed: string[] = [];
  const tip: 'round' | 'square' = shape === 'circle' ? 'round' : 'square';
  let turn = 0;
  if (shape === 'diamond') {
    if (aspect > 1) {
      // Frameling flattens a tip before it turns it, so a flattened diamond (a rhombus) can only be a rectangle with the same box.
      changed.push('Its diamond is flattened, and Frameling has no flattened diamond: it came as a flat rectangle at the same angle.');
    } else {
      // A diamond is a square stood on its corner.
      turn = 45;
    }
    if (spikes !== 2) dropped.push(`Its ${spikes} points. GIMP draws it as a ${spikes}-pointed star; Frameling has round and square tips, so the points are gone.`);
  } else if (shape !== 'circle' && shape !== 'square') {
    dropped.push(`Its "${shape.slice(0, 20)}" shape. It came as a square.`);
  } else if (spikes !== 2) {
    dropped.push(`Its ${spikes} spikes. It came as a plain ${tip === 'round' ? 'circle' : 'square'}.`);
  }
  if (radius * 2 > 300) changed.push('It was wider than a pixel brush can be, so it came at the widest, 300 pixels.');
  // GIMP turns a tip counter-clockwise, Frameling clockwise.
  const dab: DabBrush = cleanDab({ tip, size: radius * 2, hardness, roundness: 1 / aspect, angle: -(angle + turn), spacing: spacing / 100, aliased: false });
  const brush: ImportedBrush = { name: fixName(name, fileName), dab, dropped, changed };
  return { ok: true, format: 'vbr', setName: brush.name, brushes: [brush], notes: [] };
}
