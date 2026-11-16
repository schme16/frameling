// @vitest-environment jsdom
// The Library's pictures of the soft paint tools and the dry media are the real tool's own stroke. Each is held to the
// tool: the same moves made through the real tool on a real pixel layer give the same pixels, so a picture cannot go back
// to being the nearest plain dab brush (a solid worm for a highlighter that is really see-through).
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { gridPixels } from '../../src/core/pixelBounds';
import { getTool } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { _resetChoicesForTests } from '../../src/core/choices';
import { setToolSettings } from '../../src/tools/settings';
import { activeDrawing, activeGrid, setActivePixels } from '../../src/tools/edit';
import { setPixelSettings } from '../../src/pixel/settings';
import { setSoftTool } from '../../src/soft/settings';
import { setDryTool, setMedium, setPaper } from '../../src/dry/settings';
import { MEDIA } from '../../src/dry/maths';
import { PIXEL_STARTERS } from '../../src/brushes/pixelStarters';
import { renderPixelPreview, previewInk, previewSize, underlay, wavePoints, LIVELY_INK, PIXEL_PREVIEW_SEED, needsBase } from '../../src/brushes/pixelPreview';
import type { PixelSpec } from '../../src/dab/spec';
import { ctx, drag, ptr } from '../tools/helpers';
import '../../src/soft';
import '../../src/dry';

const W = 220;
const H = 30;
const INK: [number, number, number] = [38, 37, 44];
const hex = (c: number[]) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

beforeEach(() => {
  _resetChoicesForTests();
  resetStore(newDoc({ width: W, height: H, pixel: { pixelSize: 1 } }));
  setPixelSettings({ symmetry: 'off' });
  setToolSettings({ pixelPerfect: false });
  store().setUi({ color: hex(INK) });
  // The real dry stroke picks its stick at random; the picture fixes it.
  vi.spyOn(Math, 'random').mockReturnValue((PIXEL_PREVIEW_SEED + 0.5) / 1e9);
});
afterEach(() => vi.restoreAllMocks());

const grid = () => gridPixels(activeDrawing() as never, activeGrid()!.width, activeGrid()!.height);

/** Makes the real tool for a spec ready (its settings, the picture under it) and returns the tool's id. */
function ready(spec: PixelSpec, kind: 'stroke' | 'dab'): string {
  if (spec.kind === 'dab') throw new Error('not a soft or dry spec');
  const size = previewSize(spec.size, H);
  const base = underlay(spec, W, H, INK, kind);
  if (base.some((v) => v)) expect(setActivePixels('under', base)).toBe('ok');
  if (spec.kind === 'dry') {
    setMedium(spec.medium);
    setPaper(spec.paper ?? 'medium');
    setDryTool(spec.medium, { size, hardness: spec.hardness, press: spec.press });
    return 'charcoal';
  }
  setSoftTool(spec.tool, { size, hardness: spec.hardness, flow: spec.flow });
  return spec.tool;
}

/** What the real tool lays down for the picture's moves. A smudge dab is a short pull, as the picture draws it. */
function real(spec: PixelSpec, kind: 'stroke' | 'dab'): Uint8ClampedArray {
  const id = ready(spec, kind);
  const t = getTool(id)!;
  const size = previewSize((spec as { size: number }).size, H);
  const pts: [number, number][] =
    kind === 'stroke'
      ? wavePoints(W, H).map((p) => [p.x, p.y])
      : id === 'smudge'
        ? [-1, -0.5, 0, 0.5, 1].map((k): [number, number] => [W / 2 + k * Math.min(size, W / 3), H / 2])
        : [[W / 2, H / 2], [W / 2, H / 2]];
  drag(t, ctx(), pts);
  return grid().slice();
}

const SOFT: PixelSpec[] = (['soft-brush', 'airbrush', 'highlighter', 'soft-eraser', 'smudge'] as const).map((tool) => ({ kind: 'soft', tool, size: 16, hardness: 0.5, flow: 0.7 }));
const DRY: PixelSpec[] = MEDIA.map((m) => ({ kind: 'dry', medium: m.id, paper: 'medium', size: m.size, hardness: m.hardness, press: m.press }));

describe('the soft paint and dry media pictures are the real tool', () => {
  it('has a picture of the real tool for every soft and dry brush that ships', () => {
    const shipped = PIXEL_STARTERS.map((b) => b.pixel).filter((p): p is PixelSpec => !!p && p.kind !== 'dab');
    expect(shipped.length).toBeGreaterThanOrEqual(9);
    for (const s of shipped) {
      const px = renderPixelPreview(s, 'stroke', W, H, INK);
      expect(px.some((v, i) => i % 4 === 3 && v > 0), s.kind === 'soft' ? s.tool : s.kind === 'dry' ? s.medium : '').toBe(true);
    }
  });

  for (const kind of ['stroke', 'dab'] as const) {
    for (const spec of [...SOFT, ...PIXEL_STARTERS.map((b) => b.pixel).filter((p): p is PixelSpec => !!p && p.kind !== 'dab'), ...DRY]) {
      const name = spec.kind === 'soft' ? spec.tool : spec.kind === 'dry' ? spec.medium : '';
      it(`draws the ${kind} of ${name} (${spec.kind === 'dry' ? spec.paper : spec.kind === 'soft' ? Math.round(spec.hardness * 10) : ''}) the way the real tool does`, () => {
        const mine = renderPixelPreview(spec, kind, W, H, INK);
        const tool = real(spec, kind);
        let n = 0;
        let first = '';
        for (let i = 0; i < mine.length; i++) {
          // A pixel with no paint has no colour worth comparing.
          const clear = mine[i - (i % 4) + 3] === 0 && tool[i - (i % 4) + 3] === 0;
          if (!clear && mine[i] !== tool[i]) {
            n++;
            first ||= `pixel ${(i / 4) | 0} channel ${i % 4}: picture ${mine[i]}, tool ${tool[i]}`;
          }
        }
        expect(n, first).toBe(0);
      });
    }
  }
});

describe('what the pictures say', () => {
  it('shows a highlighter see-through: the words under it stay dark and the paper beside them takes the tint', () => {
    const spec: PixelSpec = { kind: 'soft', tool: 'highlighter', size: 20, hardness: 0.9, flow: 0.8 };
    const under = underlay(spec, W, H, INK);
    const px = renderPixelPreview(spec, 'stroke', W, H, INK);
    let word = 0;
    let wordCount = 0;
    let blank = 0;
    for (let i = 0; i < W * H; i++) {
      if (px[i * 4 + 3] === 0) continue;
      if (under[i * 4 + 3] === 255) {
        word = Math.min(word || 255, px[i * 4 + 3]);
        wordCount++;
      } else blank = Math.max(blank, px[i * 4 + 3]);
    }
    // Over a word it stays fully solid; on empty paper the most it gets is the highlight's own see-through strength.
    expect(wordCount).toBeGreaterThan(100);
    expect(word).toBe(255);
    expect(blank).toBeLessThan(255);
    expect(blank).toBeGreaterThan(150);
  });

  it('shows the airbrush lighter than the soft brush, because one pass of it is', () => {
    const peak = (tool: 'airbrush' | 'soft-brush') => {
      const spec: PixelSpec = { kind: 'soft', tool, size: 28, hardness: 0, flow: tool === 'airbrush' ? 0.3 : 1 };
      const px = renderPixelPreview(spec, 'stroke', W, H, INK);
      return Math.max(...Array.from(px).filter((_, i) => i % 4 === 3));
    };
    expect(peak('airbrush')).toBeLessThan(peak('soft-brush') * 0.6);
  });

  it('shows a soft eraser as a cut through something, and smudge as a smear of two tones', () => {
    const eraser: PixelSpec = { kind: 'soft', tool: 'soft-eraser', size: 12, hardness: 0.3, flow: 1 };
    const bar = underlay(eraser, W, H, INK);
    const cut = renderPixelPreview(eraser, 'stroke', W, H, INK);
    let gone = 0;
    for (let i = 3; i < cut.length; i += 4) if (bar[i] === 255 && cut[i] < 100) gone++;
    expect(gone).toBeGreaterThan(300);
    expect(needsBase(eraser)).toBe(true);
    const smudge: PixelSpec = { kind: 'soft', tool: 'smudge', size: 12, hardness: 0.3, flow: 0.6 };
    const before = underlay(smudge, W, H, INK);
    const after = renderPixelPreview(smudge, 'stroke', W, H, INK);
    let moved = 0;
    for (let i = 3; i < after.length; i += 4) if (after[i] !== before[i]) moved++;
    expect(moved).toBeGreaterThan(200);
  });

  it('shows dry media with the paper showing through, so some of the stroke is see-through', () => {
    for (const m of MEDIA) {
      const px = renderPixelPreview({ kind: 'dry', medium: m.id, paper: 'rough', size: 14, hardness: m.hardness, press: m.press }, 'stroke', W, H, INK);
      const alphas = new Set<number>();
      for (let i = 3; i < px.length; i += 4) alphas.add(px[i]);
      expect(alphas.size, m.id).toBeGreaterThan(8);
    }
  });

  it('is the same picture every time it is drawn', () => {
    for (const spec of [...SOFT, ...DRY]) expect(Array.from(renderPixelPreview(spec, 'stroke', W, H, INK))).toEqual(Array.from(renderPixelPreview(spec, 'stroke', W, H, INK)));
  });

  it('draws a brush that swings hue in a lively colour when the ink is grey, and leaves a colourful ink alone', () => {
    const rainbow = PIXEL_STARTERS.find((b) => b.name === 'Rainbow trail')!.pixel!;
    const plain = PIXEL_STARTERS.find((b) => b.name === 'Round 6')!.pixel!;
    expect(previewInk(rainbow, INK)).toEqual(LIVELY_INK);
    expect(previewInk(rainbow, [200, 30, 30])).toEqual([200, 30, 30]);
    expect(previewInk(plain, INK)).toEqual(INK);
  });
});

describe('no picture goes back to the nearest dab brush', () => {
  it('the picker draws pixel pictures through pixelPreview, never the dab sample directly', () => {
    const src = readFileSync('src/brushes/PixelSample.tsx', 'utf8');
    expect(src).toMatch(/renderPixelPreview/);
    expect(src).not.toMatch(/renderSample\(/);
  });
});
