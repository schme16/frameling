// @vitest-environment jsdom
// A vector brush keeps its own paper (card pixel-brush-parity, piece 8): a chalk or charcoal tip may carry `paper`, the
// line it draws catches on that paper whatever the sheet is on, the brush saves and reads it back, an old brush has none
// and follows the sheet, and the paper is a part of the brush that can be put back.
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import type { BrushSettings } from '../../src/core/format';
import { defaultTip, readTip, sameTip } from '../../src/geometry/tip';
import { PAPERS } from '../../src/dry/paper';
import { setPaper } from '../../src/dry/settings';
import { brushesToText, parseBrushesText, sanitizeList, savePreset, type BrushPreset } from '../../src/brushes/model';
import { flashFor, partsOf, withPaperOf, withTipOf } from '../../src/brushes/parts';
import { toothEffects } from '../../src/tools/vectorStroke';

const chalk = (paper?: 'smooth' | 'fine' | 'medium' | 'laid' | 'rough'): BrushSettings => ({ ...DEFAULT_BRUSH, tip: { ...defaultTip('chalk'), ...(paper ? { paper } : {}) } });
const at = (id: string) => PAPERS.findIndex((p) => p.id === id);

describe('a tip that keeps its own paper', () => {
  it('reads back on a chalk or charcoal tip with a stick, and nowhere else', () => {
    expect(readTip({ kind: 'chalk', dry: 'chalk', paper: 'rough' })?.paper).toBe('rough');
    expect(readTip({ kind: 'charcoal', dry: 'vine-charcoal', paper: 'laid' })?.paper).toBe('laid');
    expect(readTip({ kind: 'chalk', paper: 'rough' })?.paper).toBeUndefined();
    expect(readTip({ kind: 'nib', dry: 'chalk', paper: 'rough' })?.paper).toBeUndefined();
    expect(readTip({ kind: 'chalk', dry: 'chalk', paper: 'velvet' })?.paper).toBeUndefined();
    expect(readTip({ kind: 'chalk', dry: 'chalk' })?.paper).toBeUndefined();
  });
  it('makes two tips different when only the paper differs', () => {
    expect(sameTip(chalk('rough').tip, chalk('rough').tip)).toBe(true);
    expect(sameTip(chalk('rough').tip, chalk().tip)).toBe(false);
    expect(sameTip(chalk('rough').tip, chalk('fine').tip)).toBe(false);
  });
});

describe('the line a brush draws', () => {
  it('catches on the brush\'s own paper, and on the sheet\'s when it has none', () => {
    setPaper('smooth');
    expect(toothEffects(chalk('rough'), 1)![0].values.paper).toBe(at('rough'));
    expect(toothEffects(chalk(), 1)![0].values.paper).toBe(at('smooth'));
    setPaper('laid');
    expect(toothEffects(chalk('rough'), 1)![0].values.paper).toBe(at('rough'));
    expect(toothEffects(chalk(), 1)![0].values.paper).toBe(at('laid'));
    setPaper('medium');
  });
});

describe('saving', () => {
  it('keeps the paper in a saved brush, in a brushes file, and reads it back', () => {
    const made = savePreset([], 'Rough chalk', chalk('rough'), 'b1')!;
    const back = parseBrushesText(brushesToText([made.preset as BrushPreset]));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.presets[0].brush.tip?.paper).toBe('rough');
  });
  it('opens an old brush with no paper and leaves it following the sheet', () => {
    const old = sanitizeList([{ id: 'o', name: 'Old chalk', tool: 'brush', brush: { ...DEFAULT_BRUSH, tip: { kind: 'chalk', dry: 'chalk' } } }]);
    expect(old[0].brush.tip?.dry).toBe('chalk');
    expect(old[0].brush.tip?.paper).toBeUndefined();
  });
});

describe('paper as a part of the brush', () => {
  it('is changed when the paper differs from how the brush came, and not the tip', () => {
    const was = chalk('rough');
    const p = partsOf(was, chalk('fine'));
    expect(p).toMatchObject({ changed: true, paper: true, tip: false, stick: false, other: false });
    expect(partsOf(was, chalk('rough')).changed).toBe(false);
    expect(partsOf(chalk(), chalk('fine')).paper).toBe(true);
    expect(partsOf(chalk('fine'), chalk()).paper).toBe(true);
  });
  it('puts only the paper back with withPaperOf, and the tip back without touching the paper', () => {
    const was = chalk('rough');
    const live = { ...chalk('fine'), size: 40 };
    expect(withPaperOf(live, was).tip?.paper).toBe('rough');
    expect(withPaperOf(live, was).size).toBe(40);
    expect(withPaperOf(live, chalk()).tip?.paper).toBeUndefined();
    const tipBack = withTipOf({ ...live, tip: { ...live.tip!, amount: 0.9 } }, was);
    expect(tipBack.tip?.paper).toBe('fine');
    expect(tipBack.tip?.amount).toBe(defaultTip('chalk').amount);
  });
  it('flashes the paper the line is drawn on', () => {
    const a = { id: null, name: '', brush: chalk('rough'), paper: 'rough' as const };
    const b = { id: null, name: '', brush: chalk('fine'), paper: 'fine' as const };
    expect(flashFor(a, b)).toEqual({ parts: ['paper'], text: 'Paper: Fine' });
  });
});
