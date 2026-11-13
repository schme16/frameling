// Colours that aren't theme tokens but sit on themed panels: guide marks on the rulers, and the hints the newer panels
// use. Every built-in theme of the right mode has to keep them readable.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_THEMES } from '../../src/ui/themes/builtIn';
import { contrast } from '../../src/ui/themes/color';
import { checkContrast } from '../../src/ui/themes/contrast';

const css = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/canvas/canvas.css'), 'utf8');
const guideFor = (mode: 'dark' | 'light') => {
  // The whole-root blocks, not a rule that only narrows one theme's surround: those start with the same selector.
  const block = mode === 'light' ? css.slice(css.indexOf(":root[data-theme='light'] {")) : css.slice(css.indexOf(':root {'));
  return /--guide:\s*(#[0-9a-f]{6})/i.exec(block)![1];
};

describe('guide colour', () => {
  it('stands out 3:1 on the rulers in every theme', () => {
    for (const t of BUILT_IN_THEMES) expect(contrast(guideFor(t.mode), t.tokens.panel), `${t.id} ${guideFor(t.mode)}`).toBeGreaterThanOrEqual(3);
  });
  it('light themes use the same deeper cyan in both places it is set', () => {
    const light = [...css.matchAll(/--guide:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1]);
    expect(light).toHaveLength(3);
    expect(light[1]).toBe(light[2]);
    // And it reads on a white page too.
    expect(contrast(light[1], '#ffffff')).toBeGreaterThanOrEqual(3);
  });
});

describe('hints', () => {
  it('pass 4.5 on both panel shades in every theme (they are words)', () => {
    for (const t of BUILT_IN_THEMES) {
      const r = checkContrast(t.tokens).filter((c) => c.fg === 'faint' && c.words);
      expect(r.length).toBeGreaterThanOrEqual(2);
      for (const c of r) expect(c.ratio, `${t.id} ${c.id}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
