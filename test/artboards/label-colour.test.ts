// The artboard names on the pasteboard read in every built-in theme (the open board's gold was pale on cream).
import { describe, expect, it } from 'vitest';
import { readableOn } from '../../src/artboards/labelColor';
import { BUILT_IN_THEMES } from '../../src/ui/themes/builtIn';
import { contrast } from '../../src/ui/themes/color';

describe('readableOn', () => {
  it('keeps a colour that already reads', () => {
    expect(readableOn('#121019', '#ffc94a').toLowerCase()).toBe('#ffc94a');
  });
  it('darkens a pale gold on a cream pasteboard, keeping it gold', () => {
    const out = readableOn('#fbf6ea', '#ffc94a');
    expect(out.toLowerCase()).not.toBe('#ffc94a');
    expect(contrast(out, '#fbf6ea')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('board names in every built-in theme', () => {
  for (const t of BUILT_IN_THEMES) {
    it(`${t.id}: the open board's name and the others' read on the pasteboard`, () => {
      const k = t.tokens;
      expect(contrast(readableOn(k['canvas-bg'], k['chosen-bg']), k['canvas-bg']), 'open').toBeGreaterThanOrEqual(4.5);
      expect(contrast(readableOn(k['canvas-bg'], k.muted), k['canvas-bg']), 'other').toBeGreaterThanOrEqual(4.5);
    });
  }
});
