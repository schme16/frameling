// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cleanDry, DEFAULT_DRY, PRESS_RANGE, SIZE_RANGE } from '../../src/dry/settings';
import { edgeNote } from '../../src/soft/Options';
import { MEDIA } from '../../src/dry/maths';
import { PAPERS } from '../../src/dry/paper';
import { allCommands, getTool } from '../../src/core/registry';
import '../../src/dry';
import { DRY_TOOL, pressFor } from '../../src/dry/tools';

describe('chalk and charcoal settings', () => {
  it('start from the defaults when nothing is saved', () => {
    expect(cleanDry(null)).toEqual(DEFAULT_DRY);
    expect(cleanDry('nonsense')).toEqual(DEFAULT_DRY);
  });

  it('give every medium its own size, edge and pressure from the start', () => {
    for (const m of MEDIA) expect(DEFAULT_DRY.tools[m.id]).toEqual({ size: m.size, hardness: m.hardness, press: m.press });
  });

  it('keep what was saved, held inside the limits', () => {
    const s = cleanDry({ medium: 'crayon', paper: 'rough', tools: { crayon: { size: 9999, hardness: -3, press: 7 }, chalk: { size: 30 } } });
    expect(s.medium).toBe('crayon');
    expect(s.paper).toBe('rough');
    expect(s.tools.crayon).toEqual({ size: SIZE_RANGE.max, hardness: 0, press: PRESS_RANGE.max });
    expect(s.tools.chalk.size).toBe(30);
    expect(s.tools.chalk.press).toBe(DEFAULT_DRY.tools.chalk.press);
  });

  it('ignore a medium, a paper or a number of the wrong kind', () => {
    const s = cleanDry({ medium: 'paint', paper: 'glossy', tools: { crayon: { size: 'big', press: null } } });
    expect(s.medium).toBe(DEFAULT_DRY.medium);
    expect(s.paper).toBe(DEFAULT_DRY.paper);
    expect(s.tools.crayon.size).toBe(DEFAULT_DRY.tools.crayon.size);
  });
});

describe('the chalk and charcoal tool', () => {
  it('is a pixel layer tool with a help topic, so a vector layer never offers it', () => {
    const t = getTool(DRY_TOOL);
    expect(t).toBeDefined();
    expect(t!.layers).toEqual(['pixel']);
    expect(t!.help).toBe('chalk-charcoal');
  });

  it('has a palette command for every medium and every paper', () => {
    const ids = new Set(allCommands().map((c) => c.id));
    for (const m of MEDIA) expect(ids.has(`charcoal.medium.${m.id}`), m.id).toBe(true);
    for (const p of PAPERS) expect(ids.has(`charcoal.paper.${p.id}`), p.id).toBe(true);
  });

  it('shares the Pixel perfect answer with soft paint, and says why the grain is whole pixels', () => {
    expect(edgeNote(true, false, 'smooth', 'airbrush')).toMatch(/palette/);
  });

  it('presses as hard as the Pressure setting says with a mouse, and harder or lighter with a pen', () => {
    expect(pressFor(0.6, { pressure: 0.5, hasPressure: false })).toBe(0.6);
    expect(pressFor(0.6, { pressure: 1, hasPressure: true })).toBeGreaterThanOrEqual(pressFor(0.6, { pressure: 0.1, hasPressure: true }));
    expect(pressFor(1, { pressure: 1, hasPressure: true })).toBeLessThanOrEqual(1);
  });
});
