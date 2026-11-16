// Chalk and charcoal that catch on paper, written into an SVG: tiny shapes that scale forever, or a baked picture that
// looks right. The question that decides it, when it comes up, and what the Export window says for each answer.
import { afterEach, describe, expect, it } from 'vitest';
import { STARTERS } from '../../src/brushes/starters';
import type { BrushSettings, Doc, StrokeShape } from '../../src/core/format';
import { newDoc } from '../../src/core/doc';
import '../../src/core/render';
import { getChoiceDef, rememberedChoice, setChoice, setChoiceAsker } from '../../src/core/choices';
import { carryWarnings, TOOTH_ASK_NOTE, TOOTH_NOTE, TOOTH_PICTURE_NOTE, toothNote } from '../../src/export/carries';
import { SVG_TOOTH_CHOICE } from '../../src/export/choices';
import { defaultSettings } from '../../src/export/plan';
import { settleSvgTooth, svgHasTooth } from '../../src/export/formats/svg-prep';
import { frameToSvg } from '../../src/export/svg';
import { animatedSvg } from '../../src/export/svg-anim';
import { bakeScale, BAKE_DENSITY, hasToothedLine, isToothed, meetsTooth, withToothPictures } from '../../src/export/svgTooth';
import { addVectorLayer, hold, vectorDrawing } from '../../src/templates/build';
import { buildStroke } from '../../src/tools/vectorStroke';

const pts = Array.from({ length: 30 }, (_, i) => ({ x: 20 + i * 8, y: 60 + Math.sin(i / 4) * 12, p: 0.5 }));
const starter = (id: string): BrushSettings => STARTERS.find((s) => s.id === `starter:${id}`)!.brush;
const charcoal = (): StrokeShape => buildStroke(pts, starter('charcoal'), '#111111', 1, false, 4);
const plain = (): StrokeShape => buildStroke(pts, { ...starter('chalk'), tip: undefined } as BrushSettings, '#111111', 1, false, 4);

function page(shapes: StrokeShape[], opts: { visible?: boolean; length?: number } = {}): Doc {
  const doc = newDoc({ width: 300, height: 120, length: opts.length ?? 4, fps: 12 });
  doc.layers = [];
  const l = addVectorLayer(doc, 'Sketch');
  l.visible = opts.visible ?? true;
  hold(l, vectorDrawing(doc, shapes).id, 0, opts.length ?? 4);
  return doc;
}

const pngSize = (svg: string): { w: number; h: number } => {
  const b = Buffer.from(/base64,([A-Za-z0-9+/=]+)"/.exec(svg)![1], 'base64');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

afterEach(() => {
  setChoice(SVG_TOOTH_CHOICE, undefined);
  setChoiceAsker(null);
});

describe('writing a toothed line into an SVG', () => {
  const doc = page([charcoal()]);

  it('is tiny shapes unless the export asks for a picture', () => {
    const svg = frameToSvg(doc, 0);
    expect(svg).not.toContain('<image');
    expect(svg).toContain('<path');
  });

  it('is one picture per line when it does, with no tiny shapes left, at twice the size the file is written at', () => {
    const svg = withToothPictures('picture', 1, () => frameToSvg(doc, 0));
    expect(svg).not.toContain('<path');
    expect((svg.match(/<image /g) ?? []).length).toBe(1);
    const w = Number(/<image [^>]*width="([\d.]+)"/.exec(svg)![1]);
    expect(pngSize(svg).w / w).toBeCloseTo(BAKE_DENSITY, 1);
    // A bigger file is baked bigger: the same line at scale 2 has four times the pixels.
    const big = withToothPictures('picture', 2, () => frameToSvg(doc, 0, { scale: 2 }));
    expect(pngSize(big).w / pngSize(svg).w).toBeCloseTo(2, 1);
    expect(bakeScale(2)).toBe(4);
  });

  it('leaves the picture alone outside the run: the next writer is back to shapes', () => {
    withToothPictures('picture', 1, () => frameToSvg(doc, 0));
    expect(frameToSvg(doc, 0)).not.toContain('<image');
  });

  it('keeps every other line as it was', () => {
    const mixed = page([charcoal(), plain()]);
    const svg = withToothPictures('picture', 1, () => frameToSvg(mixed, 0));
    expect((svg.match(/<image /g) ?? []).length).toBe(1);
    expect(svg).toContain('<path');
  });

  it('works for a moving SVG, and a drawing held for several frames is baked once', () => {
    const anim = withToothPictures('picture', 1, () => animatedSvg(page([charcoal()], { length: 6 })));
    expect((anim.match(/<image /g) ?? []).length).toBe(1);
    expect(animatedSvg(page([charcoal()], { length: 6 }))).not.toContain('<image');
  });

  it('is a picture the same size whatever the line shows when a trim hides part of it', () => {
    const s = charcoal();
    s.trim = { start: 0, end: 0.5, offset: 0 };
    const half = withToothPictures('picture', 1, () => frameToSvg(page([s]), 0));
    const whole = withToothPictures('picture', 1, () => frameToSvg(doc, 0));
    expect(pngSize(half).w).toBeLessThan(pngSize(whole).w);
  });
});

describe('knowing there is a toothed line in the file', () => {
  it('sees one in a drawing, and not in a plain one', () => {
    expect(isToothed(charcoal())).toBe(true);
    expect(isToothed(plain())).toBe(false);
    expect(hasToothedLine(page([charcoal()]))).toBe(true);
    expect(hasToothedLine(page([plain()]))).toBe(false);
  });

  it('counts only a line that really goes into the file: not a hidden layer', async () => {
    const hidden = page([charcoal()], { visible: false });
    expect(hasToothedLine(hidden)).toBe(true);
    expect(meetsTooth(() => frameToSvg(hidden, 0))).toBe(false);
    expect(await svgHasTooth(hidden, { ...defaultSettings(hidden), format: 'svg', range: 'frame' }, 0)).toBe(false);
    const shown = page([charcoal()]);
    expect(await svgHasTooth(shown, { ...defaultSettings(shown), format: 'svg', range: 'frame' }, 0)).toBe(true);
    expect(await svgHasTooth(shown, { ...defaultSettings(shown), format: 'svganim', range: 'all' }, 0)).toBe(true);
  });
});

describe('the question', () => {
  const doc = page([charcoal()]);
  const s = { ...defaultSettings(doc), format: 'svg' as const, range: 'frame' as const };
  /** A stand in for the sheet: says what it was shown and answers with the next of `values`. */
  function asker(values: string[]) {
    const shown: string[][] = [];
    setChoiceAsker(async (def) => {
      shown.push(def.options.map((o) => o.value));
      const value = values.shift();
      return value ? { value, remember: true } : null;
    });
    return shown;
  }

  it('has three answers, scale forever to begin with, and is not one that must always ask', () => {
    const def = getChoiceDef(SVG_TOOTH_CHOICE)!;
    expect(def.options.map((o) => o.value)).toEqual(['shapes', 'picture', 'ask']);
    expect(def.options.map((o) => o.label)).toEqual(['Scale forever', 'Look right', 'Ask me every time']);
    expect(def.default).toBe('shapes');
    expect(def.mustAsk).toBeFalsy();
    for (const o of def.options) expect(`${o.label} ${o.detail} ${o.did ?? ''} ${def.question}`).not.toMatch(/—/);
  });

  it('asks the first time, and remembers the answer, so the next export does not ask', async () => {
    const shown = asker(['picture']);
    expect((await settleSvgTooth(doc, s, 0)).svgTooth).toBe('picture');
    expect(shown).toEqual([['shapes', 'picture', 'ask']]);
    expect(rememberedChoice(SVG_TOOTH_CHOICE)).toBe('picture');
    expect((await settleSvgTooth(doc, s, 0)).svgTooth).toBe('picture');
    expect(shown.length).toBe(1);
  });

  it('never asks when no such line goes into the file', async () => {
    const shown = asker(['picture']);
    const none = page([plain()]);
    const out = await settleSvgTooth(none, { ...defaultSettings(none), format: 'svg', range: 'frame' }, 0);
    expect(out.svgTooth).toBeUndefined();
    expect(shown.length).toBe(0);
    setChoice(SVG_TOOTH_CHOICE, 'ask');
    expect((await settleSvgTooth(none, { ...defaultSettings(none), format: 'svg', range: 'frame' }, 0)).svgTooth).toBeUndefined();
    expect(shown.length).toBe(0);
  });

  it('a remembered scale forever writes shapes without asking', async () => {
    const shown = asker([]);
    setChoice(SVG_TOOTH_CHOICE, 'shapes');
    expect((await settleSvgTooth(doc, s, 0)).svgTooth).toBe('shapes');
    expect(shown.length).toBe(0);
  });

  it('"Ask me every time" asks on every export, with two answers, and is never forgotten', async () => {
    const shown = asker(['picture', 'shapes', 'picture']);
    setChoice(SVG_TOOTH_CHOICE, 'ask');
    expect((await settleSvgTooth(doc, s, 0)).svgTooth).toBe('picture');
    expect((await settleSvgTooth(doc, s, 0)).svgTooth).toBe('shapes');
    expect((await settleSvgTooth(doc, { ...s, format: 'svganim', range: 'all' }, 0)).svgTooth).toBe('picture');
    expect(shown).toEqual([['shapes', 'picture'], ['shapes', 'picture'], ['shapes', 'picture']]);
    expect(rememberedChoice(SVG_TOOTH_CHOICE)).toBe('ask');
  });

  it('picking "Ask me every time" on the first question remembers that, and still asks this once for the file', async () => {
    const shown = asker(['ask', 'shapes']);
    expect((await settleSvgTooth(doc, s, 0)).svgTooth).toBe('shapes');
    expect(shown).toEqual([['shapes', 'picture', 'ask'], ['shapes', 'picture']]);
    expect(rememberedChoice(SVG_TOOTH_CHOICE)).toBe('ask');
  });

  it('closing the question writes shapes (what it does now) and an answer given in the settings is not asked again', async () => {
    asker([]);
    expect((await settleSvgTooth(doc, s, 0)).svgTooth).toBe('shapes');
    const shown = asker(['picture']);
    expect((await settleSvgTooth(doc, { ...s, svgTooth: 'picture' }, 0)).svgTooth).toBe('picture');
    expect(shown.length).toBe(0);
  });

  it('with no way to ask (a script, a test) it writes shapes, as before', async () => {
    expect((await settleSvgTooth(doc, s, 0)).svgTooth).toBe('shapes');
    expect(rememberedChoice(SVG_TOOTH_CHOICE)).toBeUndefined();
  });
});

describe('what the Export window says', () => {
  const doc = page([charcoal()]);
  it('goes with the answer in force: shapes keep the old note, picture says it is not sharp at any size and bigger, ask says it asks', () => {
    expect(carryWarnings(doc, 'svg')).toContain(TOOTH_NOTE);
    expect(carryWarnings(doc, 'svg', undefined, undefined, 'shapes')).toContain(TOOTH_NOTE);
    const pic = carryWarnings(doc, 'svg', undefined, undefined, 'picture');
    expect(pic).toContain(TOOTH_PICTURE_NOTE);
    expect(pic).not.toContain(TOOTH_NOTE);
    expect(TOOTH_PICTURE_NOTE).toMatch(/not being sharp|stop being sharp/);
    expect(TOOTH_PICTURE_NOTE).toMatch(/twice the size/);
    expect(TOOTH_PICTURE_NOTE).toMatch(/bigger/);
    expect(carryWarnings(doc, 'svganim', undefined, undefined, 'ask')).toContain(TOOTH_ASK_NOTE);
    expect(toothNote(undefined)).toBe(TOOTH_ASK_NOTE);
    for (const n of [TOOTH_NOTE, TOOTH_PICTURE_NOTE, TOOTH_ASK_NOTE]) expect(n).not.toMatch(/—/);
  });

  it('says nothing about it for a drawing with no such line, or a format that draws pictures anyway', () => {
    const none = page([plain()]);
    for (const how of ['shapes', 'picture', 'ask'] as const) expect(carryWarnings(none, 'svg', undefined, undefined, how).join(' ')).not.toMatch(/catch on paper/);
    expect(carryWarnings(doc, 'png', undefined, undefined, 'picture').join(' ')).not.toMatch(/catch on paper/);
  });
});
