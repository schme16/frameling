/**
 * Frame rates across artboards. Each artboard plays at its own (`ArtboardContent.fps`; the open one's is `Doc.fps`), so a
 * film shot at 24 and a game sprite at 12 can live in one file. Pure functions, no DOM.
 */
import type { Doc, Id } from '../core/format';
import { artboardsOf, contentOf } from './model';
import { MAX_FPS } from '../timeline/edit-core';

/** A frame rate read from a file: a whole number from 1 up, or the fallback when it is missing or nonsense. */
export function readRate(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 1) return fallback;
  return Math.min(MAX_FPS, Math.round(v));
}

/** An artboard's frame rate, open or not. Frames on boards play every board at the document's rate. */
export function rateOf(doc: Doc, id: Id): number {
  if (doc.sharedLayers) return doc.fps;
  return contentOf(doc, id)?.fps ?? doc.fps;
}

/** Every artboard's rate, in list order. */
export function ratesOf(doc: Doc): { id: Id; name: string; fps: number }[] {
  return artboardsOf(doc).map((a) => ({ id: a.id, name: a.name, fps: rateOf(doc, a.id) }));
}

/** True when the artboards do not all play at the same rate. */
export function mixedRates(doc: Doc): boolean {
  const list = ratesOf(doc);
  return list.some((r) => r.fps !== list[0].fps);
}

/** A shot of a film: how many frames it has and how fast they play. */
export interface Timed {
  length: number;
  fps: number;
}

/** Seconds from the start of the film to the start of frame `frame` (a frame counted across every shot). */
export function secondsAt(shots: Timed[], frame: number): number {
  let left = Math.max(0, frame);
  let t = 0;
  for (const s of shots) {
    const here = Math.min(left, s.length);
    t += here / s.fps;
    left -= here;
    if (left <= 0) break;
  }
  return t;
}

/** The frame (counted across every shot) showing `seconds` into the film. Past the end gives the length. */
export function frameAtSeconds(shots: Timed[], seconds: number): number {
  let left = Math.max(0, seconds);
  let frame = 0;
  for (const s of shots) {
    const span = s.length / s.fps;
    if (left < span) return frame + Math.min(s.length - 1, Math.floor(left * s.fps + 1e-9));
    left -= span;
    frame += s.length;
  }
  return frame;
}

/** How long the whole film takes, in seconds. */
export function filmSeconds(shots: Timed[]): number {
  return shots.reduce((t, s) => t + s.length / s.fps, 0);
}

/** `12 fps`, or `12 to 24 fps` when the rates differ. */
export function rateWords(rates: number[]): string {
  const lo = Math.min(...rates);
  const hi = Math.max(...rates);
  return lo === hi ? `${lo} fps` : `${lo} to ${hi} fps`;
}

const list = (names: string[]): string => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/**
 * What the Export dialog says about speed when the chosen artboards do not all play at the same one, or null when they
 * do. One film has one speed, so a joined export takes the first artboard's and the others run faster or slower.
 */
export function speedNote(mode: 'each' | 'joined' | 'atlas', boards: { name: string; fps: number }[]): string | null {
  if (boards.length < 2 || boards.every((b) => b.fps === boards[0].fps)) return null;
  const words = rateWords(boards.map((b) => b.fps));
  if (mode === 'each') return `The artboards play at different speeds (${words}); each file keeps its own.`;
  if (mode === 'atlas') return `The artboards play at different speeds (${words}); each animation in the JSON has its own.`;
  const first = boards[0];
  const off = boards.filter((b) => b.fps !== first.fps);
  const slower = off.filter((b) => b.fps < first.fps).map((b) => b.name);
  const faster = off.filter((b) => b.fps > first.fps).map((b) => b.name);
  const how = [slower.length ? `${list(slower)} will run faster` : '', faster.length ? `${list(faster)} will run slower` : ''].filter(Boolean).join(', and ');
  return `The artboards play at different speeds (${words}), and a film has one: it uses ${first.name}'s ${first.fps} fps, so ${how}. Export them as separate files to keep each speed.`;
}
