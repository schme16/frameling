// The dock menu has to sit above a dialog's backdrop. The Themes cards in Preferences open it from inside a dialog: with
// the menu under the backdrop it opened (it was in the page, so every click-the-button test passed) but nobody could see it.
// This holds the stacking order; scripts/e2e/real-menus.cjs presses the real thing with a real mouse.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '../../src/ui/ui.css'), 'utf8');

/** A level named on :root, from the ladder at the top of ui.css (see src/ui/layers.ts). */
function levelOf(name: string): number {
  const m = new RegExp(`${name}:\\s*(\\d+);`).exec(css);
  expect(m, `${name} is set on :root`).toBeTruthy();
  return Number(m![1]);
}

/** The z-index a plain selector rule sets, the first time it does, following a var() to the ladder. */
function zOf(selector: string): number {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `${selector} has a rule`).toBeGreaterThan(-1);
  const body = css.slice(at, css.indexOf('}', at));
  const named = /z-index:\s*var\((--[\w-]+)\)/.exec(body);
  if (named) return levelOf(named[1]);
  const m = /z-index:\s*(\d+)/.exec(body);
  expect(m, `${selector} sets a z-index`).toBeTruthy();
  return Number(m![1]);
}

describe('the dock menu and dialogs', () => {
  it('the menu sits above a dialog backdrop, so a menu opened from a dialog can be seen', () => {
    expect(zOf('.ui-dock-menu')).toBeGreaterThan(zOf('.ui-backdrop'));
  });
  it('but under tooltips and toasts', () => {
    expect(zOf('.ui-dock-menu')).toBeLessThan(zOf('.ui-tip'));
    expect(zOf('.ui-dock-menu')).toBeLessThan(zOf('.ui-toasts'));
  });
});
