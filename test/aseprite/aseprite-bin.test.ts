// Opt-in check against the real Aseprite. Skipped unless ASEPRITE_BIN points at the aseprite program:
//   ASEPRITE_BIN=/path/to/aseprite npx vitest run test/aseprite/aseprite-bin
// It runs test/aseprite/lua/gen.lua in batch mode (no window, settings in a throwaway folder) to make real .aseprite
// files and a picture of every layer in every frame, then opens the files with the importer and compares pixel by pixel.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { drawingAt } from '../../src/core/doc';
import type { Doc, Layer, PixelDrawing, PixelLayer, TilemapDrawing } from '../../src/core/format';
import { decodePng } from '../../src/io/png';
import { asepriteDoc, planTiming } from '../../src/aseprite/convert';
import { parseAseprite } from '../../src/aseprite/parse';
import { flattenTilemap } from '../../src/tiles/model';
import { readSheetJson } from '../../src/pixel/import/sheetJson';
import { aseFile, celChunk, layerChunk, sliceChunk } from './writer';

const BIN = process.env.ASEPRITE_BIN;

function generate(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'frameling-aseprite-'));
  const cfg = path.join(dir, 'cfg');
  const out = path.join(dir, 'out');
  execFileSync('mkdir', ['-p', cfg, out]);
  // Settings go to a throwaway folder so the real Aseprite settings are never touched.
  execFileSync(BIN!, ['-b', '--script-param', `out=${out}`, '--script', path.resolve(__dirname, 'lua/gen.lua')], { env: { ...process.env, XDG_CONFIG_HOME: cfg, XDG_DATA_HOME: cfg }, timeout: 180000, stdio: 'pipe' });
  return out;
}

const dir = BIN ? generate() : '';

/** What Frameling shows for a layer at an Aseprite frame, as RGBA at the canvas size. */
function shown(doc: Doc, layer: Layer, aseFrame: number, starts: number[]): Uint8ClampedArray {
  const d = drawingAt(doc, layer, starts[aseFrame]);
  const out = new Uint8ClampedArray(doc.width * doc.height * 4);
  if (!d) return out;
  const src = d.kind === 'tilemap' ? flattenTilemap(doc, d as TilemapDrawing, 0) : (d as PixelDrawing);
  // A pixel drawing holds only its painted block, at (x, y) on the canvas.
  const ox = (src as PixelDrawing).x ?? 0;
  const oy = (src as PixelDrawing).y ?? 0;
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (x + ox < doc.width && y + oy < doc.height) out.set(src.pixels.subarray((y * src.width + x) * 4, (y * src.width + x) * 4 + 4), ((y + oy) * doc.width + x + ox) * 4);
  return out;
}

function compare(got: Uint8ClampedArray, want: Uint8ClampedArray): { bad: number; worst: number } {
  let bad = 0;
  let worst = 0;
  for (let i = 0; i < got.length; i += 4) {
    if (got[i + 3] === 0 && want[i + 3] === 0) continue;
    let diff = 0;
    for (let k = 0; k < 4; k++) diff = Math.max(diff, Math.abs(got[i + k] - want[i + k]));
    if (diff > 0) bad++;
    worst = Math.max(worst, diff);
  }
  return { bad, worst };
}

const names = BIN ? readdirSync(dir).filter((f) => f.endsWith('.aseprite')).map((f) => f.replace('.aseprite', '')) : [];

describe.skipIf(!BIN)('files made by the real Aseprite', () => {
  afterAll(() => rmSync(path.dirname(dir), { recursive: true, force: true }));

  it('made every fixture', () => {
    expect(names.sort()).toEqual(['blends', 'gray', 'groups', 'indexed', 'linked', 'meta', 'rgba', 'tilegrid', 'tilemap']);
  });

  for (const name of ['blends', 'gray', 'groups', 'indexed', 'linked', 'meta', 'rgba', 'tilegrid', 'tilemap']) {
    it(`${name}: every layer of every frame matches Aseprite's own picture`, () => {
      const file = parseAseprite(new Uint8Array(readFileSync(path.join(dir, `${name}.aseprite`))));
      const { doc } = asepriteDoc(file, name);
      const starts = planTiming(file.frames.map((f) => f.duration)).starts;
      const manifest = readFileSync(path.join(dir, `${name}.txt`), 'utf8').split('\n');
      let compared = 0;
      for (const line of manifest) {
        const m = /^layer (\d+) image$/.exec(line);
        if (!m) continue;
        const idx = Number(m[1]);
        const layer = doc.layers.find((l) => (l.ext?.aseprite as { layer: number } | undefined)?.layer === idx);
        expect(layer, `layer ${idx}`).toBeDefined();
        if (layer!.reference) {
          // Aseprite leaves reference layers out of its own render, so check the picture came across as drawn.
          const got = shown(doc, layer!, 0, starts);
          const at = (x: number, y: number) => [...got.slice((y * doc.width + x) * 4, (y * doc.width + x) * 4 + 4)];
          expect(at(5, 5)).toEqual([70, 80, 90, 255]);
          expect(at(6, 6)).toEqual([70, 80, 90, 255]);
          expect(at(4, 4)).toEqual([0, 0, 0, 0]);
          compared++;
          continue;
        }
        for (let f = 0; f < file.frames.length; f++) {
          const png = path.join(dir, `${name}__l${idx}_f${f}.png`);
          expect(existsSync(png)).toBe(true);
          const want = decodePng(new Uint8Array(readFileSync(png)));
          expect([want.width, want.height]).toEqual([doc.width, doc.height]);
          const r = compare(shown(doc, layer!, f, starts), want.pixels);
          expect(r, `${name} layer ${idx} (${layer!.name}) frame ${f}`).toEqual({ bad: 0, worst: 0 });
          compared++;
        }
      }
      expect(compared).toBeGreaterThan(0);
    });
  }

  it('the lazy reader gives the same drawings as the eager one on every real file', () => {
    for (const n of names) {
      const bytes = new Uint8Array(readFileSync(path.join(dir, `${n}.aseprite`)));
      const shape = (lazy: boolean) => {
        const { doc } = asepriteDoc(parseAseprite(bytes, { lazy }), n);
        return doc.layers.map((l) => l.cels.map((c) => {
          const d = doc.drawings[c.drawingId];
          return d.kind === 'pixel' ? [c.start, c.length, d.x ?? 0, d.y ?? 0, d.width, d.height, [...d.pixels].join()] : [c.start, c.length, d.kind];
        }));
      };
      expect(shape(true), n).toEqual(shape(false));
    }
  });

  it('a file of full-canvas cels with a small painted block opens as small drawings', () => {
    const out = path.join(dir, 'sparse');
    execFileSync('mkdir', ['-p', out]);
    const cfg = path.join(dir, 'cfg');
    execFileSync(BIN!, ['-b', '--script-param', `out=${out}`, '--script', path.resolve(__dirname, 'lua/sparse.lua')], { env: { ...process.env, XDG_CONFIG_HOME: cfg, XDG_DATA_HOME: cfg }, timeout: 180000, stdio: 'pipe' });
    const { doc } = asepriteDoc(parseAseprite(new Uint8Array(readFileSync(path.join(out, 'sparse.aseprite'))), { lazy: true }), 'sparse');
    const drawings = Object.values(doc.drawings).filter((d): d is PixelDrawing => d.kind === 'pixel');
    expect(drawings).toHaveLength(24);
    for (const d of drawings) expect([d.x, d.y, d.width, d.height]).toEqual([400, 300, 40, 40]);
    // 1000 x 1000 x 4 = 4 MB per cel on the canvas, 6.4 KB held.
    expect(drawings.reduce((n, d) => n + d.pixels.byteLength, 0)).toBe(24 * 40 * 40 * 4);
  });

  it('a slice with keys on two frames: Aseprite\'s own JSON and Frameling\'s import agree on where each key is', () => {
    const bytes = aseFile({
      width: 40,
      height: 30,
      depth: 32,
      frames: [
        { duration: 100, chunks: [layerChunk({ name: 'A' }), celChunk({ layer: 0, kind: 'image', width: 1, height: 1, data: [1, 2, 3, 255] }), sliceChunk({ name: 'hand', nine: true, pivot: true, keys: [{ frame: 0, x: 1, y: 2, w: 5, h: 6, center: [1, 1, 3, 4], pivot: [2, 3] }, { frame: 2, x: 10, y: 12, w: 7, h: 8, center: [2, 2, 3, 3], pivot: [4, 5] }] })] },
        { duration: 100, chunks: [] },
        { duration: 200, chunks: [] },
        { duration: 100, chunks: [] },
      ],
    });
    const out = path.join(dir, 'keys');
    execFileSync('mkdir', ['-p', out]);
    writeFileSync(path.join(out, 'hand.aseprite'), bytes);
    const cfg = path.join(dir, 'cfg');
    execFileSync(BIN!, ['-b', path.join(out, 'hand.aseprite'), '--sheet', path.join(out, 'hand.png'), '--data', path.join(out, 'hand.json'), '--list-slices', '--format', 'json-array'], { env: { ...process.env, XDG_CONFIG_HOME: cfg, XDG_DATA_HOME: cfg }, timeout: 60000, stdio: 'pipe' });
    const theirs = readSheetJson(readFileSync(path.join(out, 'hand.json'), 'utf8'))!.slices[0];
    expect(theirs.keys!.map((k) => [k.frame, k.x, k.y, k.w, k.h])).toEqual([[0, 1, 2, 5, 6], [2, 10, 12, 7, 8]]);
    // 100, 100, 200, 100 ms at 10 fps: Aseprite frame 2 starts at timeline frame 2.
    const mine = (asepriteDoc(parseAseprite(bytes), 'k').doc.layers[0] as PixelLayer).slices![0];
    expect(mine.keys!.map((k) => [k.frame, k.x, k.y, k.w, k.h])).toEqual([[0, 1, 2, 5, 6], [2, 10, 12, 7, 8]]);
    expect(mine.keys![1]).toMatchObject({ center: { x: 12, y: 14, w: 3, h: 3 }, pivot: { x: 14, y: 17 } });
    expect(theirs.keys![1]).toMatchObject({ center: { x: 12, y: 14, w: 3, h: 3 }, pivot: { x: 14, y: 17 } });
  });

  it('rgba: layer settings, timing and tags', () => {
    const { doc } = asepriteDoc(parseAseprite(new Uint8Array(readFileSync(path.join(dir, 'rgba.aseprite')))), 'rgba');
    expect(doc.layers.map((l) => [l.name, l.visible, l.blend ?? 'normal'])).toEqual([
      ['Back', true, 'normal'],
      ['Front', true, 'multiply'],
      ['Hidden', false, 'normal'],
    ]);
    expect(doc.layers[0].opacity).toBeCloseTo(128 / 255);
    expect((doc.ext!.aseprite as { frameDurations: number[] }).frameDurations).toEqual([100, 100, 200, 150, 100, 50]);
    expect(doc.fps).toBe(20);
    // 100, 100, 200, 150, 100, 50 ms at 20 fps are held 2, 2, 4, 3, 2, 1 frames.
    expect(doc.length).toBe(14);
    const byName = (n: string) => doc.clips.find((c) => c.name === n)!;
    expect([byName('idle').start, byName('idle').end, byName('idle').loop]).toEqual([0, 3, true]);
    expect([byName('back').start, byName('back').end, byName('back').loop]).toEqual([4, 10, true]);
    expect([byName('bounce').start, byName('bounce').end, byName('bounce').loop]).toEqual([8, 13, false]);
    expect([byName('bounceback').start, byName('bounceback').end, byName('bounceback').loop]).toEqual([0, 13, true]);
    // Aseprite counts each direction of a ping-pong tag as one repeat, and so do clips: repeat 3 is there, back, there.
    expect([byName('back').direction, byName('bounce').direction, byName('bounce').repeat, byName('bounceback').direction]).toEqual(['reverse', 'pingpong', 3, 'pingpong-reverse']);
    const tags = (doc.ext!.aseprite as { tags: { name: string; direction: string; repeat: number }[] }).tags;
    const tagOf = (n: string) => tags.find((t) => t.name === n)!;
    expect([tagOf('idle').direction, tagOf('back').direction, tagOf('bounce').direction, tagOf('bounceback').direction]).toEqual(['forward', 'reverse', 'ping-pong', 'ping-pong reverse']);
    expect(tagOf('bounce').repeat).toBe(3);
  });

  it('tilemap stays tiles; indexed keeps its palette and info; groups fold; meta keeps slices and notes', () => {
    const open = (n: string) => asepriteDoc(parseAseprite(new Uint8Array(readFileSync(path.join(dir, `${n}.aseprite`)))), n).doc;
    const tm = open('tilemap');
    expect(tm.layers.map((l) => l.kind)).toEqual(['pixel', 'tilemap', 'pixel']);
    expect(tm.tileset!.tiles).toHaveLength(2);
    // A tile grid that starts at the header's grid x and y: the maps on it are tiles, the one off it is flat pixels.
    const tg = open('tilegrid');
    expect(tg.layers.map((l) => l.kind)).toEqual(['pixel', 'tilemap', 'pixel']);
    expect([tg.tileset!.gridX, tg.tileset!.gridY]).toEqual([2, 3]);
    const ix = open('indexed');
    expect(ix.palette!.colors).toHaveLength(8);
    expect(ix.palette!.colors[5]).toBe('#09090980');
    expect((ix.ext!.aseprite as { indexed: boolean }).indexed).toBe(true);
    const gr = open('groups');
    // Groups inside groups are folders inside folders (up to the depth limit).
    expect(Object.values(gr.folders!).map((f) => [f.name, f.visible])).toEqual([['Outer', true], ['Inner', false]]);
    expect(gr.layers.find((l) => l.name === 'B')).toBeDefined();
    const meta = open('meta');
    const ext = meta.ext!.aseprite as { slices: { name: string; nineSlice?: boolean; keys: { pivot?: unknown; center?: unknown; x: number }[] }[]; userData: { text: string } };
    const panel = ext.slices.find((s) => s.name === 'panel')!;
    expect(ext.slices.map((s) => s.name).sort()).toEqual(['hitbox', 'panel']);
    expect(panel.nineSlice).toBe(true);
    expect(panel.keys[0].pivot).toEqual({ x: 3, y: 3 });
    expect(ext.userData.text).toBe('sprite note');
    expect(meta.layers.find((l) => l.name === 'Ref')!.reference).toBe(true);
  });
});
