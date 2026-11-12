/**
 * Turns a parsed Aseprite file into pieces of a Frameling document: layers, folders, drawings, clips, palette, tiles.
 * Pure data in and out (no DOM, no store). `asepriteDoc` makes a whole new document; `mergePieces` adds the pieces to
 * a draft of an open one. Everything that could not be carried over exactly is said in `notes`, in plain words.
 */
import { newDoc, uid } from '../core/doc';
import {
  TILE_FLIP_D,
  TILE_FLIP_X,
  TILE_FLIP_Y,
  type BlendMode,
  type Cel,
  type Clip,
  type Doc,
  type DocPalette,
  type Drawing,
  type Ext,
  type Id,
  type Layer,
  type LayerFolder,
  type PixelDrawing,
  type Tile,
  type Tileset,
} from '../core/format';
import { LAYER_GROUP, LAYER_TILEMAP, AsepriteProblem, imageRgba, paletteAt, type AseCel, type AseColor, type AseFile, type AseImage, type AseLayer, type AseTileset } from './parse';

export const MAX_FRAMES = 10000;
/** The most pixel memory an import may ask for. */
const MAX_PIXEL_BYTES = 1024 * 1024 * 1024;

const BLEND_NAMES = ['Normal', 'Multiply', 'Screen', 'Overlay', 'Darken', 'Lighten', 'Color Dodge', 'Color Burn', 'Hard Light', 'Soft Light', 'Difference', 'Exclusion', 'Hue', 'Saturation', 'Color', 'Luminosity', 'Addition', 'Subtract', 'Divide'];
const BLEND_MODES: (BlendMode | null)[] = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'add', null, null];
const DIRECTIONS = ['forward', 'reverse', 'ping-pong', 'ping-pong reverse'];

/** Frameling's blend mode for Aseprite's (null when there is none). */
export function blendFor(n: number): BlendMode | null {
  return n >= 0 && n < BLEND_MODES.length ? BLEND_MODES[n] : null;
}
export const blendName = (n: number): string => BLEND_NAMES[n] ?? `mode ${n}`;

// ---------------------------------------------------------------- timing

export interface Timing {
  fps: number;
  /** First Frameling frame of each Aseprite frame. */
  starts: number[];
  /** How many Frameling frames each Aseprite frame is held for. */
  holds: number[];
  length: number;
  /** Frames whose time came out more than 1 ms off, and the worst miss. */
  off: number;
  worst: number;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

function fit(durs: number[], fps: number): Timing {
  const n = durs.length;
  const starts: number[] = [];
  let cum = 0;
  let prev = -1;
  for (let i = 0; i < n; i++) {
    const s = Math.max(prev + 1, Math.round((cum * fps) / 1000));
    starts.push(s);
    prev = s;
    cum += durs[i];
  }
  const total = Math.max(starts[n - 1] + 1, Math.round((cum * fps) / 1000));
  const holds = starts.map((s, i) => (i + 1 < n ? starts[i + 1] : total) - s);
  let off = 0;
  let worst = 0;
  const tick = 1000 / fps;
  holds.forEach((h, i) => {
    const e = Math.abs(h * tick - durs[i]);
    if (e > 1) off++;
    worst = Math.max(worst, e);
  });
  return { fps, starts, holds, length: total, off, worst };
}

/**
 * Picks the frame rate and how long each frame is held. With `fixedFps` (adding to a drawing that has its own rate)
 * that rate is used; otherwise the rate that reproduces every duration within a millisecond with the fewest frames,
 * else the one nearest the most common duration.
 */
export function planTiming(durs: number[], fixedFps?: number): Timing {
  if (fixedFps) return fit(durs, fixedFps);
  const counts = new Map<number, number>();
  for (const d of durs) counts.set(d, (counts.get(d) ?? 0) + 1);
  const mode = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  const clampFps = (x: number) => Math.max(1, Math.min(120, Math.round(x)));
  const g = durs.reduce(gcd, 0);
  const cands = new Set<number>([clampFps(1000 / mode), clampFps(1000 / g)]);
  for (const d of counts.keys()) if (counts.size <= 6) cands.add(clampFps(1000 / d));
  const fits = [...cands].map((f) => fit(durs, f)).filter((t) => t.length <= MAX_FRAMES);
  if (!fits.length) return fit(durs, clampFps(1000 / mode));
  const exact = fits.filter((t) => t.off === 0).sort((a, b) => a.length - b.length || a.fps - b.fps);
  if (exact.length) {
    // The mode rate wins ties so ordinary files keep the rate people expect.
    const modeFps = clampFps(1000 / mode);
    return exact.find((t) => t.fps === modeFps && t.length === exact[0].length) ?? exact[0];
  }
  const sum = (t: Timing) => t.worst * 1000 + t.off;
  return fits.sort((a, b) => sum(a) - sum(b) || a.fps - b.fps)[0];
}

// ---------------------------------------------------------------- pixels

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

export function paletteColors(p: AseColor[]): string[] {
  return p.map((c) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${c.a === 255 ? '' : hex2(c.a)}`);
}

/** Scales an RGBA image with bilinear sampling (colour weighted by alpha). */
export function scaleRgba(src: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const fy = Math.max(0, Math.min(sh - 1, ((y + 0.5) * sh) / dh - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.max(0, Math.min(sw - 1, ((x + 0.5) * sw) / dw - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      let a = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [px, py, w] of [
        [x0, y0, (1 - tx) * (1 - ty)],
        [x1, y0, tx * (1 - ty)],
        [x0, y1, (1 - tx) * ty],
        [x1, y1, tx * ty],
      ] as const) {
        const o = (py * sw + px) * 4;
        const wa = w * src[o + 3];
        a += wa;
        r += src[o] * wa;
        g += src[o + 1] * wa;
        b += src[o + 2] * wa;
      }
      const o = (y * dw + x) * 4;
      if (a > 0) {
        out[o] = r / a;
        out[o + 1] = g / a;
        out[o + 2] = b / a;
        out[o + 3] = a;
      }
    }
  }
  return out;
}

/** Draws one cel's RGBA into a canvas-sized drawing at (x, y), with its opacity baked into the alpha. Returns true when something was cropped. */
function place(dst: Uint8ClampedArray, dw: number, dh: number, src: Uint8ClampedArray, sw: number, sh: number, x: number, y: number, opacity: number): boolean {
  let cropped = false;
  for (let j = 0; j < sh; j++) {
    const ty = y + j;
    for (let i = 0; i < sw; i++) {
      const s = (j * sw + i) * 4;
      const a = src[s + 3];
      if (!a) continue;
      const tx = x + i;
      if (tx < 0 || ty < 0 || tx >= dw || ty >= dh) {
        cropped = true;
        continue;
      }
      const o = (ty * dw + tx) * 4;
      dst[o] = src[s];
      dst[o + 1] = src[s + 1];
      dst[o + 2] = src[s + 2];
      dst[o + 3] = opacity === 255 ? a : Math.round((a * opacity) / 255);
    }
  }
  return cropped;
}

/** Turns a tile's flags into Frameling's. */
function flagsOf(v: number, t: { flipX: number; flipY: number; flipD: number }): number {
  let f = 0;
  if (t.flipX && v & t.flipX) f |= TILE_FLIP_X;
  if (t.flipY && v & t.flipY) f |= TILE_FLIP_Y;
  if (t.flipD && v & t.flipD) f |= TILE_FLIP_D;
  return f >>> 0;
}

/** Copies a tile into an RGBA image at a slot, turned as the flags say (a diagonal flip needs a square tile). */
function blitTile(dst: Uint8ClampedArray, dw: number, tile: Uint8ClampedArray, tw: number, th: number, flags: number, ox: number, oy: number): void {
  const d = flags & TILE_FLIP_D && tw === th;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      let sx = x;
      let sy = y;
      if (flags & TILE_FLIP_Y) sy = th - 1 - sy;
      if (flags & TILE_FLIP_X) sx = tw - 1 - sx;
      if (d) [sx, sy] = [sy, sx];
      const s = (sy * tw + sx) * 4;
      if (!tile[s + 3]) continue;
      const o = ((oy + y) * dw + ox + x) * 4;
      dst.set(tile.subarray(s, s + 4), o);
    }
  }
}

// ---------------------------------------------------------------- building

export interface Target {
  width: number;
  height: number;
  /** A fixed frame rate (adding to an open drawing). */
  fps?: number;
  /** The open drawing's tiles, when adding: new tiles get keys after its own, and must be the same size. */
  tileset?: Pick<Tileset, 'tileWidth' | 'tileHeight' | 'nextKey'>;
}

export interface Pieces {
  width: number;
  height: number;
  fps: number;
  length: number;
  layers: Layer[];
  folders: Record<Id, LayerFolder>;
  drawings: Record<Id, Drawing>;
  clips: Clip[];
  palette?: DocPalette;
  /** Tiles to add (with the size they are, and the next free key after them). */
  tiles?: { tileWidth: number; tileHeight: number; tiles: Tile[]; nextKey: number };
  ext: Ext;
  notes: string[];
}

const plain = (s: string): string => s.replace(/[\r\n]+/g, ' ').trim();

export function asepritePieces(file: AseFile, name: string, target?: Target): Pieces {
  const notes: string[] = [];
  const W = target?.width ?? file.width;
  const H = target?.height ?? file.height;
  const adding = !!target;
  const timing = planTiming(file.frames.map((f) => f.duration), target?.fps);
  if (timing.length > MAX_FRAMES) throw new AsepriteProblem(`This drawing would need ${timing.length} frames, and Frameling's limit is ${MAX_FRAMES}.`);
  if (adding && (file.width !== W || file.height !== H)) {
    notes.push(`The Aseprite canvas is ${file.width} x ${file.height} and this drawing is ${W} x ${H}, so the picture sits at the top left${file.width > W || file.height > H ? ' and anything past the edge is cropped' : ''}.`);
  }
  if (timing.off > 0) {
    notes.push(`Frame timing: Frameling plays at ${timing.fps} fps, and ${timing.off} of ${file.frames.length} frames are held for a slightly different time than in Aseprite (up to ${Math.round(timing.worst)} ms off).`);
  }

  // The palette at the first frame.
  const firstPalette = paletteAt(file, 0);
  let palette: DocPalette | undefined;
  if (firstPalette && firstPalette.length) {
    const colors = paletteColors(firstPalette);
    if (colors.length > 256) notes.push(`The palette has ${colors.length} colours and Frameling keeps the first 256.`);
    palette = { name: plain(name) || 'Aseprite palette', colors: colors.slice(0, 256) };
  }
  if (file.paletteChanges) notes.push('The palette changes partway through the animation. Each frame was drawn with its own palette, and the first one is kept as the drawing\'s palette.');
  if (file.colorProfile?.type === 2) notes.push('The file has an embedded colour profile. Frameling treats the colours as sRGB.');

  const drawings: Record<Id, Drawing> = {};
  const folders: Record<Id, LayerFolder> = {};
  const layers: Layer[] = [];
  const blendMissing = new Map<number, string[]>();
  const croppedLayers: string[] = [];
  const flattened: string[] = [];
  let zIndexed = 0;
  let scaledRefs = 0;
  let nested = 0;
  let pixelBytes = 0;

  const celOf = new Map<string, AseCel>();
  for (const f of file.frames) for (const c of f.cels) celOf.set(`${c.layer}:${c.frame}`, c);
  const source = (c: AseCel): AseCel => {
    let cur = c;
    for (let hops = 0; cur.link !== undefined && hops < 64; hops++) {
      const next = celOf.get(`${cur.layer}:${cur.link}`);
      if (!next) break;
      cur = next;
    }
    return cur;
  };

  // Tiles: the first tileset a tilemap layer uses sets the size; the rest join it when they are the same size.
  const tilesetOf = (l: AseLayer): AseTileset | undefined => file.tilesets.find((t) => t.id === l.tileset) ?? file.tilesets[l.tileset];
  let tileW = target?.tileset?.tileWidth ?? 0;
  let tileH = target?.tileset?.tileHeight ?? 0;
  if (!tileW) {
    for (const l of file.layers) {
      const ts = l.type === LAYER_TILEMAP ? tilesetOf(l) : undefined;
      if (ts && ts.tileWidth > 0 && ts.tileHeight > 0 && layerHasCels(file, l.index)) {
        tileW = ts.tileWidth;
        tileH = ts.tileHeight;
        break;
      }
    }
  }
  const tileBase = new Map<AseTileset, number>();
  const newTiles: Tile[] = [];
  let nextKey = target?.tileset?.nextKey ?? 1;
  const tileRgba = new Map<AseTileset, Uint8ClampedArray>();
  const tilesetRgba = (ts: AseTileset): Uint8ClampedArray => {
    let t = tileRgba.get(ts);
    if (!t) {
      t = ts.image ? imageRgba(file, ts.image, firstPalette) : new Uint8ClampedArray(ts.tileWidth * ts.tileHeight * ts.tileCount * 4);
      tileRgba.set(ts, t);
    }
    return t;
  };
  /** Adds a tileset's tiles on first use; returns its key offset. */
  const useTileset = (ts: AseTileset): number => {
    const have = tileBase.get(ts);
    if (have !== undefined) return have;
    const base = nextKey - 1;
    const px = tilesetRgba(ts);
    const size = ts.tileWidth * ts.tileHeight * 4;
    for (let i = ts.zeroEmpty ? 1 : 0; i < ts.tileCount; i++) {
      const d: PixelDrawing = { id: uid('p'), kind: 'pixel', width: ts.tileWidth, height: ts.tileHeight, pixels: px.slice(i * size, (i + 1) * size) };
      pixelBytes += d.pixels.length;
      drawings[d.id] = d;
      newTiles.push({ key: base + (ts.zeroEmpty ? i : i + 1), name: `${plain(ts.name) || 'Tileset'} ${i}`, frames: [{ drawingId: d.id, duration: 1 }] });
    }
    tileBase.set(ts, base);
    nextKey = base + (ts.zeroEmpty ? Math.max(0, ts.tileCount - 1) : ts.tileCount) + 1;
    return base;
  };
  if (file.tilesets.some((t) => t.external)) notes.push('A tileset is stored in another file that was not found, so its tiles are blank.');

  // Folders: the top-level groups. Deeper groups fold into their top-level one.
  const stack: AseLayer[] = [];
  const folderOf = new Map<AseLayer, Id>();
  const grab = (n: number) => {
    pixelBytes += n;
    if (pixelBytes > MAX_PIXEL_BYTES) throw new AsepriteProblem('This drawing is too big to open: all its pictures together would need more memory than Frameling can use.');
  };

  for (const l of file.layers) {
    while (stack.length && stack[stack.length - 1].level >= l.level) stack.pop();
    const inner = stack.slice(1);
    if (l.type === LAYER_GROUP) {
      if (stack.length === 0) {
        const id = uid('f');
        const mode = blendFor(l.blend);
        if (l.blend && !mode) noteBlend(blendMissing, l.blend, plain(l.name));
        folders[id] = { id, name: plain(l.name) || 'Group', visible: l.visible, opacity: l.opacity / 255, ...(mode && mode !== 'normal' ? { blend: mode } : {}) };
        folderOf.set(l, id);
      } else nested++;
      stack.push(l);
      continue;
    }
    const top = stack[0];
    // A layer hides, fades and is named by the groups inside the top one.
    let visible = l.visible;
    let opacity = l.opacity / 255;
    let label = plain(l.name) || 'Layer';
    for (const g of inner) {
      visible = visible && g.visible;
      opacity *= g.opacity / 255;
      if (g.blend) noteBlend(blendMissing, g.blend, plain(g.name), true);
    }
    if (inner.length) label = `${inner.map((g) => plain(g.name)).join(' / ')} / ${label}`;
    const folder = top ? folderOf.get(top) : undefined;

    const base = {
      id: uid('l'),
      name: label,
      visible,
      locked: !l.editable,
      opacity,
      ...(l.reference ? { reference: true } : {}),
      ...(folder ? { folder } : {}),
      cels: [] as Cel[],
    };
    const mode = blendFor(l.blend);
    if (l.blend && !mode) noteBlend(blendMissing, l.blend, label);
    const blend = mode && mode !== 'normal' ? { blend: mode } : {};
    const extra: Ext = { aseprite: { layer: l.index, ...(l.background ? { background: true } : {}), ...(l.blend ? { blendMode: l.blend } : {}), ...(l.lockMovement ? { lockMovement: true } : {}), ...(l.userData ? { userData: l.userData } : {}) } };

    // Which cels this layer has, by frame.
    const perFrame: (AseCel | undefined)[] = file.frames.map((f) => f.cels.find((c) => c.layer === l.index));
    if (!perFrame.some(Boolean)) {
      layers.push({ ...base, kind: l.type === LAYER_TILEMAP ? 'tilemap' : 'pixel', pixelSize: 1, ...blend, ext: extra } as Layer);
      continue;
    }

    // A tilemap layer stays tiles when its tileset fits and every cel sits on the tile grid at full strength.
    const ts = l.type === LAYER_TILEMAP ? tilesetOf(l) : undefined;
    let asTiles = false;
    if (l.type === LAYER_TILEMAP) {
      const cels = perFrame.filter((c): c is AseCel => !!c).map(source);
      let why = '';
      if (!ts) why = 'its tileset is missing';
      else if (!tileW || ts.tileWidth !== tileW || ts.tileHeight !== tileH) why = `its tiles are ${ts.tileWidth} x ${ts.tileHeight} and the drawing's tiles are ${tileW} x ${tileH}`;
      else if (cels.some((c) => !c.tilemap || c.x % tileW !== 0 || c.y % tileH !== 0)) why = "its tiles don't line up with the tile grid";
      else if (cels.some((c) => c.opacity !== 255)) why = 'a tile cel is partly see-through';
      else if (ts.external) why = 'its tileset is in another file';
      if (why) flattened.push(`${label} (${why})`);
      asTiles = !why;
    }

    const made = new Map<AseCel, Id>();
    const makeDrawing = (c: AseCel): Id => {
      let id = made.get(c);
      if (id) return id;
      if (asTiles && c.tilemap && ts) {
        const tm = c.tilemap;
        const baseKey = useTileset(ts);
        const columns = Math.max(1, Math.ceil(W / tileW));
        const rows = Math.max(1, Math.ceil(H / tileH));
        const cells = new Uint32Array(columns * rows);
        const ox = c.x / tileW;
        const oy = c.y / tileH;
        for (let j = 0; j < tm.height; j++) {
          for (let i = 0; i < tm.width; i++) {
            const col = ox + i;
            const row = oy + j;
            if (col < 0 || row < 0 || col >= columns || row >= rows) continue;
            const v = tm.tiles[j * tm.width + i];
            const tid = v & tm.idMask;
            if (ts.zeroEmpty ? tid === 0 : tid === tm.idMask) continue;
            const key = baseKey + (ts.zeroEmpty ? tid : tid + 1);
            cells[row * columns + col] = (((key & 0x0fffffff) | flagsOf(v, tm)) >>> 0) as number;
          }
        }
        grab(cells.length * 4);
        id = uid('t');
        drawings[id] = { id, kind: 'tilemap', columns, rows, cells };
        made.set(c, id);
        return id;
      }
      // Pixels: the cel's own image, or the tiles drawn flat.
      let px: Uint8ClampedArray;
      let w: number;
      let h: number;
      let x = c.x;
      let y = c.y;
      if (c.image) {
        w = c.image.width;
        h = c.image.height;
        px = imageRgba(file, c.image, paletteAt(file, c.frame), l.background);
        // Aseprite draws an indexed background layer opaque, whatever the palette's alpha says.
        if (l.background && file.depth === 8) for (let i = 3; i < px.length; i += 4) px[i] = 255;
      } else if (c.tilemap) {
        const t = c.tilemap;
        const tsx = ts;
        const tw = tsx?.tileWidth ?? 1;
        const th = tsx?.tileHeight ?? 1;
        w = t.width * tw;
        h = t.height * th;
        grab(w * h * 4);
        px = new Uint8ClampedArray(w * h * 4);
        if (tsx) {
          const all = tilesetRgba(tsx);
          const size = tw * th * 4;
          for (let j = 0; j < t.height; j++) {
            for (let i = 0; i < t.width; i++) {
              const v = t.tiles[j * t.width + i];
              const tid = v & t.idMask;
              if (tsx.zeroEmpty ? tid === 0 : tid === t.idMask) continue;
              if (tid >= tsx.tileCount) continue;
              blitTile(px, w, all.subarray(tid * size, (tid + 1) * size), tw, th, flagsOf(v, t), i * tw, j * th);
            }
          }
        }
      } else {
        w = 0;
        h = 0;
        px = new Uint8ClampedArray(0);
      }
      if (c.extra && w && h && l.reference) {
        const ew = Math.max(1, Math.round(c.extra.width));
        const eh = Math.max(1, Math.round(c.extra.height));
        if ((ew !== w || eh !== h) && ew * eh <= 64_000_000) {
          px = scaleRgba(px, w, h, ew, eh);
          w = ew;
          h = eh;
          x = Math.round(c.extra.x);
          y = Math.round(c.extra.y);
          scaledRefs++;
        }
      }
      grab(W * H * 4);
      const d: PixelDrawing = { id: uid('p'), kind: 'pixel', width: W, height: H, pixels: new Uint8ClampedArray(W * H * 4) };
      if (place(d.pixels, W, H, px, w, h, x, y, c.opacity) && !croppedLayers.includes(label)) croppedLayers.push(label);
      drawings[d.id] = d;
      made.set(c, d.id);
      return d.id;
    };

    // One Frameling cel per run of frames that show the same drawing.
    const cels: Cel[] = [];
    perFrame.forEach((c, f) => {
      if (!c) return;
      if (c.z) zIndexed++;
      const drawingId = makeDrawing(source(c));
      const start = timing.starts[f];
      const length = timing.holds[f];
      const prev = cels[cels.length - 1];
      if (prev && prev.drawingId === drawingId && prev.start + prev.length === start) prev.length += length;
      else cels.push({ id: uid('c'), start, length, drawingId });
    });
    layers.push({ ...base, kind: asTiles ? 'tilemap' : 'pixel', pixelSize: 1, ...blend, cels, ext: extra } as Layer);
  }

  // Tags become clips.
  const clips: Clip[] = [];
  const odd: string[] = [];
  const repeats: string[] = [];
  for (const t of file.tags) {
    const from = Math.min(Math.max(0, t.from), file.frames.length - 1);
    const to = Math.min(Math.max(from, t.to), file.frames.length - 1);
    clips.push({ id: uid('k'), name: plain(t.name) || 'Tag', start: timing.starts[from], end: timing.starts[to] + timing.holds[to] - 1, loop: t.repeat === 0 });
    if (t.direction) odd.push(`${plain(t.name)} (${DIRECTIONS[t.direction] ?? 'direction ' + t.direction})`);
    if (t.repeat > 1) repeats.push(`${plain(t.name)} (${t.repeat} times)`);
  }
  if (odd.length) notes.push(`Clips play forward in Frameling. These tags play another way in Aseprite: ${odd.join(', ')}. Their direction is kept in the drawing's notes.`);
  if (repeats.length) notes.push(`Clips can loop or play once. These tags repeat a set number of times in Aseprite and play once here: ${repeats.join(', ')}.`);

  for (const [mode, names] of blendMissing) notes.push(`Frameling has no "${blendName(mode)}" blend mode, so ${listOf(names)} blend${names.length === 1 ? 's' : ''} normally.`);
  if (flattened.length) notes.push(`Tilemap layers drawn as flat pixels instead of tiles: ${flattened.join('; ')}.`);
  if (croppedLayers.length) notes.push(`Drawing outside the canvas was cropped on: ${listOf(croppedLayers)}.`);
  if (nested) notes.push(`Frameling folders go one level deep, so ${nested} group${nested === 1 ? '' : 's'} inside another group became part of the outer one (hiding, fading and the name carry over).`);
  if (zIndexed) notes.push(`${zIndexed} cel${zIndexed === 1 ? ' has' : 's have'} a custom stacking order, which is ignored.`);
  if (scaledRefs) notes.push(`${scaledRefs} scaled reference picture${scaledRefs === 1 ? ' was' : 's were'} resized to the size shown in Aseprite.`);
  if (file.slices.length) notes.push(`${file.slices.length} slice${file.slices.length === 1 ? '' : 's'} (${file.slices.slice(0, 4).map((s) => plain(s.name)).join(', ')}${file.slices.length > 4 ? ', ...' : ''}) are kept in the drawing's notes but not shown.`);
  if (file.pixelWidth !== file.pixelHeight) notes.push(`The pixels are ${file.pixelWidth}:${file.pixelHeight} in Aseprite and show square here.`);

  const ext: Ext = {
    aseprite: {
      version: 1,
      colorDepth: file.depth,
      ...(file.depth === 8 ? { indexed: true, transparentIndex: file.transparentIndex } : {}),
      ...(file.pixelWidth !== file.pixelHeight ? { pixelRatio: [file.pixelWidth, file.pixelHeight] } : {}),
      ...(file.grid ? { grid: file.grid } : {}),
      frameDurations: file.frames.map((f) => f.duration),
      tags: file.tags.map((t, i) => ({ name: t.name, from: t.from, to: t.to, direction: DIRECTIONS[t.direction] ?? t.direction, repeat: t.repeat, clip: clips[i]?.id, ...(t.color ? { color: t.color } : {}), ...(t.userData ? { userData: t.userData } : {}) })),
      slices: file.slices.map((s) => ({ name: s.name, ...(s.nine ? { nineSlice: true } : {}), ...(s.hasPivot ? { pivot: true } : {}), keys: s.keys, ...(s.userData ? { userData: s.userData } : {}) })),
      ...(file.userData ? { userData: file.userData } : {}),
    },
  };

  return {
    width: W,
    height: H,
    fps: timing.fps,
    length: timing.length,
    layers,
    folders: Object.fromEntries(Object.entries(folders).filter(([id]) => layers.some((l) => l.folder === id))),
    drawings,
    clips,
    ...(palette ? { palette } : {}),
    ...(newTiles.length ? { tiles: { tileWidth: tileW, tileHeight: tileH, tiles: newTiles, nextKey } } : {}),
    ext,
    notes,
  };
}

function layerHasCels(file: AseFile, index: number): boolean {
  return file.frames.some((f) => f.cels.some((c) => c.layer === index));
}

function noteBlend(map: Map<number, string[]>, mode: number, layer: string, group = false): void {
  const list = map.get(mode) ?? [];
  const label = group ? `the group "${layer}"` : `"${layer}"`;
  if (!list.includes(label)) list.push(label);
  map.set(mode, list);
}

function listOf(names: string[]): string {
  const q = names.map((n) => (n.startsWith('the group') || n.startsWith('"') ? n : `"${n}"`));
  return q.length > 6 ? `${q.slice(0, 6).join(', ')} and ${q.length - 6} more` : q.join(', ');
}

/** A whole new document from an Aseprite file. */
export function asepriteDoc(file: AseFile, name: string): { doc: Doc; notes: string[] } {
  const p = asepritePieces(file, name);
  const doc = newDoc({ name, width: p.width, height: p.height, fps: p.fps, length: p.length, background: null });
  doc.layers = p.layers;
  doc.drawings = p.drawings;
  doc.clips = p.clips;
  if (Object.keys(p.folders).length) doc.folders = p.folders;
  if (p.palette) doc.palette = p.palette;
  if (p.tiles) doc.tileset = { tileWidth: p.tiles.tileWidth, tileHeight: p.tiles.tileHeight, tiles: p.tiles.tiles, nextKey: p.tiles.nextKey };
  doc.ext = { ...doc.ext, ...p.ext };
  return { doc, notes: p.notes };
}

/** Adds the pieces to a draft of an open document (layers go on top; the length grows to fit; the palette is added to). */
export function mergePieces(doc: Doc, p: Pieces, name: string): void {
  doc.layers.push(...p.layers);
  Object.assign(doc.drawings, p.drawings);
  if (Object.keys(p.folders).length) doc.folders = { ...doc.folders, ...p.folders };
  doc.clips.push(...p.clips);
  doc.length = Math.max(doc.length, Math.min(MAX_FRAMES, p.length));
  if (p.tiles) {
    if (!doc.tileset) doc.tileset = { tileWidth: p.tiles.tileWidth, tileHeight: p.tiles.tileHeight, tiles: [], nextKey: 1 };
    doc.tileset.tiles.push(...p.tiles.tiles);
    doc.tileset.nextKey = Math.max(doc.tileset.nextKey, p.tiles.nextKey);
  }
  if (p.palette) {
    const have = doc.palette?.colors ?? [];
    const seen = new Set(have.map((c) => c.toLowerCase()));
    const add = p.palette.colors.filter((c) => !seen.has(c.toLowerCase()));
    if (add.length || !doc.palette) doc.palette = { name: doc.palette?.name ?? p.palette.name, colors: [...have, ...add].slice(0, 256), ...(doc.palette?.ramps ? { ramps: doc.palette.ramps } : {}) };
  }
  const key = `aseprite:${plain(name).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60) || 'file'}`;
  doc.ext = { ...doc.ext, [key]: p.ext.aseprite };
}
