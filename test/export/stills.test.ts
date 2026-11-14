import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { contactLayout, contactProblem, contactSheetSize, contactSubtitle, thumbSize, CONTACT_GAP, CONTACT_MARGIN } from '../../src/export/contact';
import { buildIcns, buildIco, fitBox, ICNS_TYPES, ICO_SIZES, planFavicon, planIcons, faviconManifest, faviconHtml, readIco, stickerPick, stickerToggle, STICKER_SERVICES } from '../../src/export/icons';
import { defaultSettings, planExport, extensionFor, filtersFor } from '../../src/export/plan';
import { exporterOf } from '../../src/export/registry';
import { plainSettings, readSavedSettings } from '../../src/export/saved';
import { allFormats } from '../../src/export/types';
import { buildAnimatedWebp, jpegQualityOf, stillPicture, webpDelays, webpLosslessOf, webpQualityOf, WebpMakeProblem } from '../../src/export/webp';
import { demuxWebp } from '../../src/pixel/import/webp';

const tag = (t: string) => [...t].map((c) => c.charCodeAt(0));
const chunk = (t: string, data: number[]) => [...tag(t), data.length & 255, (data.length >> 8) & 255, 0, 0, ...data, ...(data.length & 1 ? [0] : [])];
const riff = (parts: number[][]) => {
  const body = [...tag('WEBP'), ...parts.flat()];
  return new Uint8Array([...tag('RIFF'), body.length & 255, (body.length >> 8) & 255, 0, 0, ...body]);
};
/** A still WebP with a fake picture (the muxer never decodes it). */
const lossy = (n: number) => riff([chunk('VP8 ', Array.from({ length: 10 + n }, (_, i) => i))]);
const lossyAlpha = (n: number) => riff([chunk('VP8X', [0x10, 0, 0, 0, 3, 0, 0, 3, 0, 0]), chunk('ALPH', [1, 2, 3, 4, 5]), chunk('VP8 ', Array.from({ length: 10 + n }, (_, i) => i))]);
const lossless = (alpha: boolean) => riff([chunk('VP8L', [0x2f, 3, 0, 0xc0, alpha ? 0x10 : 0, 9, 9, 9])]);

describe('animated WebP', () => {
  it('lifts the picture out of plain, see-through and lossless stills', () => {
    expect(stillPicture(lossy(4))).toMatchObject({ alpha: false, lossless: false });
    expect(stillPicture(lossy(4)).chunks).toHaveLength(1);
    const a = stillPicture(lossyAlpha(4));
    expect(a.alpha).toBe(true);
    expect(a.chunks).toHaveLength(2);
    expect(stillPicture(lossless(true))).toMatchObject({ alpha: true, lossless: true });
    expect(stillPicture(lossless(false)).alpha).toBe(false);
  });

  it('refuses something that is not a WebP picture', () => {
    expect(() => stillPicture(new Uint8Array(30))).toThrow(WebpMakeProblem);
    expect(() => buildAnimatedWebp([], { width: 4, height: 4, loop: true })).toThrow(WebpMakeProblem);
  });

  it('packs frames so the app\'s own WebP reader finds them again', () => {
    const bytes = buildAnimatedWebp(
      [
        { file: lossy(2), ms: 40 },
        { file: lossyAlpha(3), ms: 80 },
        { file: lossy(5), ms: 41 },
      ],
      { width: 300, height: 200, loop: true },
    );
    const anim = demuxWebp(bytes);
    expect(anim.width).toBe(300);
    expect(anim.height).toBe(200);
    expect(anim.loops).toBe(0);
    expect(anim.frames.map((f) => f.delay)).toEqual([40, 80, 41]);
    expect(anim.frames.every((f) => f.x === 0 && f.y === 0 && f.width === 300 && f.height === 200)).toBe(true);
    // Each frame replaces the one before, so a see-through frame does not show the old one through it.
    expect(anim.frames.every((f) => !f.blend && !f.disposeToBackground)).toBe(true);
    // The riff size says the true length.
    expect(new DataView(bytes.buffer).getUint32(4, true)).toBe(bytes.length - 8);
  });

  it('plays once when loop is off, and flags see-through only when a frame has it', () => {
    const once = buildAnimatedWebp([{ file: lossy(1), ms: 10 }, { file: lossy(2), ms: 10 }], { width: 8, height: 8, loop: false });
    expect(demuxWebp(once).loops).toBe(1);
    // VP8X flags: animation (0x02) alone, or with see-through (0x10).
    expect(once[20]).toBe(0x02);
    const see = buildAnimatedWebp([{ file: lossyAlpha(1), ms: 10 }, { file: lossy(2), ms: 10 }], { width: 8, height: 8, loop: true });
    expect(see[20]).toBe(0x12);
  });

  it('gives delays that add up to the real time', () => {
    for (const fps of [8, 12, 24, 30]) {
      const d = webpDelays(fps, fps);
      expect(d.reduce((a, b) => a + b, 0)).toBe(1000);
    }
    expect(webpDelays(3, 24)).toEqual([42, 41, 42]);
  });

  it('reads quality settings with sensible defaults', () => {
    expect(jpegQualityOf({})).toBe(90);
    expect(jpegQualityOf({ jpegQuality: 500 })).toBe(100);
    expect(jpegQualityOf({ jpegQuality: -3 })).toBe(1);
    expect(webpQualityOf({})).toBe(85);
    expect(webpQualityOf({ webpQuality: Number.NaN })).toBe(85);
    expect(webpLosslessOf({}, true)).toBe(true);
    expect(webpLosslessOf({}, false)).toBe(false);
    expect(webpLosslessOf({ webpLossless: false }, true)).toBe(false);
  });
});

describe('icon sets', () => {
  it('plans the default set: PNGs, .ico and .icns, no phone sizes', () => {
    const p = planIcons(undefined, 'star');
    expect(p.pngs.map((x) => x.path)).toContain('png/star-16.png');
    expect(p.pngs.every((x) => x.path.startsWith('png/'))).toBe(true);
    expect(p.ico?.path).toBe('star.ico');
    expect(p.icns?.path).toBe('star.icns');
    expect(p.sizes[0]).toBe(16);
    expect(p.sizes[p.sizes.length - 1]).toBe(1024);
    expect(new Set(p.sizes).size).toBe(p.sizes.length);
  });

  it('adds the phone sizes in the folders each side expects', () => {
    const p = planIcons({ mobile: true, png: false, ico: false, icns: false }, 'star');
    const paths = p.pngs.map((x) => x.path);
    expect(paths).toContain('ios/icon-1024.png');
    expect(paths).toContain('ios/icon-180.png');
    expect(paths).toContain('android/mipmap-xxxhdpi/ic_launcher.png');
    expect(paths).toContain('android/play-store-512.png');
    expect(p.ico).toBeUndefined();
    expect(p.icns).toBeUndefined();
  });

  it('makes nothing when nothing is ticked', () => {
    const p = planIcons({ png: false, ico: false, icns: false, mobile: false }, 'x');
    expect(p.sizes).toEqual([]);
    expect(p.pngs).toEqual([]);
  });

  it('writes an .ico whose directory points at each picture', () => {
    const imgs = ICO_SIZES.map((size) => ({ size, png: new Uint8Array([size & 255, 1, 2, 3]) }));
    const ico = buildIco(imgs.reverse());
    const list = readIco(ico);
    expect(list.map((e) => e.size)).toEqual(ICO_SIZES);
    for (const e of list) expect(Array.from(ico.subarray(e.offset, e.offset + e.length))).toEqual([e.size & 255, 1, 2, 3]);
    // 256 is stored as 0 in the directory.
    expect(ico[6 + 16 * (ICO_SIZES.length - 1)]).toBe(0);
  });

  it('writes an .icns with each size under its four letters', () => {
    const icns = buildIcns(ICNS_TYPES.map((t) => ({ type: t.type, png: new Uint8Array(t.size % 7 + 1) })));
    const v = new DataView(icns.buffer);
    expect(String.fromCharCode(...icns.subarray(0, 4))).toBe('icns');
    expect(v.getUint32(4, false)).toBe(icns.length);
    let at = 8;
    const types: string[] = [];
    while (at < icns.length) {
      types.push(String.fromCharCode(...icns.subarray(at, at + 4)));
      at += v.getUint32(at + 4, false);
    }
    expect(at).toBe(icns.length);
    expect(types).toEqual(ICNS_TYPES.map((t) => t.type));
  });

  it('fits a drawing that is not square, or fills the square', () => {
    expect(fitBox(100, 100, 64, 'fit')).toMatchObject({ width: 64, height: 64, x: 0, y: 0 });
    const wide = fitBox(200, 100, 64, 'fit');
    expect(wide).toMatchObject({ width: 64, height: 32, x: 0, y: 16 });
    const fill = fitBox(200, 100, 64, 'fill');
    expect(fill).toMatchObject({ width: 128, height: 64, x: -32, y: 0 });
    expect(fitBox(1, 1000, 16, 'fit').width).toBe(1);
  });

  it('plans a favicon with its own manifest and head lines', () => {
    const f = planFavicon();
    expect(f.ico.path).toBe('favicon.ico');
    expect(f.pngs.map((p) => p.path)).toEqual(expect.arrayContaining(['favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']));
    expect(f.pngs.find((p) => p.path === 'apple-touch-icon.png')?.size).toBe(180);
    const m = JSON.parse(faviconManifest('My "Game" <1>'));
    expect(m.name).toBe('My "Game" <1>');
    expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512']);
    for (const href of ['/favicon.ico', '/apple-touch-icon.png', '/site.webmanifest']) expect(faviconHtml()).toContain(href);
  });
});

describe('sticker packs', () => {
  it('knows every app, once, with a square size', () => {
    expect(new Set(STICKER_SERVICES.map((s) => s.id)).size).toBe(STICKER_SERVICES.length);
    expect(STICKER_SERVICES.map((s) => s.id)).toEqual(expect.arrayContaining(['slack', 'teams', 'discord-emoji', 'telegram', 'whatsapp', 'signal']));
  });

  it('picks all apps when nothing is saved, and only the listed ones otherwise', () => {
    expect(stickerPick(undefined)).toHaveLength(STICKER_SERVICES.length);
    expect(stickerPick('slack,telegram').map((s) => s.id)).toEqual(['slack', 'telegram']);
    expect(stickerPick('')).toEqual([]);
    expect(stickerPick('slack,gone-app').map((s) => s.id)).toEqual(['slack']);
  });

  it('turns one app on or off and keeps the table order', () => {
    expect(stickerToggle(undefined, 'slack', false)).not.toContain('slack');
    expect(stickerToggle('telegram', 'slack', true)).toBe('slack,telegram');
    expect(stickerToggle('slack', 'slack', false)).toBe('');
  });
});

describe('contact sheets', () => {
  const spec = { cellW: 240, cellH: 160, labels: true };

  it('puts every frame in its own place, inside the page', () => {
    const l = contactLayout({ ...spec, count: 10, columns: 4 });
    expect(l.columns).toBe(4);
    expect(l.rows).toBe(3);
    expect(l.cells).toHaveLength(10);
    expect(l.cells[0]).toMatchObject({ x: CONTACT_MARGIN });
    expect(l.cells[1].x - l.cells[0].x).toBe(spec.cellW + CONTACT_GAP);
    expect(l.cells[4].y).toBeGreaterThan(l.cells[0].y);
    expect(l.cells[4].x).toBe(l.cells[0].x);
    for (const c of l.cells) {
      expect(c.x + spec.cellW).toBeLessThanOrEqual(l.width - CONTACT_MARGIN);
      expect(c.y + spec.cellH + l.labelH).toBeLessThanOrEqual(l.height - CONTACT_MARGIN);
    }
    const seen = new Set(l.cells.map((c) => `${c.x},${c.y}`));
    expect(seen.size).toBe(10);
  });

  it('never has more columns than frames, and leaves room for numbers only when asked', () => {
    expect(contactLayout({ ...spec, count: 3, columns: 20 }).columns).toBe(3);
    const a = contactLayout({ ...spec, count: 6, columns: 3 });
    const b = contactLayout({ ...spec, count: 6, columns: 3, labels: false });
    expect(a.height).toBeGreaterThan(b.height);
    expect(b.labelH).toBe(0);
  });

  it('picks a page shaped columns count by itself', () => {
    const one = contactLayout({ ...spec, count: 1, columns: 0 });
    expect(one.columns).toBe(1);
    const many = contactLayout({ ...spec, count: 24, columns: 0 });
    expect(many.columns).toBeGreaterThan(2);
    expect(many.columns).toBeLessThan(24);
    expect(many.width / many.height).toBeGreaterThan(0.9);
    expect(many.width / many.height).toBeLessThan(2.2);
  });

  it('scales the small pictures to the longest side and says when a page is too big', () => {
    expect(thumbSize(200, 100, 100)).toEqual({ width: 100, height: 50 });
    expect(thumbSize(10, 1000, 100)).toEqual({ width: 1, height: 100 });
    expect(contactProblem(contactLayout({ ...spec, count: 12, columns: 4 }))).toBeNull();
    expect(contactProblem(contactLayout({ ...spec, count: 5000, columns: 1 }))).toMatch(/too big/);
  });

  it('writes the subtitle in plain words', () => {
    expect(contactSubtitle(1, 12, 64, 48)).toBe('1 frame, 12 per second, 64 × 48');
    expect(contactSubtitle(24, 12.5, 64, 48)).toBe('24 frames, 12.5 per second, 64 × 48');
  });
});

describe('the new formats in the registry', () => {
  const doc = newDoc({ name: 'Star', width: 100, height: 60, fps: 12, length: 6 });

  it('lists them with the endings the files really have', () => {
    const ids = allFormats().map((f) => f.id);
    for (const id of ['jpeg', 'webp', 'icons', 'favicon', 'stickers', 'contact']) expect(ids).toContain(id);
    expect(extensionFor({ format: 'jpeg' })).toBe('jpg');
    expect(filtersFor('jpeg')[0].extensions).toEqual(['jpg', 'jpeg']);
    expect(extensionFor({ format: 'webp' })).toBe('webp');
    expect(extensionFor({ format: 'icons' })).toBe('zip');
    expect(extensionFor({ format: 'contact' })).toBe('png');
  });

  it('knows which can be see-through and which show one frame', () => {
    const info = (id: string) => allFormats().find((f) => f.id === id)!;
    expect(info('jpeg')).toMatchObject({ alpha: false, animated: false });
    expect(info('contact')).toMatchObject({ alpha: false, animated: true });
    expect(info('webp')).toMatchObject({ alpha: true, animated: true });
    expect(info('icons').animated).toBe(false);
    expect(info('stickers').animated).toBe(true);
  });

  it('plans one frame for stills and the whole animation for a WebP', () => {
    const base = defaultSettings(doc);
    expect(planExport(doc, { ...base, format: 'jpeg' }, 2).count).toBe(1);
    expect(planExport(doc, { ...base, format: 'icons' }, 2).range).toEqual({ start: 2, end: 2 });
    expect(planExport(doc, { ...base, format: 'webp', range: 'all' }, 2).count).toBe(6);
    expect(planExport(doc, { ...base, format: 'contact', range: 'all' }, 2).count).toBe(6);
  });

  it('names a set after the drawing, with no frame number, and a still with one', () => {
    const base = defaultSettings(doc);
    expect(planExport(doc, { ...base, format: 'icons' }, 2).name).toBe('Star-icons');
    expect(planExport(doc, { ...base, format: 'favicon' }, 2).name).toBe('Star-favicon');
    expect(planExport(doc, { ...base, format: 'stickers', range: 'frame' }, 2).name).toBe('Star-stickers');
    expect(planExport(doc, { ...base, format: 'contact' }, 2).name).toBe('Star-contact-sheet');
    expect(planExport(doc, { ...base, format: 'jpeg' }, 2).name).toBe('Star-frame-3');
  });

  it('stops a sticker pack with no app ticked, and a contact sheet that is far too big', () => {
    const base = defaultSettings(doc);
    expect(planExport(doc, { ...base, format: 'stickers', stickerFor: '' }, 0).problem).toBe('Pick at least one app.');
    expect(planExport(doc, { ...base, format: 'stickers' }, 0).problem).toBeNull();
    const long = newDoc({ name: 'Long', width: 100, height: 100, length: 5000 });
    const p = planExport(long, { ...defaultSettings(long), format: 'contact', range: 'all', contactColumns: 1, contactSize: 'large' }, 0);
    expect(p.problem).toMatch(/too big|lot of frames/);
    expect(contactSheetSize(doc, 6, {}).layout.cells).toHaveLength(6);
  });

  it('every new format says what it keeps and has a loader', () => {
    for (const id of ['jpeg', 'webp', 'icons', 'favicon', 'stickers', 'contact']) {
      const d = exporterOf(id)!;
      expect(d.carry.summary.length).toBeGreaterThan(10);
      expect(d.carry.help).toBeTruthy();
      expect(typeof d.load).toBe('function');
    }
  });

  it('keeps the new choices when settings are saved in the drawing and read back', () => {
    const s = { ...defaultSettings(doc), format: 'icons', iconFiles: { mobile: true, ico: false }, stickerFor: 'slack,teams', jpegQuality: 70, webpQuality: 60, webpLossless: true, contactSize: 'large', contactColumns: 5, contactLabels: false, contactPage: 'dark' };
    const back = readSavedSettings(JSON.parse(JSON.stringify(plainSettings(s))));
    expect(back).toMatchObject({ iconFiles: { mobile: true, ico: false }, stickerFor: 'slack,teams', jpegQuality: 70, webpQuality: 60, webpLossless: true, contactSize: 'large', contactColumns: 5, contactLabels: false, contactPage: 'dark' });
  });

  it('opens a drawing saved before these existed with the usual defaults', () => {
    const old = readSavedSettings({ format: 'png', range: 'all', scale: 1, transparent: true });
    expect(old).not.toBeNull();
    const s = defaultSettings(doc);
    expect(s.jpegQuality).toBeUndefined();
    expect(s.iconFiles).toBeUndefined();
    expect(planIcons(s.iconFiles, 'x').sizes.length).toBeGreaterThan(0);
  });
});
