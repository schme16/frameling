import { describe, expect, it } from 'vitest';
import type { TextShape } from '../../src/core/format';
import { newDoc, newVectorLayer, uid } from '../../src/core/doc';
import { poseAt } from '../../src/core/symbols';
import { activeAnimators, animatorEnd, applyAnimator, cssFont, estimateMeasure, fontFamilyCss, glyphLooks, layoutText, newAnimator, newTextShape, pieceOrder, piecesOf, PLAIN, TEXT_ANIMS } from '../../src/text/model';
import { readTextShape } from '../../src/text/read';
import { loadFile, saveFile } from '../../src/io/file';
import { textToSvg } from '../../src/text/exports';

const text = (t: string, patch: Partial<TextShape> = {}) => newTextShape('t1', { x: 10, y: 50 }, { text: t, ...patch });

describe('text layout', () => {
  it('places glyphs left to right with letter spacing, and lines below each other', () => {
    const l = layoutText(text('ab\ncd', { size: 20, letterSpacing: 2, lineHeight: 1.5 }), estimateMeasure);
    expect(l.lines).toHaveLength(2);
    expect(l.lines[1].y).toBe(30);
    const [a, b] = l.glyphs;
    expect(a.x).toBe(0);
    expect(b.x).toBeCloseTo(estimateMeasure('a', cssFont({ font: 'Nunito', weight: 700 }, 20)) + 2);
    expect(l.letters).toBe(4);
    expect(l.words).toBe(2);
  });

  it('centres and right-aligns lines on the origin', () => {
    const c = layoutText(text('hello', { align: 'center' }), estimateMeasure);
    expect(c.lines[0].x).toBeCloseTo(-c.lines[0].w / 2);
    const r = layoutText(text('hello', { align: 'right' }), estimateMeasure);
    expect(r.lines[0].x).toBeCloseTo(-r.lines[0].w);
  });

  it('counts words and skips spaces as pieces', () => {
    const l = layoutText(text('one two  three'), estimateMeasure);
    expect(piecesOf(l, 'word')).toHaveLength(3);
    expect(piecesOf(l, 'letter')).toHaveLength(11);
    expect(piecesOf(l, 'line')).toHaveLength(1);
  });

  it('quotes system fonts and maps the shipped ones to their variable families', () => {
    expect(fontFamilyCss('Nunito')).toContain('Nunito Variable');
    expect(fontFamilyCss('Comic "Sans')).toBe('"Comic Sans", sans-serif');
  });
});

describe('text animators', () => {
  it('has a plain label and the industry term for each kind', () => {
    expect(TEXT_ANIMS.map((a) => a.kind)).toEqual(['fade', 'slide', 'scale', 'rotate', 'typewriter', 'wave']);
    for (const a of TEXT_ANIMS) expect(a.description).not.toMatch(/—/);
  });

  it('orders pieces forward, backward, from the middle and shuffled (repeatably)', () => {
    expect(pieceOrder(4, 'forward')).toEqual([0, 1, 2, 3]);
    expect(pieceOrder(4, 'backward')).toEqual([3, 2, 1, 0]);
    expect(pieceOrder(5, 'middle')).toEqual([1, 1, 0, 1, 2].map((_, i) => [2, 1, 0, 1, 2][i]));
    const r = pieceOrder(8, 'random', 3);
    expect([...r].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(pieceOrder(8, 'random', 3)).toEqual(r);
  });

  it('fades in: invisible before its turn, solid once done; out the other way', () => {
    const a = { ...newAnimator('fade', 'a'), duration: 4, stagger: 2, ease: 'linear' as const };
    expect(applyAnimator(PLAIN, a, 0, 0).opacity).toBe(0);
    expect(applyAnimator(PLAIN, a, 0, 2).opacity).toBeCloseTo(0.5);
    expect(applyAnimator(PLAIN, a, 0, 4).opacity).toBe(1);
    expect(applyAnimator(PLAIN, a, 3, 6).opacity).toBe(0);
    const out = { ...a, direction: 'out' as const };
    expect(applyAnimator(PLAIN, out, 0, 0).opacity).toBe(1);
    expect(applyAnimator(PLAIN, out, 0, 4).opacity).toBe(0);
  });

  it('slides, grows, spins, types on and waves', () => {
    const slide = { ...newAnimator('slide', 's'), amount: 40, angle: 90, ease: 'linear' as const, duration: 10 };
    expect(applyAnimator(PLAIN, slide, 0, 0).dy).toBeCloseTo(40);
    expect(applyAnimator(PLAIN, slide, 0, 10).dy).toBeCloseTo(0);
    const grow = { ...newAnimator('scale', 'g'), amount: 0, ease: 'linear' as const, duration: 10 };
    expect(applyAnimator(PLAIN, grow, 0, 0).scale).toBeCloseTo(0);
    expect(applyAnimator(PLAIN, grow, 0, 5).scale).toBeCloseTo(0.5);
    const spin = { ...newAnimator('rotate', 'r'), amount: -90, ease: 'linear' as const, duration: 10 };
    expect(applyAnimator(PLAIN, spin, 0, 0).rotation).toBe(-90);
    const type = { ...newAnimator('typewriter', 'y'), stagger: 2 };
    expect(applyAnimator(PLAIN, type, 3, 5).opacity).toBe(0);
    expect(applyAnimator(PLAIN, type, 3, 6).opacity).toBe(1);
    const wave = { ...newAnimator('wave', 'w'), amount: 10, duration: 8, stagger: 0 };
    expect(applyAnimator(PLAIN, wave, 0, 2).dy).toBeCloseTo(-10);
    expect(applyAnimator(PLAIN, wave, 0, 6).dy).toBeCloseTo(10);
  });

  it('moves a word as one piece around its middle', () => {
    const s = text('hi there', { animators: [{ ...newAnimator('rotate', 'r'), by: 'word', ease: 'linear' }] });
    const l = layoutText(s, estimateMeasure);
    const looks = glyphLooks(s, l, 0);
    expect(looks[0].cx).toBe(looks[1].cx);
    expect(looks[3].cx).not.toBe(looks[0].cx);
    expect(animatorEnd(s, l)).toBe(0 + 1 * 2 + 12);
  });

  it('skips animators that are turned off', () => {
    const s = text('x', { animators: [{ ...newAnimator('fade', 'a'), on: false }] });
    expect(activeAnimators(s)).toHaveLength(0);
  });
});

describe('text in documents', () => {
  it('poses animated text per frame and leaves still text alone', () => {
    const doc = newDoc({ width: 100, height: 100 });
    const layer = newVectorLayer('T');
    const animated = text('go', { id: 'a', animators: [newAnimator('fade', 'f')] });
    const still = text('stay', { id: 'b' });
    const d = { id: uid('v'), kind: 'vector' as const, shapes: [animated, still] };
    doc.drawings[d.id] = d;
    layer.cels = [{ id: 'c', start: 2, length: 10, drawingId: d.id }];
    doc.layers = [layer];
    const p5 = poseAt(doc, layer, 5);
    const p6 = poseAt(doc, layer, 6);
    expect(p5).not.toBe(d);
    expect(p5).toBe(poseAt(doc, layer, 5));
    expect(p5).not.toBe(p6);
    const a5 = p5!.kind === 'vector' ? p5!.shapes[0] : null;
    expect((a5 as { posedFrame?: number }).posedFrame).toBe(3);
    expect(p5!.kind === 'vector' && p5!.shapes[1]).toBe(still);
  });

  it('saves and opens text with its animators, and repairs bad values', () => {
    const doc = newDoc({ width: 100, height: 100 });
    const s = text('Hello', { id: 'tx', italic: true, animators: [{ ...newAnimator('slide', 'a1'), order: 'random', seed: 4 }] });
    const id = Object.keys(doc.drawings)[0] ?? 'v1';
    doc.drawings[id] = { id, kind: 'vector', shapes: [s] };
    doc.layers[0].cels = [{ id: 'c', start: 0, length: 1, drawingId: id }];
    const back = loadFile(saveFile(doc)).doc;
    const d = back.drawings[id];
    expect(d.kind === 'vector' && d.shapes[0]).toEqual(s);
    const bad = readTextShape({ id: 'x', text: 'a', size: -4, weight: 5000, align: 'up', animators: [{ id: 'q', kind: 'nope' }, { id: 'r', kind: 'wave', duration: 0 }] });
    expect(bad!.size).toBe(0.5);
    expect(bad!.weight).toBe(900);
    expect(bad!.align).toBe('left');
    expect(bad!.animators).toHaveLength(1);
    expect(bad!.animators![0].duration).toBe(1);
    expect(readTextShape({ id: 'x' })).toBeNull();
  });

  it('exports to SVG as real text', () => {
    const svg = textToSvg(text('A & B', { color: '#ff000080' }));
    expect(svg).toContain('<text');
    expect(svg).toContain('A &amp; B');
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('opacity="0.5"');
  });
});
