// Everything the Quills on screen share: the sprite sheet (loaded once), one timer that moves every Quill on to its
// next frame, and one "nobody has touched anything for a minute" clock that sends idle Quills to sleep. Frames are
// drawn by setting a background position straight on the element, so React never re-renders for a frame.
import { createStore } from '../mini';
import { reducedMotion, subscribePrefs } from '../prefs';
import { poseAt, scaleFor, type Beat, type Sheet, parseSheet } from './timing';

/** Where the sheet image is, relative to the page (Electron loads the page from file://). */
export const SHEET_URL = 'mascot/mascot.png';

/** How long with no input before an idle Quill dozes off. */
export const SLEEP_AFTER = 60_000;

export interface LoadedSheet extends Sheet {
  url: string;
  width: number;
  height: number;
}

/** The loaded sheet, or null while loading or when there isn't one (then Quill simply isn't drawn). */
export const quillSheet = createStore<LoadedSheet | null>(null);

/** Where the frame list is. Fetched, which works from file:// in Electron and from the dev server alike. */
export const META_URL = 'mascot/mascot.json';

let loading = false;

/** Loads the sheet once. Safe to call from every Quill. A missing or broken sheet just means no Quill. */
export function loadQuill(): void {
  if (loading || typeof Image === 'undefined' || typeof fetch === 'undefined') return;
  loading = true;
  fetch(META_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((raw) => {
      const meta = parseSheet(raw);
      if (!meta || quillSheet.get()) return;
      const img = new Image();
      img.onload = () => {
        if (!quillSheet.get()) quillSheet.set({ ...meta, url: SHEET_URL, width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = SHEET_URL;
    })
    .catch(() => {
      // No sheet here. Quill stays away and everything else carries on.
    });
}

/** For tests and the shot script: use this sheet instead. */
export function setQuillSheet(sheet: LoadedSheet | null): void {
  loading = true;
  quillSheet.set(sheet);
  for (const p of players) p.restart();
  tick();
}

// ---------------------------------------------------------------- bored and asleep

let lastInput = typeof performance !== 'undefined' ? performance.now() : 0;
let sleepy = false;
let sleepTimer: ReturnType<typeof setTimeout> | null = null;
let watching = false;

export const isSleepy = (): boolean => sleepy;

/** Milliseconds since anyone touched anything. Read by the pet feature to work out how Quill's feeling. */
export const sinceInput = (): number => (typeof performance === 'undefined' ? 0 : performance.now() - lastInput);

function setSleepy(v: boolean): void {
  if (v === sleepy) return;
  sleepy = v;
  // Start the sleep (or the waking idle) from its first frame.
  for (const p of players) p.restartIfResting();
  tick();
}

function armSleep(): void {
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = null;
  if (!players.size) return;
  const left = SLEEP_AFTER - (performance.now() - lastInput);
  if (left <= 0) setSleepy(true);
  else sleepTimer = setTimeout(armSleep, left + 50);
}

/** Any input: wake up. The listeners only write a number, so pointer moves cost nothing. */
export function noteInput(): void {
  lastInput = performance.now();
  if (sleepy) {
    setSleepy(false);
    armSleep();
  } else if (!sleepTimer) armSleep();
}

function watch(): void {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel']) window.addEventListener(ev, noteInput, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? stopTimer() : tick()));
  subscribePrefs(() => tick());
  try {
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => tick());
  } catch {
    // No matchMedia (tests).
  }
}

// ---------------------------------------------------------------- players

export interface Player {
  restart(): void;
  restartIfResting(): void;
  /** Draws the frame for now and says how long until the next change. */
  draw(now: number): number;
}

const players = new Set<Player>();
let timer: ReturnType<typeof setTimeout> | null = null;

function stopTimer(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Draws every Quill and sleeps until the soonest next frame. One timer for all of them. */
export function tick(): void {
  stopTimer();
  if (typeof document !== 'undefined' && document.hidden) return;
  const now = performance.now();
  let soonest = Infinity;
  for (const p of players) soonest = Math.min(soonest, p.draw(now));
  if (soonest < Infinity) timer = setTimeout(tick, Math.max(16, soonest));
}

export interface PlayerOptions {
  el: HTMLElement;
  size: number;
  beats: Beat[];
  onDone?: () => void;
}

/** Starts drawing a Quill into `el`. Returns the controls; call `stop` when the element goes away. */
export function createPlayer(opts: PlayerOptions): Player & { stop(): void; set(beats: Beat[], onDone?: () => void, size?: number): void } {
  watch();
  let { beats, onDone, size } = opts;
  let start = performance.now();
  let fired = false;
  let lastKey = '';

  const player = {
    restart() {
      start = performance.now();
      fired = false;
      lastKey = '';
    },
    restartIfResting() {
      if (beats.length === 1 && beats[0].anim === 'idle') player.restart();
    },
    draw(now: number): number {
      const sheet = quillSheet.get();
      if (!sheet) return Infinity;
      const pose = poseAt(sheet, beats, now - start, { sleepy, still: reducedMotion() });
      const scale = scaleFor(sheet.frameW, size);
      const key = `${sheet.url}|${scale}|${pose.frame.x}|${pose.frame.y}`;
      if (key !== lastKey) {
        lastKey = key;
        const s = opts.el.style;
        s.width = `${sheet.frameW * scale}px`;
        s.height = `${sheet.frameH * scale}px`;
        s.backgroundImage = `url("${sheet.url}")`;
        s.backgroundSize = `${sheet.width * scale}px ${sheet.height * scale}px`;
        s.backgroundPosition = `${-pose.frame.x * scale}px ${-pose.frame.y * scale}px`;
        opts.el.dataset.anim = pose.anim;
      }
      if (pose.done && !fired) {
        fired = true;
        // Later, not in the middle of drawing: onDone often changes what this Quill plays.
        const cb = onDone;
        if (cb) queueMicrotask(cb);
      }
      return pose.next;
    },
    set(next: Beat[], done?: () => void, nextSize?: number) {
      beats = next;
      onDone = done;
      if (nextSize) size = nextSize;
      player.restart();
      tick();
    },
    stop() {
      players.delete(player);
      if (!players.size) {
        stopTimer();
        if (sleepTimer) clearTimeout(sleepTimer);
        sleepTimer = null;
      }
    },
  };
  players.add(player);
  armSleep();
  tick();
  return player;
}

/** For tests: how many Quills are being drawn. */
export const playerCount = (): number => players.size;
