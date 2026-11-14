// Cutting a picture into cells: a grid (by cell size, or by how many rows and columns, with a margin around and spacing
// between), or by the empty gutters between the sprites. Plain functions on RGBA pixels.
import type { RawImage } from '../../io/png';

export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Which row and column of the picture it came from (for the order and for "a row is an animation"). */
  row: number;
  col: number;
  /** From a JSON that comes with the picture. */
  name?: string;
  /** Milliseconds it shows, from a JSON or a GIF. */
  delay?: number;
  /** The whole frame this was cut from, when a tool trimmed it (the cell sits at `offset` inside it). */
  source?: { w: number; h: number };
  offset?: { x: number; y: number };
  /** A turn a packing tool applied (the picture holds the cell turned a quarter clockwise). */
  rotated?: boolean;
  pivot?: { x: number; y: number };
}

export interface Size {
  w: number;
  h: number;
}

// ---------------------------------------------------------------- grid

export interface GridSpec {
  /** `size`: cells are cellW x cellH and as many as fit. `count`: the picture is cut into cols x rows. */
  by: 'size' | 'count';
  cellW: number;
  cellH: number;
  cols: number;
  rows: number;
  /** Empty border around the whole grid, and empty space between cells. */
  margin: number;
  spacing: number;
}

export const defaultGrid = (w: number, h: number): GridSpec => ({ by: 'size', cellW: Math.min(w, 32), cellH: Math.min(h, 32), cols: 1, rows: 1, margin: 0, spacing: 0 });

const whole = (n: number): number => Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));

/** How many columns and rows a grid has, and the size of a cell, for a picture of this size. */
export function gridShape(imgW: number, imgH: number, g: GridSpec): { cols: number; rows: number; cellW: number; cellH: number } {
  const m = whole(g.margin);
  const sp = whole(g.spacing);
  const availW = Math.max(0, imgW - 2 * m);
  const availH = Math.max(0, imgH - 2 * m);
  if (g.by === 'count') {
    const cols = Math.max(1, whole(g.cols));
    const rows = Math.max(1, whole(g.rows));
    return { cols, rows, cellW: Math.max(0, Math.floor((availW - sp * (cols - 1)) / cols)), cellH: Math.max(0, Math.floor((availH - sp * (rows - 1)) / rows)) };
  }
  const cellW = Math.max(1, whole(g.cellW));
  const cellH = Math.max(1, whole(g.cellH));
  return { cols: Math.max(0, Math.floor((availW + sp) / (cellW + sp))), rows: Math.max(0, Math.floor((availH + sp) / (cellH + sp))), cellW, cellH };
}

/** The cells of a grid, row by row. */
export function gridCells(imgW: number, imgH: number, g: GridSpec): Cell[] {
  const { cols, rows, cellW, cellH } = gridShape(imgW, imgH, g);
  const m = whole(g.margin);
  const sp = whole(g.spacing);
  const cells: Cell[] = [];
  if (cellW < 1 || cellH < 1) return cells;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ x: m + c * (cellW + sp), y: m + r * (cellH + sp), w: cellW, h: cellH, row: r, col: c });
  return cells;
}

// ---------------------------------------------------------------- finding sprites by their gutters

export interface AutoSpec {
  /** What counts as empty: transparent pixels, the colour of the top left corner, or whichever the picture has. */
  background: 'auto' | 'transparent' | 'corner';
  /** Empty rows or columns in a row it takes to split two sprites (1 or more). */
  gutter: number;
  /** Cut each cell down to its own pixels, also up and down (else cells in a row share the row's top and bottom). */
  tight: boolean;
  /** Pieces smaller than this many pixels across are specks and left out. */
  minSize: number;
}

export const defaultAuto = (): AutoSpec => ({ background: 'auto', gutter: 1, tight: false, minSize: 1 });

/** Which pixels are empty (1) for a picture and a background rule. */
export function emptyMask(img: RawImage, background: AutoSpec['background']): Uint8Array {
  const { width, height, pixels } = img;
  const n = width * height;
  const mask = new Uint8Array(n);
  let rule = background;
  if (rule === 'auto') {
    rule = 'corner';
    for (let i = 3; i < n * 4; i += 4)
      if (pixels[i] === 0) {
        rule = 'transparent';
        break;
      }
  }
  if (rule === 'transparent') {
    for (let i = 0; i < n; i++) mask[i] = pixels[i * 4 + 3] === 0 ? 1 : 0;
  } else {
    const [r, g, b, a] = [pixels[0], pixels[1], pixels[2], pixels[3]];
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      mask[i] = pixels[o + 3] === 0 && a === 0 ? 1 : pixels[o] === r && pixels[o + 1] === g && pixels[o + 2] === b && pixels[o + 3] === a ? 1 : 0;
    }
  }
  return mask;
}

/** Runs of `true` in a list, joined when the gap between them is shorter than `gap`. */
function runs(has: boolean[], gap: number): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  let last = -1;
  for (let i = 0; i < has.length; i++) {
    if (!has[i]) continue;
    if (start < 0) start = last = i;
    else if (i - last - 1 >= gap) {
      out.push([start, last]);
      start = i;
    }
    last = i;
  }
  if (start >= 0) out.push([start, last]);
  return out;
}

/** Finds the sprites by the empty gutters between them: first the rows, then the sprites along each row. */
export function autoCells(img: RawImage, spec: AutoSpec = defaultAuto()): Cell[] {
  const { width, height } = img;
  const empty = emptyMask(img, spec.background);
  const gap = Math.max(1, whole(spec.gutter));
  const rowHas: boolean[] = new Array(height).fill(false);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (!empty[y * width + x]) {
    rowHas[y] = true;
    break;
  }
  const cells: Cell[] = [];
  let row = 0;
  for (const [y0, y1] of runs(rowHas, gap)) {
    const colHas: boolean[] = new Array(width).fill(false);
    for (let x = 0; x < width; x++) for (let y = y0; y <= y1; y++) if (!empty[y * width + x]) {
      colHas[x] = true;
      break;
    }
    const found: Cell[] = [];
    for (const [x0, x1] of runs(colHas, gap)) {
      let tightTop = y0;
      let tightBottom = y1;
      const rows = (y: number) => {
        for (let x = x0; x <= x1; x++) if (!empty[y * width + x]) return true;
        return false;
      };
      while (tightTop < tightBottom && !rows(tightTop)) tightTop++;
      while (tightBottom > tightTop && !rows(tightBottom)) tightBottom--;
      const top = spec.tight ? tightTop : y0;
      const bottom = spec.tight ? tightBottom : y1;
      const w = x1 - x0 + 1;
      const h = bottom - top + 1;
      if (Math.max(w, tightBottom - tightTop + 1) < Math.max(1, spec.minSize)) continue;
      found.push({ x: x0, y: top, w, h, row, col: found.length });
    }
    if (found.length) {
      cells.push(...found);
      row++;
    }
  }
  return cells;
}

// ---------------------------------------------------------------- order and cutting

export type CellOrder = 'rows' | 'columns' | 'rows-back' | 'columns-back';

export const ORDERS: { id: CellOrder; label: string }[] = [
  { id: 'rows', label: 'Left to right, top to bottom' },
  { id: 'columns', label: 'Top to bottom, left to right' },
  { id: 'rows-back', label: 'Right to left, bottom to top' },
  { id: 'columns-back', label: 'Bottom to top, right to left' },
];

/** The cells in the order the frames should play. The first of each pair is the main direction. */
export function orderCells<T extends Pick<Cell, 'row' | 'col'>>(cells: T[], order: CellOrder): T[] {
  const byRows = (a: T, b: T) => a.row - b.row || a.col - b.col;
  const byCols = (a: T, b: T) => a.col - b.col || a.row - b.row;
  const list = [...cells];
  if (order === 'rows') return list.sort(byRows);
  if (order === 'columns') return list.sort(byCols);
  if (order === 'rows-back') return list.sort(byRows).reverse();
  return list.sort(byCols).reverse();
}

/** The pixels of one cell, as its own picture. */
export function cutCell(img: RawImage, c: { x: number; y: number; w: number; h: number }): RawImage {
  const out = new Uint8ClampedArray(c.w * c.h * 4);
  for (let y = 0; y < c.h; y++) {
    const sy = c.y + y;
    if (sy < 0 || sy >= img.height) continue;
    for (let x = 0; x < c.w; x++) {
      const sx = c.x + x;
      if (sx < 0 || sx >= img.width) continue;
      const s = (sy * img.width + sx) * 4;
      const o = (y * c.w + x) * 4;
      out[o] = img.pixels[s];
      out[o + 1] = img.pixels[s + 1];
      out[o + 2] = img.pixels[s + 2];
      out[o + 3] = img.pixels[s + 3];
    }
  }
  return { width: c.w, height: c.h, pixels: out };
}

/** A quarter turn counter-clockwise: undoes what a packing tool means by "rotated". */
export function unrotate(img: RawImage): RawImage {
  const { width: w, height: h } = img;
  const out = new Uint8ClampedArray(w * h * 4);
  // Stored turned clockwise: the new picture is h wide and w tall.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = y;
      const ny = w - 1 - x;
      out.set(img.pixels.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (ny * h + nx) * 4);
    }
  return { width: h, height: w, pixels: out };
}

export const isBlank = (img: RawImage, empty: 'transparent' | Uint8Array = 'transparent', origin?: { x: number; y: number; w: number; h: number }): boolean => {
  if (empty === 'transparent') {
    for (let i = 3; i < img.pixels.length; i += 4) if (img.pixels[i] !== 0) return false;
    return true;
  }
  const o = origin ?? { x: 0, y: 0, w: img.width, h: img.height };
  for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) if (!empty[y * img.width + x]) return false;
  return true;
};

// ---------------------------------------------------------------- putting cells on equal frames

export type Align = 'top-left' | 'centre' | 'bottom';

export const ALIGNS: { id: Align; label: string }[] = [
  { id: 'bottom', label: 'Bottom middle (feet line up)' },
  { id: 'centre', label: 'Middle' },
  { id: 'top-left', label: 'Top left' },
];

/** Puts pictures of different sizes on frames of one size, each placed by `align`. Same-sized pictures are unchanged. */
export function onEqualFrames(images: RawImage[], align: Align, size?: Size): RawImage[] {
  const w = size?.w ?? Math.max(1, ...images.map((i) => i.width));
  const h = size?.h ?? Math.max(1, ...images.map((i) => i.height));
  return images.map((img) => {
    if (img.width === w && img.height === h) return img;
    const out = new Uint8ClampedArray(w * h * 4);
    const ox = align === 'top-left' ? 0 : Math.floor((w - img.width) / 2);
    const oy = align === 'bottom' ? h - img.height : align === 'centre' ? Math.floor((h - img.height) / 2) : 0;
    for (let y = 0; y < img.height; y++) {
      const ty = y + oy;
      if (ty < 0 || ty >= h) continue;
      for (let x = 0; x < img.width; x++) {
        const tx = x + ox;
        if (tx < 0 || tx >= w) continue;
        out.set(img.pixels.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4), (ty * w + tx) * 4);
      }
    }
    return { width: w, height: h, pixels: out };
  });
}

// ---------------------------------------------------------------- guessing

/**
 * Does this still picture look like a sprite sheet? When the gutters give three or more pieces of about the same size,
 * yes: cutting by gutters is the way to start. Otherwise it is one picture.
 */
export function looksLikeSheet(img: RawImage): boolean {
  const cells = autoCells(img, defaultAuto());
  if (cells.length < 3 || cells.length > 4096) return false;
  const widths = cells.map((c) => c.w);
  const heights = cells.map((c) => c.h);
  const near = (list: number[]) => Math.max(...list) <= Math.min(...list) * 1.5 + 2;
  return near(widths) && near(heights);
}
