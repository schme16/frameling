// Little pictures (symbols, artboards, templates) sit on the panel colour, so white art in light mode, or black art in
// dark mode, can vanish. After the art is drawn, look at it and, only when most of it blends into what is behind the
// picture, paint a soft checker of the opposite tone behind it.

export type Backdrop = 'dark' | 'light';

/** How far apart (0 to 1, on perceived brightness) art and its backing must be to count as readable. */
const READABLE = 0.3;
/** If this share of the art is hard to read against the backing, it gets a backdrop. */
const BLENDED_SHARE = 0.6;
/** Pixels fainter than this are edges and glow, not art. */
const MIN_ALPHA = 40;

const TONES: Record<Backdrop, [string, string]> = {
  dark: ['#3b3750', '#46425c'],
  light: ['#f9f5ec', '#e6dfd0'],
};

/** Perceived brightness of an 8-bit colour, 0 (black) to 1 (white). */
export function brightness(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** What the art needs behind it. `data` is RGBA pixels, `bg` the brightness of the surface the picture sits on. */
export function pickBackdrop(data: ArrayLike<number>, bg: number): Backdrop | null {
  let art = 0;
  let blended = 0;
  let clear = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 255) clear++;
    if (a < MIN_ALPHA) continue;
    art++;
    if (Math.abs(brightness(data[i], data[i + 1], data[i + 2]) - bg) < READABLE) blended++;
  }
  // Nothing drawn, or the art covers everything (a backdrop would never show).
  if (!art || !clear) return null;
  if (blended / art < BLENDED_SHARE) return null;
  return bg >= 0.5 ? 'dark' : 'light';
}

/** Brightness of a computed CSS colour string ("rgb(...)", "rgba(...)" or "color(srgb ...)"), or null if unreadable. */
export function parseBrightness(css: string): number | null {
  const m = /^(rgba?|color)\(\s*(?:srgb\s+)?([^)]*)\)/.exec(css.trim());
  if (!m) return null;
  const nums = m[2].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (nums.length < 3 || nums.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
  const scale = m[1] === 'color' ? 255 : 1;
  return brightness(nums[0] * scale, nums[1] * scale, nums[2] * scale);
}

/** The brightness of what shows behind an element: its own background, or the nearest one that isn't clear. */
export function surfaceBrightness(el: Element | null): number | null {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const css = getComputedStyle(e).backgroundColor;
    const alpha = /,\s*([\d.]+)\)$|\/\s*([\d.]+)\)$/.exec(css);
    const a = alpha ? Number(alpha[1] ?? alpha[2]) : 1;
    if (a >= 0.5) return parseBrightness(css);
  }
  return null;
}

/**
 * Call after drawing the art into `cv` (identity transform not required). Paints the checker behind it when the art
 * would blend into the panel. `rect` limits the backdrop to a part of the canvas (device pixels), default all of it.
 */
export function paintThumbBackdrop(cv: HTMLCanvasElement, rect?: { x: number; y: number; w: number; h: number }): void {
  const g = cv.getContext('2d');
  if (!g || !cv.width || !cv.height) return;
  const bg = surfaceBrightness(cv);
  if (bg === null) return;
  let data: ImageData;
  try {
    data = g.getImageData(0, 0, cv.width, cv.height);
  } catch {
    return;
  }
  const which = pickBackdrop(data.data, bg);
  if (!which) return;
  const [a, b] = TONES[which];
  const r = rect ?? { x: 0, y: 0, w: cv.width, h: cv.height };
  const cell = Math.max(2, Math.round(6 * (cv.width / (cv.clientWidth || cv.width))));
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-over';
  g.beginPath();
  g.rect(r.x, r.y, r.w, r.h);
  g.clip();
  g.fillStyle = a;
  g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle = b;
  for (let y = 0, row = 0; y < r.h; y += cell, row++)
    for (let x = (row % 2) * cell; x < r.w; x += cell * 2) g.fillRect(r.x + x, r.y + y, cell, cell);
  g.restore();
}
