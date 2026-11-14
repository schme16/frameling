// With ?debug in the page address, expose artboard actions and two demo documents for help pictures and A/B shots.
// Never on in normal use.
import { newDoc, newPixelDrawing, newPixelLayer, newVectorLayer, uid } from '../core/doc';
import type { Doc, PixelLayer, VectorDrawing } from '../core/format';
import { store } from '../core/store';
import * as model from './model';
import * as ops from './ops';
import { makeVariation } from './variations';
import { addPixelLayer } from '../timeline/edit-core';
import { loadFile, loadFileAsync, saveFile, saveFileAsync } from '../io/file';

/** Paints a filled box of art pixels. */
function box(px: Uint8ClampedArray, w: number, x0: number, y0: number, bw: number, bh: number, hex: string): void {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  for (let y = y0; y < y0 + bh; y++)
    for (let x = x0; x < x0 + bw; x++) {
      if (x < 0 || y < 0 || x >= w) continue;
      const i = (y * w + x) * 4;
      if (i < 0 || i + 3 >= px.length) continue;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
}

/** A little blob character: body, eyes and feet, squashed by `squash` and lifted by `lift` art pixels. */
function blob(d: { width: number; height: number; pixels: Uint8ClampedArray }, colour: string, lift: number, squash: number, step: number): void {
  const w = d.width;
  const bw = 12 + squash;
  const bh = 10 - squash;
  const x0 = Math.round((w - bw) / 2);
  const y0 = d.height - 6 - bh - lift;
  box(d.pixels, w, x0 + 1, y0, bw - 2, 1, '#1d1b26');
  box(d.pixels, w, x0, y0 + 1, bw, bh, '#1d1b26');
  box(d.pixels, w, x0 + 1, y0 + 1, bw - 2, bh - 1, colour);
  box(d.pixels, w, x0 + 3, y0 + 3, 2, 2, '#1d1b26');
  box(d.pixels, w, x0 + bw - 5, y0 + 3, 2, 2, '#1d1b26');
  box(d.pixels, w, x0 + 2 + step, y0 + bh + 1, 3, 2, '#1d1b26');
  box(d.pixels, w, x0 + bw - 5 - step, y0 + bh + 1, 3, 2, '#1d1b26');
  // Ground shadow.
  box(d.pixels, w, Math.round(w / 2) - 6, d.height - 3, 12, 1, '#8a8598');
}

/** Three 32 x 32 sprites (Idle, Run, Jump), four frames each, side by side. */
/** One blob jumping, a frame to a board: Frame 1 to 4 (the boards-as-frames way of making a sprite). */
export function demoFrames(): Doc {
  const doc = newDoc({ name: 'Blob jump', width: 128, height: 128, length: 1, background: '#fffaf0', pixel: { pixelSize: 4 } });
  const poses: [number, number][] = [[0, 2], [4, -1], [9, -2], [4, -1]];
  poses.forEach(([lift, squash], k) => {
    if (k > 0) model.switchArtboard(doc, model.addArtboard(doc, { name: `Frame ${k + 1}`, length: 1 }));
    else model.renameArtboard(doc, model.activeId(doc), 'Frame 1');
    const layer = doc.layers[0] as PixelLayer;
    layer.name = 'Blob';
    const d = newPixelDrawing(32, 32);
    blob(d, '#4fd1a5', lift, squash, 0);
    doc.drawings[d.id] = d;
    layer.cels = [{ id: uid('c'), start: 0, length: 1, drawingId: d.id }];
  });
  model.switchArtboard(doc, model.artboardsOf(doc)[0].id);
  return doc;
}

/**
 * The same blob jumping, four frames on four boards, drawn on four layers that every board shares: Sketch, Colour,
 * Shade and Lines.
 */
export function demoSharedFrames(): Doc {
  const doc = newDoc({ name: 'Blob jump, layered', width: 128, height: 128, length: 1, background: '#fffaf0', pixel: { pixelSize: 4 } });
  doc.sharedLayers = true;
  doc.layers = ['Sketch', 'Colour', 'Shade', 'Lines'].map((n) => newPixelLayer(n, 4));
  doc.layers[0].onion = false;
  const poses: [number, number, number][] = [[0, 2, 0], [4, -1, 1], [9, -2, 0], [4, -1, 1]];
  poses.forEach(([lift, squash, step], k) => {
    if (k > 0) model.switchArtboard(doc, model.addArtboard(doc, { name: `Frame ${k + 1}`, length: 1 }));
    else model.renameArtboard(doc, model.activeId(doc), 'Frame 1');
    const w = 32;
    const bw = 12 + squash;
    const bh = 10 - squash;
    const x0 = Math.round((w - bw) / 2);
    const y0 = 32 - 6 - bh - lift;
    const pics = doc.layers.map(() => newPixelDrawing(w, w));
    // Sketch: a loose pale box a pixel wider than the body.
    box(pics[0].pixels, w, x0 - 1, y0 - 1, bw + 2, 1, '#b9c6ee');
    box(pics[0].pixels, w, x0 - 1, y0 - 1, 1, bh + 3, '#b9c6ee');
    box(pics[0].pixels, w, x0 + bw, y0 - 1, 1, bh + 3, '#b9c6ee');
    // Colour and Shade.
    box(pics[1].pixels, w, x0 + 1, y0 + 1, bw - 2, bh - 1, '#4fd1a5');
    box(pics[2].pixels, w, x0 + 1, y0 + bh - 2, bw - 2, 2, '#2f9e7a');
    // Lines: the outline, eyes and feet.
    box(pics[3].pixels, w, x0 + 1, y0, bw - 2, 1, '#1d1b26');
    box(pics[3].pixels, w, x0, y0 + 1, 1, bh, '#1d1b26');
    box(pics[3].pixels, w, x0 + bw - 1, y0 + 1, 1, bh, '#1d1b26');
    box(pics[3].pixels, w, x0 + 1, y0 + bh, bw - 2, 1, '#1d1b26');
    box(pics[3].pixels, w, x0 + 3, y0 + 3, 2, 2, '#1d1b26');
    box(pics[3].pixels, w, x0 + bw - 5, y0 + 3, 2, 2, '#1d1b26');
    box(pics[3].pixels, w, x0 + 2 + step, y0 + bh + 1, 3, 2, '#1d1b26');
    box(pics[3].pixels, w, x0 + bw - 5 - step, y0 + bh + 1, 3, 2, '#1d1b26');
    doc.layers.forEach((l, i) => {
      doc.drawings[pics[i].id] = pics[i];
      l.cels = [{ id: uid('c'), start: 0, length: 1, drawingId: pics[i].id }];
    });
  });
  model.switchArtboard(doc, model.artboardsOf(doc)[0].id);
  doc.sprite = { way: 'boards' };
  return doc;
}

/**
 * For the "small gaps" pictures: a file like Quill's own. Eleven layers shared by thirteen artboards, named swatches of
 * its own and no pixel palette, so it shows the starter one.
 */
export function demoQuillLike(): Doc {
  const doc = newDoc({ name: 'Quill', width: 128, height: 128, length: 4, background: '#fffaf0', pixel: { pixelSize: 4 } });
  doc.sharedLayers = true;
  doc.layers = ['Shadow', 'Tail', 'Wing back', 'Body', 'Belly', 'Wing front', 'Head', 'Beak', 'Eye', 'Quill', 'Sparkle'].map((n) => newPixelLayer(n, 4));
  doc.swatches = [
    ['Feather', '#3b2f6b'], ['Feather light', '#6f5bb8'], ['Belly', '#f4e9d0'], ['Beak', '#ffb347'], ['Eye', '#1d1b26'], ['Quill ink', '#2a6f97'], ['Spark', '#ffe27a'], ['Shadow', '#8a8598'],
  ].map(([name, color]) => ({ id: uid('s'), name, color }));
  const names = ['Idle', 'Walk', 'Run', 'Jump', 'Fall', 'Land', 'Hurt', 'Talk', 'Fly', 'Dive', 'Perch', 'Sleep', 'Wave'];
  names.forEach((n, k) => {
    if (k > 0) model.switchArtboard(doc, model.addArtboard(doc, { name: n, length: 4 }));
    else model.renameArtboard(doc, model.activeId(doc), n);
    const pic = newPixelDrawing(32, 32);
    blob(pic, k % 2 ? '#6f5bb8' : '#3b2f6b', k % 4, k % 3, k % 2);
    doc.drawings[pic.id] = pic;
    const body = doc.layers[3];
    const cel = { id: uid('c'), start: 0, length: 4, drawingId: pic.id };
    const open = model.artboardsOf(doc).find((a) => a.id === model.activeId(doc))!;
    if (open.content) (open.content.cels ??= {})[body.id] = [cel];
    else body.cels = [cel];
  });
  model.switchArtboard(doc, model.artboardsOf(doc)[0].id);
  doc.sprite = { way: 'boards' };
  doc.clips = [{ id: 'k1', name: 'idle', start: 0, end: 3, loop: true }];
  return doc;
}

/** For pictures: a layer added once (to the stack every board shares), with a little spark drawn on it on each board. */
function addSparkles(name = 'Sparkle'): void {
  store().update('Add a layer', (d) => {
    const doc = d as Doc;
    const id = addPixelLayer(doc, null, name, 4);
    model.artboardsOf(doc).forEach((a, k) => {
      const pic = newPixelDrawing(32, 32);
      const x = 6 + k * 5;
      box(pic.pixels, 32, x, 5, 1, 3, '#ffc94a');
      box(pic.pixels, 32, x - 1, 6, 3, 1, '#ffc94a');
      doc.drawings[pic.id] = pic;
      const cel = { id: uid('c'), start: 0, length: 1, drawingId: pic.id };
      if (a.content) (a.content.cels ??= {})[id] = [cel];
      else doc.layers.find((l) => l.id === id)!.cels.push(cel);
    });
  });
}

export function demoSprites(): Doc {
  const doc = newDoc({ name: 'Blob sprites', width: 128, height: 128, length: 4, background: '#fffaf0', pixel: { pixelSize: 4 } });
  const sets: [string, string, (f: number) => [number, number, number]][] = [
    ['Idle', '#4fd1a5', (f) => [0, f % 2, 0]],
    ['Run', '#ff9e6d', (f) => [f % 2, 0, f % 2 ? 2 : -1]],
    ['Jump', '#9b7bff', (f) => [[0, 6, 9, 3][f], [2, -1, -1, 1][f], 0]],
  ];
  sets.forEach(([name, colour, pose], k) => {
    if (k > 0) {
      const id = model.addArtboard(doc, { name, background: ['#fffaf0', '#eaf6ff', '#f6efff'][k] });
      model.switchArtboard(doc, id);
    } else model.renameArtboard(doc, model.activeId(doc), name);
    const layer = doc.layers[0] as PixelLayer;
    layer.name = 'Blob';
    layer.cels = [];
    for (let f = 0; f < 4; f++) {
      const d = newPixelDrawing(32, 32);
      const [lift, squash, step] = pose(f);
      blob(d, colour, lift, squash, step);
      doc.drawings[d.id] = d;
      layer.cels.push({ id: uid('c'), start: f, length: 1, drawingId: d.id });
    }
  });
  model.switchArtboard(doc, model.artboardsOf(doc)[0].id);
  return doc;
}

/** The three blob sprites, each at a speed of its own: a slow idle, a run on twos and a quick jump. For pictures. */
export function demoSpeeds(): Doc {
  const doc = demoSprites();
  const rates = [6, 12, 24];
  model.artboardsOf(doc).forEach((a, k) => {
    if (a.content) a.content.fps = rates[k];
    else doc.fps = rates[k];
  });
  return doc;
}

const rect = (x: number, y: number, w: number, h: number, fill: string) => ({ id: uid('s'), type: 'path' as const, paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }], fill, stroke: null, opacity: 1 });
const circle = (cx: number, cy: number, r: number, fill: string) => {
  const k = 0.5523 * r;
  return {
    id: uid('s'),
    type: 'path' as const,
    paths: [{ closed: true, points: [{ x: cx + r, y: cy }, { x: cx, y: cy + r, c1: { x: cx + r, y: cy + k }, c2: { x: cx + k, y: cy + r } }, { x: cx - r, y: cy, c1: { x: cx - k, y: cy + r }, c2: { x: cx - r, y: cy + k } }, { x: cx, y: cy - r, c1: { x: cx - r, y: cy - k }, c2: { x: cx - k, y: cy - r } }, { x: cx + r, y: cy, c1: { x: cx + k, y: cy - r }, c2: { x: cx + r, y: cy - k } }] }],
    fill,
    stroke: { color: '#1d1b26', width: 3, join: 'round' as const, cap: 'round' as const },
    opacity: 1,
  };
};

/** Three shots of a ball's day out: wide, close-up, and the landing, each with its own length. 320 x 180 each, or with `mixed` the wide one, a square close-up and a tall landing. */
export function demoShots(mixed = false): Doc {
  const doc = newDoc({ name: 'Ball film', width: 320, height: 180, length: 24, background: '#5ab8ff', fps: 12 });
  const shots: [string, string, number, (f: number, n: number, w: number) => VectorDrawing['shapes']][] = [
    ['Wide: the hill', '#5ab8ff', 24, (f, n) => [rect(0, 130, 320, 50, '#6abf4b'), circle(40 + (240 * f) / (n - 1), 115 - Math.abs(Math.sin((f / (n - 1)) * Math.PI * 2)) * 60, 14, '#ff6f91')]],
    ['Close-up: the face', '#ffc94a', 12, (f, _n, w) => [circle(w / 2, 95, 70, '#ff6f91'), circle(w / 2 - 25, 80, 8 + (f % 6 < 3 ? 0 : -6), '#1d1b26'), circle(w / 2 + 25, 80, 8 + (f % 6 < 3 ? 0 : -6), '#1d1b26'), rect(w / 2 - 20, 120, 40, 6 + (f % 4), '#1d1b26')]],
    ['Landing', '#9b7bff', 16, (f, n, w) => [rect(0, 140, w, 40, '#4fd1a5'), circle(w / 2, Math.min(126, 20 + (f / (n - 1)) * 160), 14, '#ff6f91')]],
  ];
  shots.forEach(([name, bg, length, draw], k) => {
    if (k > 0) {
      const id = model.addArtboard(doc, { name, background: bg, length, width: mixed ? [320, 180, 120][k] : 320 });
      model.switchArtboard(doc, id);
    } else model.renameArtboard(doc, model.activeId(doc), name);
    doc.length = length;
    doc.background = bg;
    const layer = newVectorLayer('Action');
    doc.layers = [layer];
    for (let f = 0; f < length; f++) {
      const d: VectorDrawing = { id: uid('v'), kind: 'vector', shapes: draw(f, length, doc.width) };
      doc.drawings[d.id] = d;
      layer.cels.push({ id: uid('c'), start: f, length: 1, drawingId: d.id });
    }
  });
  model.switchArtboard(doc, model.artboardsOf(doc)[0].id);
  return doc;
}

/**
 * A ball rolling over a hill (24 frames, 320 x 180) with two variations made through the real actions: "Orange ball"
 * (a recolour and a fainter ground) and "Square cut" (180 x 180, framed on the middle of the original by a camera). The original is open.
 */
export function loadVariationsDemo(): void {
  const doc = newDoc({ name: 'Ball', width: 320, height: 180, length: 24, background: '#5ab8ff', fps: 12 });
  const ground = newVectorLayer('Ground');
  const ball = newVectorLayer('Ball');
  const gd: VectorDrawing = { id: uid('v'), kind: 'vector', shapes: [rect(0, 130, 320, 50, '#6abf4b'), rect(0, 128, 320, 4, '#4a9a34')] };
  doc.drawings[gd.id] = gd;
  ground.cels.push({ id: uid('c'), start: 0, length: 24, drawingId: gd.id });
  for (let f = 0; f < 24; f++) {
    const d: VectorDrawing = { id: uid('v'), kind: 'vector', shapes: [circle(40 + (240 * f) / 23, 115 - Math.abs(Math.sin((f / 23) * Math.PI * 2)) * 60, 14, '#ff6f91')] };
    doc.drawings[d.id] = d;
    ball.cels.push({ id: uid('c'), start: f, length: 1, drawingId: d.id });
  }
  doc.layers = [ground, ball];
  const s = store();
  s.load(doc);
  const root = model.activeId(s.get().doc);
  s.update('Name', (d) => void model.renameArtboard(d, root, 'Ball'));
  let orange = '';
  let square = '';
  s.update('Make a variation', (d) => void (orange = makeVariation(d, root, { name: 'Orange ball' }) ?? ''));
  s.update('Go', (d) => void model.switchArtboard(d, orange));
  s.update('Recolour', (d) => {
    for (const c of d.layers.find((l) => l.name === 'Ball')!.cels) {
      const dr = d.drawings[c.drawingId] as VectorDrawing;
      for (const sh of dr.shapes) if (sh.type === 'path') sh.fill = '#ff9e1f';
    }
    d.layers.find((l) => l.name === 'Ground')!.opacity = 0.85;
  });
  s.update('Go', (d) => void model.switchArtboard(d, root));
  s.update('Make a variation', (d) => void (square = makeVariation(d, root, { name: 'Square cut', size: { width: 180, height: 180 }, frame: 'fill' }) ?? ''));
  void square;
}

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingArtboards: unknown }).__framelingArtboards = {
    model,
    ops,
    makeVariation,
    addSparkles,
    load: (which: 'sprites' | 'shots' | 'mixed' | 'variations' | 'frames' | 'shared' | 'speeds' | 'quill') => (which === 'quill' ? store().load(demoQuillLike()) : which === 'variations' ? loadVariationsDemo() : which === 'shared' ? store().load(demoSharedFrames()) : store().load(which === 'mixed' ? demoShots(true) : which === 'shots' ? demoShots() : which === 'frames' ? demoFrames() : which === 'speeds' ? demoSpeeds() : demoSprites())),
    /** The document saved to bytes, and bytes opened as the document (for checking a file round trip). */
    saveBytes: () => saveFile(store().get().doc),
    /** The same through the path Save and autosave use (compressing off the page's thread). */
    saveBytesAsync: () => saveFileAsync(store().get().doc),
    openBytes: (b: Uint8Array) => store().load(loadFile(b).doc),
    openBytesAsync: async (b: Uint8Array) => store().load((await loadFileAsync(b)).doc),
    /** What the Export dialog's artboard row is set to, as if clicked. */
    setExport: (p: Partial<{ mode: 'one' | 'each' | 'joined' | 'atlas'; ids: string[] | null }>) => import('./export').then((m) => m.setArtboardExport(p)),
    setChoice: (id: string, v: string | undefined) => import('../core/choices').then((m) => m.setChoice(id, v)),
    player: () => import('./player').then((m) => m.openShotsPlayer()),
    exportDialog: (mode?: 'each' | 'joined' | 'atlas' | 'one') => import('./exportDialog').then((m) => m.openArtboardExport(mode)),
  };
}
