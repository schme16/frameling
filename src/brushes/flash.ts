// The flash: when a part of the brush changes (the brush, the tip, the stick, the paper), the top preview carries a tag
// naming it and the changed rows light for about two seconds, so cause and effect are seen. What counts as a change is in
// parts.ts (flashFor). It costs nothing while drawing: the watcher only looks when the brush, the picked brush or the
// paper is a different object from last time, and only the preview and the rows listen for the flash.
import { useSyncExternalStore } from 'react';
import { store } from '../core/store';
import { getDry } from '../dry/settings';
import type { PaperKind } from '../dry/paper';
import { getDab } from '../dab/settings';
import { isPixelBrushTool, subscribeSpecs } from '../dab/live';
import { mediumInfo } from '../dry/maths';
import { pixelNameOf } from './pixelTipList';
import { flashFor, type Flash, type Moment } from './parts';
import { everyBrush, pickedBrushId, subscribeBrushes } from './presets';

/** How long the tag and the lit rows stay. */
export const FLASH_MS = 2200;

/** How long the preview takes to draw its line on after a change. */
export const DRAW_ON_MS = 600;
/** The preview's line is this many steps long. */
export const PREVIEW_POINTS = 60;
/** How many of the line's points are down, `ms` into the draw on: never fewer than two, slowing a little at the end. */
export function drawnOn(ms: number, points: number): number {
  const t = Math.min(1, Math.max(0, ms / DRAW_ON_MS));
  return Math.max(2, Math.round((1 - (1 - t) ** 1.6) * points));
}

export interface Lit extends Flash {
  /** A new number for each flash, so a repeat of the same one starts over. */
  n: number;
}
const NOTHING: Lit = { parts: [], text: '', n: 0 };
let lit: Lit = NOTHING;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const say = (next: Lit) => {
  lit = next;
  for (const fn of listeners) fn();
};

export const currentFlash = (): Lit => lit;
export const useFlash = (): Lit => useSyncExternalStore(subscribe, currentFlash);
export const flashHas = (l: Lit, part: Flash['parts'][number]): boolean => l.parts.includes(part);

/** Shows a flash now, and puts it away again after FLASH_MS. */
export function showFlash(f: Flash): void {
  if (timer) clearTimeout(timer);
  say({ ...f, n: lit.n + 1 });
  timer = setTimeout(() => say({ ...NOTHING, n: lit.n }), FLASH_MS);
}

/** Starts noticing changes. Called once at launch (with the saved brushes). Returns what stops it. */
export function startBrushFlash(): () => void {
  const state = () => store().get().ui;
  const onPixel = () => isPixelBrushTool(state().tool);
  // The paper a line is drawn on: the brush's own when it keeps one, else the sheet's.
  const effective = (): PaperKind => {
    if (onPixel()) return getDab().grain?.paper ?? getDry().paper;
    const t = state().brush.tip;
    return t?.dry && t.paper ? t.paper : getDry().paper;
  };
  const pixelNow = (): Moment['pixel'] => {
    if (!onPixel()) return null;
    const live = { dab: getDab(), medium: getDry().medium };
    const pic = live.dab.tip === 'picture' ? `:${live.dab.picture?.w ?? 0}x${live.dab.picture?.h ?? 0}` : '';
    return { tip: live.dab.tip + pic, tipName: pixelNameOf('tip', live), stick: state().tool === 'charcoal' ? live.medium : null, stickName: mediumInfo(live.medium).label };
  };
  const moment = (): Moment => {
    const id = pickedBrushId();
    return { id, name: id ? (everyBrush().find((p) => p.id === id)?.name ?? '') : '', brush: state().brush, paper: effective(), pixel: pixelNow() };
  };
  let prev = moment();
  let prevDab = getDab();
  let prevMedium = getDry().medium;
  let prevTool = state().tool;
  const look = () => {
    // Almost every call is nothing new (drawing, a slider drag and a list change all land here), so look cheaply first.
    if (pickedBrushId() === prev.id && state().brush === prev.brush && state().tool === prevTool && getDab() === prevDab && getDry().medium === prevMedium && effective() === prev.paper) return;
    const now = moment();
    // Moving to another tool is not a change of the brush (unless it picked another brush): start from here.
    const f = state().tool === prevTool || pickedBrushId() !== prev.id ? flashFor(prev, now) : null;
    prev = now;
    prevDab = getDab();
    prevMedium = getDry().medium;
    prevTool = state().tool;
    if (f) showFlash(f);
  };
  const offs = [store().subscribe(look), subscribeBrushes(look), subscribeSpecs(look)];
  return () => {
    for (const off of offs) off();
    if (timer) clearTimeout(timer);
  };
}
