// The data that can come with a sprite sheet: Frameling's own sprite sheet JSON, TexturePacker (hash or array), Phaser and
// Pixi atlases and Aseprite's "Export Sprite Sheet" JSON all share one shape, so one reader does them. It says where each
// frame is, how long it shows, which frames make an animation, and (Aseprite) the slices.
import type { ClipDirection } from '../../core/format';
import type { Cell } from './slicing';

export interface SheetTag {
  name: string;
  /** Frame numbers in the order of `cells`, inclusive. */
  from: number;
  to: number;
  loop: boolean;
  direction?: ClipDirection;
  repeat?: number;
}

export interface SheetSlice {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  center?: { x: number; y: number; w: number; h: number };
  pivot?: { x: number; y: number };
  color?: string;
}

export interface SheetData {
  /** Which tool wrote it, when it says. */
  app: string;
  cells: Cell[];
  tags: SheetTag[];
  slices: SheetSlice[];
  /** The picture's file name the JSON names, if any. */
  image?: string;
  /** The size it says the picture is. */
  size?: { w: number; h: number };
  notes: string[];
}

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : d);

function rect(v: unknown): { x: number; y: number; w: number; h: number } | null {
  if (!isObj(v)) return null;
  const w = int(v.w ?? v.width);
  const h = int(v.h ?? v.height);
  if (w < 1 || h < 1) return null;
  return { x: int(v.x), y: int(v.y), w, h };
}

const DIRECTIONS: Record<string, ClipDirection> = { forward: 'forward', reverse: 'reverse', pingpong: 'pingpong', pingpong_reverse: 'pingpong-reverse', 'pingpong-reverse': 'pingpong-reverse' };

/** Reads the JSON text. Null when it is not a sprite sheet description at all. */
export function readSheetJson(text: string): SheetData | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw)) return null;
  // Phaser's multi-atlas keeps its pictures in `textures`; the first one is read.
  const root: Record<string, any> = Array.isArray(raw.textures) && isObj(raw.textures[0]) ? { ...raw, ...raw.textures[0] } : raw;
  const frames = root.frames;
  const list: { key: string; f: Record<string, any> }[] = [];
  if (Array.isArray(frames)) frames.forEach((f, i) => isObj(f) && list.push({ key: typeof f.filename === 'string' ? f.filename : String(i), f }));
  else if (isObj(frames)) for (const [k, f] of Object.entries(frames)) isObj(f) && list.push({ key: k, f });
  if (!list.length) return null;

  const meta = isObj(root.meta) ? root.meta : {};
  const notes: string[] = [];
  const cells: Cell[] = [];
  const nameIndex = new Map<string, number>();
  list.forEach(({ key, f }, i) => {
    const r = rect(f.frame ?? f);
    if (!r) return;
    const rotated = f.rotated === true;
    const cell: Cell = { ...r, row: i, col: 0, name: key };
    if (rotated) cell.rotated = true;
    const src = isObj(f.sourceSize) ? { w: int(f.sourceSize.w), h: int(f.sourceSize.h) } : null;
    const at = rect(f.spriteSourceSize);
    if (src && src.w > 0 && src.h > 0 && at) {
      cell.source = src;
      cell.offset = { x: at.x, y: at.y };
    }
    if (typeof f.duration === 'number' && f.duration > 0) cell.delay = Math.round(f.duration);
    if (isObj(f.pivot) && Number.isFinite(f.pivot.x) && Number.isFinite(f.pivot.y)) {
      const w = cell.source?.w ?? (rotated ? r.h : r.w);
      const h = cell.source?.h ?? (rotated ? r.w : r.h);
      cell.pivot = { x: Math.round(f.pivot.x * w), y: Math.round(f.pivot.y * h) };
    }
    nameIndex.set(key, cells.length);
    cells.push(cell);
  });
  if (!cells.length) return null;

  const tags: SheetTag[] = [];
  const tagList = Array.isArray(meta.frameTags) ? meta.frameTags : [];
  for (const t of tagList) {
    if (!isObj(t) || typeof t.name !== 'string') continue;
    const from = Math.max(0, int(t.from));
    const to = Math.min(cells.length - 1, int(t.to, from));
    if (to < from) continue;
    const dir = DIRECTIONS[String(t.direction ?? 'forward')] ?? 'forward';
    tags.push({ name: t.name, from, to, loop: true, ...(dir !== 'forward' ? { direction: dir } : {}) });
  }
  // Frameling's own `animations`: a list of frames (numbers or names) that is a clip when the frames are side by side.
  if (isObj(root.animations)) {
    for (const [name, a] of Object.entries(root.animations)) {
      if (!isObj(a) || !Array.isArray(a.frames)) continue;
      const idx = a.frames.map((x: unknown) => (typeof x === 'number' ? x : nameIndex.get(String(x)) ?? -1));
      if (!idx.length || idx.some((n: number) => n < 0 || n >= cells.length)) continue;
      const set = [...new Set<number>(idx)].sort((p, q) => p - q);
      if (set[set.length - 1] - set[0] + 1 !== set.length) {
        notes.push(`The animation "${name}" uses frames that are not side by side, so it was left out.`);
        continue;
      }
      const dir = DIRECTIONS[String(a.direction ?? 'forward')] ?? 'forward';
      tags.push({ name, from: set[0], to: set[set.length - 1], loop: a.loop !== false, ...(dir !== 'forward' ? { direction: dir } : {}), ...(int(a.repeat) > 1 ? { repeat: int(a.repeat) } : {}) });
    }
  }

  const slices: SheetSlice[] = [];
  for (const s of Array.isArray(meta.slices) ? meta.slices : []) {
    if (!isObj(s) || typeof s.name !== 'string' || !Array.isArray(s.keys) || !s.keys.length) continue;
    const key = s.keys.find((k: any) => isObj(k) && int(k.frame) === 0) ?? s.keys[0];
    const b = rect(key.bounds);
    if (!b) continue;
    const c = rect(key.center);
    const slice: SheetSlice = { name: s.name, ...b };
    // Aseprite measures the middle and the pivot from the slice's own corner.
    if (c) slice.center = { x: b.x + c.x, y: b.y + c.y, w: c.w, h: c.h };
    if (isObj(key.pivot) && Number.isFinite(key.pivot.x) && Number.isFinite(key.pivot.y)) slice.pivot = { x: b.x + int(key.pivot.x), y: b.y + int(key.pivot.y) };
    if (typeof s.color === 'string') slice.color = s.color;
    slices.push(slice);
  }

  const size = rect({ x: 0, y: 0, w: meta.size?.w, h: meta.size?.h });
  return {
    app: typeof meta.app === 'string' ? meta.app : '',
    cells,
    tags,
    slices,
    ...(typeof meta.image === 'string' ? { image: meta.image } : {}),
    ...(size ? { size: { w: size.w, h: size.h } } : {}),
    notes,
  };
}
