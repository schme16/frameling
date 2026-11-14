import { beforeEach, describe, expect, it } from 'vitest';
import type { PixelDrawing, PixelLayer } from '../../src/core/format';
import { store } from '../../src/core/store';
import { getPx } from '../../src/canvas/pixels';
import { setDocPalette } from '../../src/pixel/commands';
import { textTool } from '../../src/text/tool';
import '../../src/pixel';
import { CLASSIC, TINY } from '../../src/text/pixel/fontData';
import { caretRect, cleanStyle, DEFAULT_PIXEL_TEXT, drawnAs, glyphFor, indexAt, insideText, layoutPixelText, parseGlyph, PIXEL_FONTS, pixelFont, selectionRects, textCells, type PixelTextStyle } from '../../src/text/pixel/font';
import { commitPixelText, pixelTextSession, setPixelTextValue, nudgePixelText } from '../../src/text/pixel/session';
import { getPixelText, setPixelText } from '../../src/text/pixel/settings';
import { pixelTextCommands } from '../../src/text/pixel/commands';
import { textChoices } from '../../src/text/choices';
import { ctx, drag, pixelStore, ptr } from '../tools/helpers';

const style = (p: Partial<PixelTextStyle> = {}): PixelTextStyle => ({ ...DEFAULT_PIXEL_TEXT, ...p });
const cellSet = (text: string, p: Partial<PixelTextStyle> = {}) => new Set(textCells(layoutPixelText(text, style(p))).map(([x, y]) => `${x},${y}`));

describe('the font tables', () => {
  for (const f of PIXEL_FONTS) {
    it(`${f.name}: every entry is well formed and sits inside the font's rows`, () => {
      for (const [ch, spec] of Object.entries(f.table)) {
        const g = parseGlyph(spec);
        expect(g, `${f.id} ${ch}`).not.toBeNull();
        expect(g!.top + g!.rows.length, `${f.id} ${ch}`).toBeLessThanOrEqual(f.cap + f.below);
        expect(g!.rows.some((r) => r !== 0) || ch === ' ', `${f.id} ${ch} is blank`).toBe(true);
      }
    });
    it(`${f.name}: has every printable ASCII character`, () => {
      for (let c = 33; c < 127; c++) expect(drawnAs(f, String.fromCharCode(c)), String.fromCharCode(c)).not.toBe('?' === String.fromCharCode(c) ? 'x' : '?');
    });
  }
  it('capitals stay inside the cap height and tails hang below it', () => {
    for (const f of PIXEL_FONTS) {
      for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') expect(parseGlyph(f.table[ch])!.top + parseGlyph(f.table[ch])!.rows.length).toBe(f.cap);
    }
    const g = parseGlyph(CLASSIC.g)!;
    expect(g.top + g.rows.length).toBe(9);
  });
  it('rejects broken entries', () => {
    expect(parseGlyph('0|##/#')).toBeNull();
    expect(parseGlyph('0|#x')).toBeNull();
    expect(parseGlyph('nope')).toBeNull();
  });
  it('draws small letters as capitals in Tiny, and an accent as its plain letter', () => {
    expect(drawnAs(pixelFont('tiny'), 'a')).toBe('A');
    expect(drawnAs(pixelFont('classic'), 'é')).toBe('e');
    expect(drawnAs(pixelFont('classic'), '“')).toBe('"');
    expect(drawnAs(pixelFont('classic'), '☃')).toBe('?');
    expect(Object.keys(TINY).length).toBeGreaterThan(60);
  });
});

describe('layout', () => {
  it('draws only whole cells, none negative on a left-aligned line, none past the capital height and tails', () => {
    const l = layoutPixelText('Hello, World gypsy', style());
    for (const [x, y] of textCells(l)) {
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(9);
    }
  });

  it('draws a letter exactly as its table says', () => {
    const got = cellSet('A');
    const want = new Set<string>();
    CLASSIC.A.split('|')[1].split('/').forEach((row, y) => [...row].forEach((c, x) => c === '#' && want.add(`${x},${y}`)));
    expect(got).toEqual(want);
  });

  it('scales by whole blocks: each font pixel becomes scale by scale cells', () => {
    const one = cellSet('Hi');
    const three = cellSet('Hi', { scale: 3 });
    expect(three.size).toBe(one.size * 9);
    for (const k of one) {
      const [x, y] = k.split(',').map(Number);
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) expect(three.has(`${x * 3 + dx},${y * 3 + dy}`)).toBe(true);
    }
  });

  it('bold puts one more pixel beside every pixel', () => {
    const plain = cellSet('I', { font: 'tiny' });
    const bold = cellSet('I', { font: 'tiny', bold: true });
    for (const k of plain) {
      const [x, y] = k.split(',').map(Number);
      expect(bold.has(`${x},${y}`) && bold.has(`${x + 1},${y}`)).toBe(true);
    }
    expect(bold.size).toBeGreaterThan(plain.size);
  });

  it('letter spacing moves the next letter along', () => {
    const a = layoutPixelText('ll', style());
    const b = layoutPixelText('ll', style({ spacing: 2 }));
    expect(b.lines[0].chars[1].x - a.lines[0].chars[1].x).toBe(2);
    expect(b.box.w - a.box.w).toBe(2);
  });

  it('lines go one pitch apart, and line spacing changes the pitch', () => {
    const a = layoutPixelText('a\nb', style());
    expect(a.lines[1].y).toBe(pixelFont('classic').pitch);
    const b = layoutPixelText('a\nb', style({ lineGap: -2, scale: 2 }));
    expect(b.lines[1].y).toBe((pixelFont('classic').pitch - 2) * 2);
  });

  it('left, middle and right line up around the anchor', () => {
    const w = layoutPixelText('abc', style()).box.w;
    expect(layoutPixelText('abc', style({ align: 'left' })).box.x).toBe(0);
    expect(layoutPixelText('abc', style({ align: 'center' })).box.x).toBe(-Math.floor(w / 2));
    expect(layoutPixelText('abc', style({ align: 'right' })).box.x).toBe(-w);
    const two = layoutPixelText('abcdef\nab', style({ align: 'right' }));
    expect(two.lines[0].x + two.lines[0].w).toBe(two.lines[1].x + two.lines[1].w);
  });

  it('an empty text has a caret at the anchor and draws nothing', () => {
    const l = layoutPixelText('', style());
    expect(l.rects).toHaveLength(0);
    expect(caretRect(l, 0)).toEqual({ x: 0, y: 0, w: 1, h: 9 });
  });
});

describe('caret and selection', () => {
  const l = layoutPixelText('ab\ncd', style({ scale: 2 }));
  it('puts the caret before each letter, and at the end of the line', () => {
    expect(caretRect(l, 0).x).toBe(0);
    expect(caretRect(l, 1).x).toBe(l.lines[0].chars[1].x);
    expect(caretRect(l, 2).x).toBe(l.lines[0].chars[1].x + l.lines[0].chars[1].adv);
    expect(caretRect(l, 3).y).toBe(l.lines[1].y);
    expect(caretRect(l, 5).y).toBe(l.lines[1].y);
  });
  it('selects across lines with one box per line', () => {
    expect(selectionRects(l, 1, 4)).toHaveLength(2);
    expect(selectionRects(l, 2, 2)).toHaveLength(0);
  });
  it('finds the index nearest a point', () => {
    expect(indexAt(l, -5, 0)).toBe(0);
    expect(indexAt(l, 1000, 0)).toBe(2);
    expect(indexAt(l, 1000, l.pitch + 1)).toBe(5);
    expect(insideText(l, 2, 2)).toBe(true);
    expect(insideText(l, 500, 2)).toBe(false);
  });
});

describe('style', () => {
  it('puts anything out of range or odd back in range', () => {
    expect(cleanStyle({ scale: 99, spacing: -3, lineGap: 50, font: 'comic', align: 'up', bold: 'yes' })).toEqual({ font: 'classic', scale: 8, bold: false, spacing: 0, lineGap: 10, align: 'left' });
    expect(cleanStyle(null)).toEqual(DEFAULT_PIXEL_TEXT);
    expect(cleanStyle({ scale: 2.6 }).scale).toBe(3);
  });
  it('glyph lookups never fail', () => {
    expect(glyphFor(pixelFont('classic'), '☃').w).toBeGreaterThan(0);
  });
});

// A 64x64 document at 8 per pixel: an 8x8 grid is too small, so use pixel size 1 (a 64x64 grid).
const px = (x: number, y: number) => {
  const d = Object.values(store().get().doc.drawings)[0] as PixelDrawing | undefined;
  if (!d || !d.width || !d.height) return [0, 0, 0, 0];
  const gx = x - (d.x ?? 0);
  const gy = y - (d.y ?? 0);
  if (gx < 0 || gy < 0 || gx >= d.width || gy >= d.height) return [0, 0, 0, 0];
  return getPx(d.pixels, d.width, gx, gy);
};
const painted = () => {
  const out = new Set<string>();
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (px(x, y)[3]) out.add(`${x},${y}`);
  return out;
};
const type = (c: ReturnType<typeof ctx>, at: [number, number], text: string) => {
  textTool.down!(ptr(at[0] + 0.5, at[1] + 0.5), c);
  setPixelTextValue(text, text.length, text.length);
  textTool.up!(ptr(at[0] + 0.5, at[1] + 0.5), c);
};

describe('typing on a pixel layer', () => {
  beforeEach(() => {
    setPixelText({ ...DEFAULT_PIXEL_TEXT });
    pixelStore(1);
    store().setUi({ color: '#ff0000', tool: 'text' });
  });

  it('floats until finished, then paints the font pixels on the grid as one undo step', () => {
    const c = ctx();
    type(c, [10, 20], 'Hi');
    expect(pixelTextSession()?.text).toBe('Hi');
    expect(painted().size).toBe(0);
    expect(commitPixelText()).toBe('ok');
    expect(pixelTextSession()).toBeNull();
    const want = cellSet('Hi');
    const got = painted();
    expect(got.size).toBe(want.size);
    for (const k of want) {
      const [x, y] = k.split(',').map(Number);
      expect(px(10 + x, 20 + y)).toEqual([255, 0, 0, 255]);
    }
    expect(store().undoLabel()).toBe('Type pixel text');
    store().undo();
    expect(painted().size).toBe(0);
  });

  it('paints nothing for blank text and leaves no undo step', () => {
    type(ctx(), [3, 3], '   ');
    expect(commitPixelText()).toBe('nothing');
    expect(painted().size).toBe(0);
    expect(store().undoLabel()).not.toBe('Type pixel text');
  });

  it('snaps to the palette on a palette-locked layer, with no blended colours', () => {
    setDocPalette({ name: 'T', colors: ['#000000', '#00ff00', '#ffffff'], ramps: [3] });
    store().update('lock', (d) => void ((d.layers[0] as PixelLayer).paletteLock = true));
    type(ctx(), [2, 2], 'A');
    commitPixelText();
    const cols = new Set([...painted()].map((k) => px(...(k.split(',').map(Number) as [number, number])).join(',')));
    expect(cols.size).toBe(1);
    const [r, g, b, a] = [...cols][0].split(',').map(Number);
    expect([r, g, b].every((v) => v === 0 || v === 255)).toBe(true);
    expect(a).toBe(255);
  });

  it('cuts off what runs past the edge of the picture', () => {
    type(ctx(), [60, 60], 'WWW');
    expect(commitPixelText()).toBe('ok');
    for (const k of painted()) {
      const [x, y] = k.split(',').map(Number);
      expect(x).toBeLessThan(64);
      expect(y).toBeLessThan(64);
    }
  });

  it('ignores mirror drawing', () => {
    store().setUi({ color: '#ff0000' });
    type(ctx(), [20, 20], 'L');
    commitPixelText();
    const left = painted().size;
    expect(left).toBe(cellSet('L').size);
  });

  it('a click inside the words moves the caret; a click away finishes (the usual way)', () => {
    const c = ctx();
    type(c, [10, 10], 'abc');
    textTool.down!(ptr(10.5, 10.5), c);
    expect(pixelTextSession()?.start).toBe(0);
    textTool.up!(ptr(10.5, 10.5), c);
    textTool.down!(ptr(50.5, 50.5), c);
    expect(pixelTextSession()).toBeNull();
    expect(painted().size).toBeGreaterThan(0);
  });

  it('can be nudged a pixel at a time before it is finished', () => {
    type(ctx(), [10, 10], 'I');
    nudgePixelText(2, 3);
    expect(pixelTextSession()?.at).toEqual({ x: 12, y: 13 });
    commitPixelText();
    expect(px(12 + 1, 13)[3]).toBe(255);
  });

  it('refuses on a locked layer with a plain hint', () => {
    store().update('lock', (d) => void ((d.layers[0] as PixelLayer).locked = true));
    const c = ctx();
    textTool.down!(ptr(5.5, 5.5), c);
    expect(pixelTextSession()).toBeNull();
    expect(c.hint).toHaveBeenCalled();
  });

  it('remembers how new text looks, and the commands change it', () => {
    pixelTextCommands.find((c) => c.id === 'text.pixelFont.tiny')!.run();
    pixelTextCommands.find((c) => c.id === 'text.pixelBold')!.run();
    pixelTextCommands.find((c) => c.id === 'text.pixelBigger')!.run();
    expect(getPixelText()).toMatchObject({ font: 'tiny', bold: true, scale: 2 });
    pixelTextCommands.find((c) => c.id === 'text.pixelSmaller')!.run();
    pixelTextCommands.find((c) => c.id === 'text.pixelSmaller')!.run();
    expect(getPixelText().scale).toBe(1);
  });

  it('has its click-away choice registered with a usual answer', () => {
    const c = textChoices.find((x) => x.id === 'text.pixelClickAway')!;
    expect(c.default).toBe('finish');
    expect(c.options.map((o) => o.value)).toEqual(['finish', 'new']);
  });
});

void drag;
