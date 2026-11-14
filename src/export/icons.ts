// Icon sets, favicons and sticker sizes: the size tables, the .ico and .icns containers, and the fitting maths.
// Plain functions on bytes and numbers, no canvas, so they are easy to test. The pictures themselves are drawn in
// formats/icons.ts.

/** Which parts of an app icon set to make. Missing in settings saved before: everything but the phone sizes. */
export interface IconParts {
  /** A PNG at every common size (16 up to 1024). */
  png: boolean;
  /** One Windows icon file holding the small sizes. */
  ico: boolean;
  /** One Mac icon file. */
  icns: boolean;
  /** The sizes iPhone, iPad and Android want. */
  mobile: boolean;
}

export const DEFAULT_ICON_PARTS: IconParts = { png: true, ico: true, icns: true, mobile: false };

export const iconPartsOf = (raw?: Partial<IconParts>): IconParts => ({ ...DEFAULT_ICON_PARTS, ...raw });

export const ICON_PNG_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];
export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
/** Mac icon pieces: the four letters say which size, and PNG data goes inside. */
export const ICNS_TYPES: { type: string; size: number }[] = [
  { type: 'icp4', size: 16 },
  { type: 'icp5', size: 32 },
  { type: 'icp6', size: 64 },
  { type: 'ic07', size: 128 },
  { type: 'ic08', size: 256 },
  { type: 'ic09', size: 512 },
  { type: 'ic10', size: 1024 },
];
export const IOS_SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];
export const ANDROID_SIZES: { folder: string; size: number }[] = [
  { folder: 'mipmap-mdpi', size: 48 },
  { folder: 'mipmap-hdpi', size: 72 },
  { folder: 'mipmap-xhdpi', size: 96 },
  { folder: 'mipmap-xxhdpi', size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];
export const PLAY_STORE_SIZE = 512;

export const FAVICON_ICO_SIZES = [16, 32, 48];

export interface IconFile {
  /** Where it sits inside the zip. */
  path: string;
  size: number;
}

export interface IconPlan {
  /** Every size that has to be drawn, smallest first. */
  sizes: number[];
  /** The plain pictures. */
  pngs: IconFile[];
  ico?: { path: string; sizes: number[] };
  icns?: { path: string; types: { type: string; size: number }[] };
}

const uniqueSorted = (list: number[]): number[] => [...new Set(list)].sort((a, b) => a - b);

/** What an app icon set holds, for the parts picked. `base` is the file name without an ending. */
export function planIcons(partsIn: Partial<IconParts> | undefined, base: string): IconPlan {
  const parts = iconPartsOf(partsIn);
  const pngs: IconFile[] = [];
  const sizes: number[] = [];
  if (parts.png) for (const size of ICON_PNG_SIZES) pngs.push({ path: `png/${base}-${size}.png`, size });
  if (parts.mobile) {
    for (const size of IOS_SIZES) pngs.push({ path: `ios/icon-${size}.png`, size });
    for (const a of ANDROID_SIZES) pngs.push({ path: `android/${a.folder}/ic_launcher.png`, size: a.size });
    pngs.push({ path: `android/play-store-${PLAY_STORE_SIZE}.png`, size: PLAY_STORE_SIZE });
  }
  sizes.push(...pngs.map((p) => p.size));
  const plan: IconPlan = { sizes: [], pngs };
  if (parts.ico) {
    plan.ico = { path: `${base}.ico`, sizes: ICO_SIZES };
    sizes.push(...ICO_SIZES);
  }
  if (parts.icns) {
    plan.icns = { path: `${base}.icns`, types: ICNS_TYPES };
    sizes.push(...ICNS_TYPES.map((t) => t.size));
  }
  plan.sizes = uniqueSorted(sizes);
  return plan;
}

/** A Windows .ico file holding PNG pictures (every Windows since Vista reads them). Sizes of 256 are written as 0. */
export function buildIco(images: { size: number; png: Uint8Array }[]): Uint8Array {
  const list = [...images].sort((a, b) => a.size - b.size);
  const head = 6 + 16 * list.length;
  const total = head + list.reduce((n, i) => n + i.png.length, 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint16(0, 0, true);
  v.setUint16(2, 1, true);
  v.setUint16(4, list.length, true);
  let at = head;
  list.forEach((img, i) => {
    const e = 6 + 16 * i;
    out[e] = img.size >= 256 ? 0 : img.size;
    out[e + 1] = img.size >= 256 ? 0 : img.size;
    v.setUint16(e + 4, 1, true);
    v.setUint16(e + 6, 32, true);
    v.setUint32(e + 8, img.png.length, true);
    v.setUint32(e + 12, at, true);
    out.set(img.png, at);
    at += img.png.length;
  });
  return out;
}

/** A Mac .icns file: a header, then each size as its four letters, a length and PNG data. */
export function buildIcns(images: { type: string; png: Uint8Array }[]): Uint8Array {
  const total = 8 + images.reduce((n, i) => n + 8 + i.png.length, 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  out.set([0x69, 0x63, 0x6e, 0x73], 0);
  v.setUint32(4, total, false);
  let at = 8;
  for (const img of images) {
    for (let k = 0; k < 4; k++) out[at + k] = img.type.charCodeAt(k);
    v.setUint32(at + 4, 8 + img.png.length, false);
    out.set(img.png, at + 8);
    at += 8 + img.png.length;
  }
  return out;
}

/** The pictures inside an .ico: size, where it starts and how long it is (for tests). */
export function readIco(b: Uint8Array): { size: number; offset: number; length: number }[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 6 || v.getUint16(0, true) !== 0 || v.getUint16(2, true) !== 1) return [];
  const n = v.getUint16(4, true);
  const out: { size: number; offset: number; length: number }[] = [];
  for (let i = 0; i < n; i++) {
    const e = 6 + 16 * i;
    out.push({ size: b[e] || 256, length: v.getUint32(e + 8, true), offset: v.getUint32(e + 12, true) });
  }
  return out;
}

export type IconFit = 'fit' | 'fill';

export interface FitBox {
  /** How much the drawing is scaled. */
  scale: number;
  /** The scaled drawing's size, in whole pixels. */
  width: number;
  height: number;
  /** Where its top left corner goes inside the square (negative when it is cropped). */
  x: number;
  y: number;
}

/**
 * Where a drawing of `w` x `h` sits inside a square of `size`. "fit" shows the whole drawing with empty margins at the
 * sides of a drawing that is not square; "fill" fills the square and cuts off what sticks out.
 */
export function fitBox(w: number, h: number, size: number, mode: IconFit): FitBox {
  const scale = mode === 'fill' ? size / Math.min(w, h) : size / Math.max(w, h);
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  return { scale, width, height, x: Math.round((size - width) / 2), y: Math.round((size - height) / 2) };
}

/** The extra files of a favicon set, beside the pictures. */
export interface FaviconPlan {
  sizes: number[];
  ico: { path: string; sizes: number[] };
  pngs: IconFile[];
}

export function planFavicon(): FaviconPlan {
  const pngs: IconFile[] = [
    { path: 'favicon-16x16.png', size: 16 },
    { path: 'favicon-32x32.png', size: 32 },
    { path: 'apple-touch-icon.png', size: 180 },
    { path: 'icon-192.png', size: 192 },
    { path: 'icon-512.png', size: 512 },
  ];
  return { sizes: uniqueSorted([...pngs.map((p) => p.size), ...FAVICON_ICO_SIZES]), ico: { path: 'favicon.ico', sizes: FAVICON_ICO_SIZES }, pngs };
}

/** The lines to paste into a page's head. */
export function faviconHtml(): string {
  return [
    '<link rel="icon" href="/favicon.ico" sizes="48x48">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
    '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
    '',
  ].join('\n');
}

/** The small manifest file that lets Android and browsers find the big icons. */
export function faviconManifest(name: string): string {
  const m = {
    name,
    short_name: name.slice(0, 12),
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
  return JSON.stringify(m, null, 2) + '\n';
}

/** A short plain note put in the zip so nobody has to guess where the files go. */
export function faviconReadme(): string {
  return ['Put these files at the top of your website (next to index.html).', '', 'Then paste the lines from head.html into the <head> of each page.', ''].join('\n');
}

// ---------------------------------------------------------------- stickers

export type StickerType = 'png' | 'webp';

export interface StickerService {
  id: string;
  title: string;
  /** Pixels on a side (the picture is square). */
  size: number;
  type: StickerType;
  /** The most it is allowed to weigh, in bytes. */
  maxBytes: number;
}

/**
 * The sizes the messaging apps ask for today. They change now and then, so the help says to check the app.
 * Last checked 2026-11-14 against Telegram's sticker page, WhatsApp's stickers repo, Slack's emoji help, and Discord, Signal and
 * Teams guides. Nothing had drifted. test/export/stickerLimits.test.ts pins every number, so a change here is a deliberate one.
 */
export const STICKER_SERVICES: StickerService[] = [
  { id: 'slack', title: 'Slack emoji', size: 128, type: 'png', maxBytes: 128 * 1024 },
  { id: 'teams', title: 'Microsoft Teams emoji', size: 128, type: 'png', maxBytes: 256 * 1024 },
  { id: 'discord-emoji', title: 'Discord emoji', size: 128, type: 'png', maxBytes: 256 * 1024 },
  { id: 'discord-sticker', title: 'Discord sticker', size: 320, type: 'png', maxBytes: 512 * 1024 },
  { id: 'telegram', title: 'Telegram sticker', size: 512, type: 'webp', maxBytes: 512 * 1024 },
  { id: 'whatsapp', title: 'WhatsApp sticker', size: 512, type: 'webp', maxBytes: 100 * 1024 },
  { id: 'signal', title: 'Signal sticker', size: 512, type: 'webp', maxBytes: 300 * 1024 },
];

export const stickerServiceOf = (id: string): StickerService | undefined => STICKER_SERVICES.find((s) => s.id === id);

/** The services picked, from the saved comma list (all of them when nothing was saved), in the table's order, ignoring ids that no longer exist. */
export function stickerPick(raw: string | undefined): StickerService[] {
  if (raw === undefined) return STICKER_SERVICES;
  const ids = raw.split(',');
  return STICKER_SERVICES.filter((s) => ids.includes(s.id));
}

/** The picked ids as saved, with one added or taken away. */
export function stickerToggle(raw: string | undefined, id: string, on: boolean): string {
  const ids = new Set(stickerPick(raw).map((s) => s.id));
  if (on) ids.add(id);
  else ids.delete(id);
  return STICKER_SERVICES.filter((s) => ids.has(s.id)).map((s) => s.id).join(',');
}

/** WebP qualities to try, best first, until the picture is light enough. */
export const STICKER_QUALITIES = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];

/** The apps and what each one gets, as a help table: size, type and weight limit, straight from the list above. */
export function stickerTable(): string {
  const rows = STICKER_SERVICES.map((s) => `| ${s.title} | ${s.size} x ${s.size} | ${s.type === 'webp' ? 'WebP' : 'PNG'} | ${kilobytes(s.maxBytes)} |`);
  return ['| App | Size in pixels | Picture | Up to |', '| --- | --- | --- | --- |', ...rows].join('\n');
}

/** "130 KB" style size in plain words. */
export function kilobytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
