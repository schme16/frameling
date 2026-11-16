// Builds small Photocraft files for the tests: a zip with a manifest and zstandard tiles. The tiles are written as raw
// blocks (valid zstandard, no compression), which is all the reader needs and keeps the tests free of a compressor.
import { strToU8, zipSync } from 'fflate';

/** One valid zstandard frame holding `data` in raw blocks, with the size declared in the header. */
export function zstdRaw(data: Uint8Array, opts: { declare?: number; trailing?: Uint8Array; checksum?: boolean } = {}): Uint8Array {
  const size = opts.declare ?? data.length;
  const head = [0x28, 0xb5, 0x2f, 0xfd, 0xa0 | (opts.checksum ? 4 : 0), size & 255, (size >>> 8) & 255, (size >>> 16) & 255, (size >>> 24) & 255];
  const out: number[] = [...head];
  const BLOCK = 128 * 1024;
  for (let at = 0; at < data.length || at === 0; at += BLOCK) {
    const n = Math.min(BLOCK, data.length - at);
    const last = at + BLOCK >= data.length ? 1 : 0;
    const h = last | (0 << 1) | (n << 3);
    out.push(h & 255, (h >> 8) & 255, (h >> 16) & 255);
    for (let i = 0; i < n; i++) out.push(data[at + i]);
    if (last) break;
  }
  if (opts.checksum) out.push(0, 0, 0, 0);
  return new Uint8Array([...out, ...(opts.trailing ?? [])]);
}

/** A tile of side x side pixels, every pixel the same colour, channels as given (4 = RGBA, 3 = RGB, 2 = grey and alpha, 1 = grey). */
export function solidTile(side: number, px: number[]): Uint8Array {
  const t = new Uint8Array(side * side * px.length);
  for (let i = 0; i < side * side; i++) t.set(px, i * px.length);
  return t;
}

let n = 0;
/** A fake content hash (the reader looks tiles up by it, it doesn't check it). */
export const fakeHash = (): string => (++n).toString(16).padStart(64, '0');

export interface TileSpec {
  tx: number;
  ty: number;
  px?: number[];
  side?: number;
  /** Use this file instead of a solid tile. */
  raw?: Uint8Array;
}

/** A raster layer from tiles; returns the layer for the manifest and the files to put in the zip. */
export function rasterLayer(name: string, tiles: TileSpec[], extra: Record<string, unknown> = {}, surface: Record<string, unknown> = {}): { layer: Record<string, unknown>; files: Record<string, Uint8Array> } {
  const files: Record<string, Uint8Array> = {};
  const list = tiles.map((t) => {
    const hash = fakeHash();
    files[`tiles/${hash}.zst`] = t.raw ?? zstdRaw(solidTile(t.side ?? 16, t.px ?? [255, 0, 0, 255]));
    return { tx: t.tx, ty: t.ty, hash };
  });
  return {
    layer: {
      id: ++n,
      name,
      visible: true,
      locks: { transparency: false, pixels: false, position: false, artboard: false, all: false },
      blend: 'Normal',
      opacity: 1,
      fill_opacity: 1,
      clipped: false,
      mask: null,
      vector_mask: null,
      effects: { enabled: true, items: [], psd_raw: null, reference: null },
      content: { kind: 'raster', surface: { format: { mode: 'Rgb', sample: 'U8', alpha: true }, default: '00000000', tiles: list, ...surface } },
      ...extra,
    },
    files,
  };
}

/** The zip: a manifest for a picture of width x height holding the layers (bottom first). */
export function pcraft(layers: { layer: Record<string, unknown>; files?: Record<string, Uint8Array> }[], opts: { width?: number; height?: number; version?: number; doc?: Record<string, unknown>; files?: Record<string, Uint8Array> } = {}): Uint8Array {
  const manifest = {
    format_version: opts.version ?? 1,
    generator: 'photocraft-format 0.23.1',
    document: { id: 1, name: 'test.pcraft', size: { width: opts.width ?? 32, height: opts.height ?? 32 }, resolution_dpi: 72, mode: 'Rgb', depth: 'U8', icc_profile: null, layers: layers.map((l) => l.layer), ...(opts.doc ?? {}) },
    thumbnail: 'thumb.png',
    composite: 'composite/preview.png',
  };
  const files: Record<string, Uint8Array> = { 'manifest.json': strToU8(JSON.stringify(manifest)) };
  for (const l of layers) Object.assign(files, l.files ?? {});
  Object.assign(files, opts.files ?? {});
  return zipSync(files, { level: 0 });
}
