// How Frameling spends the computer's effort: how much memory it keeps drawings ready in, how rough it gets while you
// drag along the timeline, and a cap on how many frames a second playback draws. Kept in the browser's storage so they
// are there next time (and so a settings backup carries them). The page is in GpuPage.tsx.
import { createStore, readJson, writeJson, type MiniStore } from '../ui/mini';

export type ScrubQuality = 'full' | 'quick';

export interface PerfSettings {
  /** Memory for keeping drawings ready to paint, in megabytes (millions of bytes). */
  cacheMb: number;
  /** While you drag along the timeline: everything, or without the onion skins and ghosts until you let go. */
  scrub: ScrubQuality;
  /** Most frames a second playback shows; 0 means no cap (the animation's own frame rate). */
  fpsCap: number;
}

/** The memory Frameling always used before this was a setting: 40 million pixels at 4 bytes each. */
export const DEFAULT_CACHE_MB = 160;
export const DEFAULT_PERF: PerfSettings = { cacheMb: DEFAULT_CACHE_MB, scrub: 'full', fpsCap: 0 };

export const CACHE_CHOICES = [
  { mb: 80, label: 'Small' },
  { mb: 160, label: 'Usual' },
  { mb: 320, label: 'Large' },
  { mb: 640, label: 'Huge' },
] as const;

/** 0 is "no cap". */
export const FPS_CAPS = [0, 30, 24, 15, 12] as const;

export const PERF_KEY = 'frameling.performance.v1';

const BYTES_PER_PIXEL = 4;

/** How many pixels of kept drawings fit in `mb` megabytes. */
export function cachePixels(mb: number): number {
  return Math.round((mb * 1_000_000) / BYTES_PER_PIXEL);
}

/** Saved settings made safe: anything missing or odd falls back to the default. */
export function cleanPerf(raw: unknown): PerfSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const mb = typeof r.cacheMb === 'number' && Number.isFinite(r.cacheMb) ? Math.round(Math.min(2048, Math.max(40, r.cacheMb))) : DEFAULT_PERF.cacheMb;
  const cap = typeof r.fpsCap === 'number' && Number.isFinite(r.fpsCap) ? Math.round(r.fpsCap) : 0;
  return { cacheMb: mb, scrub: r.scrub === 'quick' ? 'quick' : 'full', fpsCap: cap >= 1 ? Math.min(240, cap) : 0 };
}

export const perfStore: MiniStore<PerfSettings> = createStore<PerfSettings>(cleanPerf(readJson<unknown>(PERF_KEY, null)));
export const getPerf = (): PerfSettings => perfStore.get();

export function setPerf(patch: Partial<PerfSettings>): void {
  const next = cleanPerf({ ...perfStore.get(), ...patch });
  perfStore.set(next);
  writeJson(PERF_KEY, next);
}

/** Is everything here how it came? (For the "put these back" button.) */
export function isDefaultPerf(p: PerfSettings = perfStore.get()): boolean {
  return p.cacheMb === DEFAULT_PERF.cacheMb && p.scrub === DEFAULT_PERF.scrub && p.fpsCap === DEFAULT_PERF.fpsCap;
}

export function resetPerf(): void {
  setPerf({ ...DEFAULT_PERF });
}

/** The pixel budget the layer cache holds to. */
export const budgetPixels = (): number => cachePixels(perfStore.get().cacheMb);

// ---------------------------------------------------------------- scrubbing

const scrubbing = createStore<boolean>(false);
/** The timeline sets this while a drag along it is under way. */
export const setScrubbing = (on: boolean): void => scrubbing.set(on);
export const subscribeScrubbing = scrubbing.subscribe;

/** Should the canvas leave the extras (onion skins, ghosts, light table) out right now, to keep up with a drag? */
export function roughNow(): boolean {
  return perfStore.get().scrub === 'quick' && scrubbing.get();
}

// ---------------------------------------------------------------- playback cap

/**
 * Is it time to show another frame? With a cap of 12 a frame is on screen at least 1000 / 12 ms, so a 24 frames a
 * second animation shows every other frame, in time. The clock still decides which frame, so nothing runs slow.
 * `lastShown` is when the last new frame went up.
 */
export function frameDue(now: number, lastShown: number, cap: number): boolean {
  if (cap <= 0) return true;
  // A little give, because the screen refreshes in steps (a 30 cap on a 60 Hz screen is every second refresh).
  return now - lastShown >= 1000 / cap - 2;
}

/** What a cap does to an animation, in plain words: "shows every other frame", or that it changes nothing. */
export function capEffect(cap: number, fps: number): string {
  if (cap <= 0 || cap >= fps) return 'changes nothing for this animation';
  const keep = cap / fps;
  if (Math.abs(keep - 0.5) < 0.04) return 'shows every other frame';
  return `shows about ${Math.round(cap)} of every ${Math.round(fps)} frames`;
}

// ---------------------------------------------------------------- what is being held

let keptProbe: () => number = () => 0;
/** The canvas says how many pixels of kept drawings it holds right now, so the page can show it. */
export function setKeptProbe(fn: () => number): void {
  keptProbe = fn;
}
/** Bytes the kept drawings hold now. */
export const keptBytes = (): number => keptProbe() * BYTES_PER_PIXEL;
