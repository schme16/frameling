// A chosen card, button or engine keeps its chosen colours while the mouse is over it: the hover colour is for the ones
// you could still pick, and the chosen text colour is made for the chosen background only (dark on gold). It looked
// disabled when the hover rule won over the chosen one.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_THEMES } from '../../src/ui/themes/builtIn';
import { contrast } from '../../src/ui/themes/color';

const css = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/export/export.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));

/** The selected classes in export.css and the pair of classes that mark them. */
const CHOSEN = ['ex-chosen', 'ex-on'];

describe('chosen export controls under the mouse', () => {
  it('no hover rule that sets a background can reach a chosen control', () => {
    const hovers = rules.filter((r) => r.selector.includes(':hover') && /background\s*:/.test(r.body));
    expect(hovers.length).toBeGreaterThan(2);
    for (const r of hovers) for (const sel of r.selector.split(',').map((s) => s.trim())) {
      // Either it excludes chosen ones, or the chosen rule for that control comes after it at the same weight.
      const subject = /^([.\w\s-]+?)(:hover|$)/.exec(sel)?.[1]?.trim() ?? '';
      const canBeChosen = rules.some((x) => CHOSEN.some((c) => x.selector.startsWith(`${subject}.${c}`)));
      if (!canBeChosen) continue;
      const excludes = CHOSEN.some((c) => sel.includes(`:not(.${c})`));
      const chosenAfter = rules.some((x) => CHOSEN.some((c) => x.selector.startsWith(`${subject}.${c}`) && !x.selector.includes(':hover')) && /background\s*:/.test(x.body) && css.indexOf(x.selector) > css.indexOf(sel) && !sel.includes(':not('));
      expect(excludes || chosenAfter, `${sel} would repaint a chosen control with the hover colour`).toBe(true);
    }
  });

  it('the chosen colours stay readable in every theme', () => {
    for (const t of BUILT_IN_THEMES) expect(contrast(t.tokens['chosen-fg'], t.tokens['chosen-bg']), t.id).toBeGreaterThanOrEqual(4.5);
  });

  it('the ones you could still pick stay readable under the mouse in every theme', () => {
    for (const t of BUILT_IN_THEMES) expect(contrast(t.tokens.text, t.tokens['hover-bg']), t.id).toBeGreaterThanOrEqual(4.5);
  });
});
