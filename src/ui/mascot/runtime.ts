// Everything the Quills on screen share: the sprite sheet (loaded once), one timer that moves every Quill on to its
// next frame, and one "nobody has touched anything for a minute" clock that sends idle Quills to sleep. Frames are
// drawn by setting a background position straight on the element, so React never re-renders for a frame.
import { createStore } from '../mini';
import { reducedMotion, subscribePrefs } from '../prefs';
import { currentMascot } from './mascots';
import { poseAt, scaleFor, wakeBeats, withWake, type Beat, type Sheet, parseSheet } from './timing';

/** Where the current mascot's sheet image is, relative to the page (Electron loads the page from file://). */
export const sheetUrl = (): string => currentMascot().sheetUrl;

/** How long with no input before an idle Quill dozes off. */
export const SLEEP_AFTER = 60_000;

export interface LoadedSheet extends Sheet {
  url: string;
  width: number;
  height: number;
}

/** The loaded sheet, or null while loading or when there isn't one (then Quill simply isn't drawn). */
export const quillSheet = createStore<LoadedSheet | null>(null);

/** The id of the mascot the loaded (or loading) sheet belongs to. */
let loadedId: string | null = null;
let loading = false;
const switched = new Set<() => void>();

/** Called after the sheet of a different mascot has loaded in place of another (never for the first load). */
export function onMascotSwitched(fn: () => void): () => void {
  switched.add(fn);
  return () => void switched.delete(fn);
}

/** Loads the current mascot's sheet once. Safe to call from every Quill. A missing or broken sheet just means no mascot. */
export function loadQuill(): void {
  if (typeof Image === 'undefined' || typeof fetch === 'undefined') return;
  const m = currentMascot();
  if (loading && loadedId === m.id) return;
  const swapping = loadedId !== null && loadedId !== m.id;
  if (swapping) quillSheet.set(null);
  followPrefs();
  loading = true;
  loadedId = m.id;
  // Fetched, which works from file:// in Electron and from the dev server alike.
  fetch(m.metaUrl)
    .then((r) => (r.ok ? r.json() : null))
    .then((raw) => {
      const meta = parseSheet(raw);
      if (!meta || loadedId !== m.id || quillSheet.get()) return;
      const img = new Image();
      img.onload = () => {
        if (loadedId !== m.id || quillSheet.get()) return;
        quillSheet.set({ ...meta, url: m.sheetUrl, width: img.naturalWidth, height: img.naturalHeight });
        if (swapping) for (const fn of switched) fn();
      };
      img.src = m.sheetUrl;
    })
    .catch(() => {
      // No sheet here. The mascot stays away and everything else carries on.
    });
}

let following = false;

/** Once a sheet has been asked for, keep up with the saved choice: another mascot means loading his sheet. */
function followPrefs(): void {
  if (following) return;
  following = true;
  subscribePrefs(() => {
    if (loadedId !== null && loadedId !== currentMascot().id) loadQuill();
  });
}

/** For tests: forget everything loaded, so the next loadQuill starts from nothing. */
export function resetQuillLoader(): void {
  quillSheet.set(null);
  loading = false;
  loadedId = null;
}

/** For tests and the shot script: use this sheet instead. */
export function setQuillSheet(sheet: LoadedSheet | null): void {
  loading = true;
  loadedId = currentMascot().id;
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
  // Start the sleep from its first frame, or wake up through the stretch before settling into idle.
  for (const p of players) (v ? p.restartIfResting() : p.wakeIfResting());
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
  /** Resting Quills play the waking-up frames once, then idle. */
  wakeIfResting(): void;
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
  // The waking-up script while it is playing; null otherwise. Replaces `beats` for as long as it is set.
  let waking: Beat[] | null = null;
  let start = performance.now();
  let fired = false;
  let lastKey = '';

  // Just idling: all idle (the pet tab asks for idle then idle), so a nap or a wake changes what shows.
  const resting = (): boolean => beats.every((b) => b.anim === 'idle');

  const player = {
    restart() {
      start = performance.now();
      fired = false;
      lastKey = '';
    },
    restartIfResting() {
      if (!resting()) return;
      waking = null;
      player.restart();
    },
    wakeIfResting() {
      if (!resting()) return;
      const sheet = quillSheet.get();
      waking = sheet ? wakeBeats(sheet, reducedMotion()) : null;
      player.restart();
    },
    draw(now: number): number {
      const sheet = quillSheet.get();
      if (!sheet) return Infinity;
      const pose = poseAt(sheet, waking ?? beats, now - start, { sleepy, still: reducedMotion() });
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
      const sheet = quillSheet.get();
      // Changing from a sleep to plain idle wakes him up on the way.
      beats = sheet ? withWake(sheet, waking ?? beats, next, reducedMotion()) : next;
      waking = null;
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
