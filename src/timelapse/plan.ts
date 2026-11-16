// The maths of a timelapse, kept apart from the recorder so it can be tested without a window: when to take a
// picture, how big, how many may be kept, and which pictures make the finished video.
//
// THE BOUNDS (so a long session cannot eat the machine):
//  - A picture is at most MAX_SIDE pixels on its longest side, saved as a lossy WebP (tens of kilobytes).
//  - At most MAX_PICTURES are kept, and at most MAX_DISK_BYTES on disk (MAX_MEMORY_BYTES when the app has no folder to
//    write to and keeps them in memory instead). Past either, every second picture is thrown away and the gap between
//    pictures doubles, so a session of any length still covers its whole story in at most that many pictures.
//  - Pictures are written to disk as they are taken. Only a small list (name, time, size) stays in memory.

export const MAX_SIDE = 1280;
/** Tiny drawings (pixel art) are made bigger by whole numbers up to about this, so the video is not a postage stamp. */
export const MIN_SIDE = 640;
export const MAX_PICTURES = 1200;
export const MAX_DISK_BYTES = 200 * 1024 * 1024;
export const MAX_MEMORY_BYTES = 48 * 1024 * 1024;
/** The least time between two pictures to begin with. A change inside this waits for the end of it. */
export const START_GAP_MS = 4000;
/** The gap never grows past this, however long the session. */
export const MAX_GAP_MS = 120000;
/** Pictures older than this are cleared away when a new recording starts. */
export const KEEP_DAYS = 14;

export interface Limits {
  pictures: number;
  bytes: number;
}

export const limitsFor = (persistent: boolean): Limits => ({ pictures: MAX_PICTURES, bytes: persistent ? MAX_DISK_BYTES : MAX_MEMORY_BYTES });

// ---------------------------------------------------------------- when to take a picture

export interface WhenFacts {
  /** The drawing (or the frame being looked at) is not what the last picture showed. */
  changed: boolean;
  /** When the last picture was taken, or null for none yet. */
  lastAt: number | null;
  now: number;
  gapMs: number;
  /** A picture is being taken right now. */
  busy: boolean;
  /** Recording is paused. */
  paused?: boolean;
}

export type When = { take: true } | { take: false; wait: number | null };

/**
 * What the recorder does about a change right now: take a picture, wait this many milliseconds and ask again, or
 * nothing (null). A change is taken as soon as the gap since the last picture allows, and never more often.
 */
export function whenToTake(f: WhenFacts): When {
  if (f.paused || !f.changed) return { take: false, wait: null };
  if (f.busy) return { take: false, wait: 250 };
  if (f.lastAt === null) return { take: true };
  const left = f.gapMs - (f.now - f.lastAt);
  return left <= 0 ? { take: true } : { take: false, wait: left };
}

// ---------------------------------------------------------------- how big

const even = (n: number): number => Math.max(2, Math.round(n) + (Math.round(n) % 2));

/** The size of every picture of a session, from the drawing's size at the start. Even numbers, because video needs them. */
export function pictureBox(docW: number, docH: number): { width: number; height: number; scale: number } {
  const long = Math.max(1, docW, docH);
  const scale = long > MAX_SIDE ? MAX_SIDE / long : long < MIN_SIDE ? Math.max(1, Math.floor(MIN_SIDE / long)) : 1;
  return { width: even(docW * scale), height: even(docH * scale), scale };
}

/** How a drawing of this size sits inside the session's box: as large as fits, centred (the box never changes mid session). */
export function fitInBox(docW: number, docH: number, boxW: number, boxH: number): { scale: number; x: number; y: number } {
  const scale = Math.min(boxW / Math.max(1, docW), boxH / Math.max(1, docH));
  return { scale, x: (boxW - docW * scale) / 2, y: (boxH - docH * scale) / 2 };
}

/** A quick fingerprint of a picture's pixels, so a change nobody can see (renaming a layer) does not make a picture. */
export function pixelHash(pixels: Uint8ClampedArray): number {
  const words = new Uint32Array(pixels.buffer, pixels.byteOffset, Math.floor(pixels.byteLength / 4));
  let h = 2166136261;
  for (let i = 0; i < words.length; i++) h = Math.imul(h ^ words[i], 16777619);
  return h >>> 0;
}

// ---------------------------------------------------------------- the pictures kept

export interface Kept {
  /** Library id: `tl-<session>-<number>`. */
  id: string;
  /** When it was taken (milliseconds since 1970). */
  at: number;
  bytes: number;
}

const SESSION_LEN = 9;

/** A session's name: its start time in base 36, so names sort in the order sessions began. */
export const sessionName = (startedAt: number): string => Math.floor(startedAt / 1000).toString(36).padStart(SESSION_LEN, '0');

export const pictureId = (session: string, n: number): string => `tl-${session}-${n.toString(36).padStart(5, '0')}`;

export function parsePictureId(id: string): { session: string; n: number } | null {
  const m = /^tl-([0-9a-z]{9})-([0-9a-z]{5})$/.exec(id);
  return m ? { session: m[1], n: parseInt(m[2], 36) } : null;
}

/** Sorts pictures into the order they were taken. */
export const inOrder = (list: Kept[]): Kept[] => [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** The newest session among saved pictures (listed with their times), with its pictures in order; null when none. */
export function latestSession(entries: { id: string; size: number; modified: number }[]): { session: string; pictures: Kept[]; others: string[] } | null {
  const by = new Map<string, Kept[]>();
  const others: string[] = [];
  for (const e of entries) {
    const p = parsePictureId(e.id);
    if (!p) continue;
    if (!by.has(p.session)) by.set(p.session, []);
    by.get(p.session)!.push({ id: e.id, at: e.modified, bytes: e.size });
  }
  const names = [...by.keys()].sort();
  const last = names.pop();
  if (!last) return null;
  for (const n of names) for (const k of by.get(n)!) others.push(k.id);
  return { session: last, pictures: inOrder(by.get(last)!), others };
}

/** Saved pictures older than this many days (to clear away). */
export const staleIds = (entries: { id: string; modified: number }[], now: number, days = KEEP_DAYS): string[] =>
  entries.filter((e) => parsePictureId(e.id) && now - e.modified > days * 86400000).map((e) => e.id);

/** True when keeping the list needs thinning. */
export function overBound(list: Kept[], limits: Limits): boolean {
  return list.length > limits.pictures || list.reduce((n, k) => n + k.bytes, 0) > limits.bytes;
}

/**
 * Which pictures to throw away to get back under the bounds, and the gap to use from now on. Every second picture goes
 * (the first and the last always stay), as many rounds as it takes, and each round doubles the gap.
 */
export function thin(list: Kept[], limits: Limits, gapMs: number): { drop: string[]; gapMs: number } {
  let kept = inOrder(list);
  let gap = gapMs;
  const drop: string[] = [];
  // Always ends: each round at least halves the list until only the first and last are left.
  while (overBound(kept, limits) && kept.length > 2) {
    const next: Kept[] = [];
    kept.forEach((k, i) => {
      if (i % 2 === 0 || i === kept.length - 1) next.push(k);
      else drop.push(k.id);
    });
    kept = next;
    gap = Math.min(MAX_GAP_MS, gap * 2);
  }
  return { drop, gapMs: gap };
}

// ---------------------------------------------------------------- the finished video

export interface LengthOption {
  id: string;
  /** Plain words. */
  label: string;
  /** About this long, in seconds. null means every picture once. */
  seconds: number | null;
}

export const LENGTHS: LengthOption[] = [
  { id: 'quick', label: 'About 10 seconds', seconds: 10 },
  { id: 'short', label: 'About 20 seconds', seconds: 20 },
  { id: 'medium', label: 'About 30 seconds', seconds: 30 },
  { id: 'minute', label: 'About a minute', seconds: 60 },
  { id: 'all', label: 'Every picture, one after the other', seconds: null },
];
export const DEFAULT_LENGTH = 'medium';

/** A picture is never held longer than this, so a short session does not turn into a slideshow. */
export const MAX_HOLD_SECONDS = 0.5;
/** How long the finished drawing stays on screen at the end. */
export const END_HOLD_SECONDS = 2;

export interface Timing {
  /** Which picture (index into the pictures kept, in order) fills each frame of the video. */
  indices: number[];
  fps: number;
  /** How long the video comes out, in seconds. */
  seconds: number;
}

/**
 * Which pictures make the video. Pictures are spread evenly across the length asked for, the first and last always in.
 * Fewer pictures than frames means some are held; the hold is capped (MAX_HOLD_SECONDS), so the video can come out
 * shorter than asked. The last picture stays on screen a little longer at the end.
 */
export function timing(pictures: number, seconds: number | null, fps: number, endHold = END_HOLD_SECONDS): Timing {
  if (pictures <= 0) return { indices: [], fps, seconds: 0 };
  const maxHold = Math.max(1, Math.round(fps * MAX_HOLD_SECONDS));
  const asked = seconds === null ? pictures : Math.max(1, Math.round(seconds * fps));
  const want = Math.min(asked, pictures * maxHold);
  const indices: number[] = [];
  for (let i = 0; i < want; i++) indices.push(want === 1 ? pictures - 1 : Math.round((i * (pictures - 1)) / (want - 1)));
  if (want > 1) for (let i = 0; i < Math.round(endHold * fps); i++) indices.push(pictures - 1);
  return { indices, fps, seconds: indices.length / fps };
}

/** How many times faster than you drew it the video plays: the session's length over the video's. 1 or more. */
export function speedUp(sessionSeconds: number, videoSeconds: number): number {
  if (videoSeconds <= 0) return 1;
  return Math.max(1, sessionSeconds / videoSeconds);
}

/** "47 minutes", "1 hour 5 minutes", "30 seconds", in plain words. */
export function words(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return s === 1 ? '1 second' : `${s} seconds`;
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? '1 minute' : `${m} minutes`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h === 1 ? '1 hour' : `${h} hours`}${r ? ` ${r === 1 ? '1 minute' : `${r} minutes`}` : ''}`;
}

/** "1:05" or "1:02:03", for the badge's clock. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}

// ---------------------------------------------------------------- the file

export type TimelapseFormat = 'mp4' | 'webm' | 'gif';

/** H.264 plays everywhere, so it is first. A GIF is for places that only take a picture that moves. */
export const FORMATS: { id: TimelapseFormat; label: string; detail: string }[] = [
  { id: 'mp4', label: 'MP4 video (H.264)', detail: 'Plays everywhere: phones, social sites, editors and stream clips.' },
  { id: 'webm', label: 'WebM video', detail: 'Good for web pages. Some editors and phones will not open it.' },
  { id: 'gif', label: 'GIF', detail: 'A small moving picture. Big and grainy next to a video, so it is made smaller and slower.' },
];

/** Frames a second for each kind of file. */
export const fpsFor = (format: TimelapseFormat): number => (format === 'gif' ? 15 : 30);

/** A GIF is made no bigger than this on its longest side, because it gets huge fast. */
export const GIF_SIDE = 640;

/** The size of the finished file: the pictures' own size, or smaller for a GIF. Even numbers, as video needs. */
export function exportSize(boxW: number, boxH: number, format: TimelapseFormat): { width: number; height: number } {
  const k = format === 'gif' ? Math.min(1, GIF_SIDE / Math.max(boxW, boxH)) : 1;
  return { width: even(boxW * k), height: even(boxH * k) };
}
