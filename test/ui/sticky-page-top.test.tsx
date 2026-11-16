// @vitest-environment jsdom
// The page header that stays put: a line only once something has scrolled under it, a fill of its own, flush with the
// top of the page, and its height shared so things that stick beneath it sit below it.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isStuck, StickyPageTop, STUCK_AFTER } from '../../src/ui/StickyPageTop';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../src/ui/ui.css'), 'utf8');
const block = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};

let root: Root;
let page: HTMLElement;
beforeEach(() => {
  page = document.createElement('div');
  page.className = 'ui-prefs-page';
  document.body.appendChild(page);
  root = createRoot(page);
});
afterEach(() => {
  act(() => root.unmount());
  page.remove();
});

describe('StickyPageTop', () => {
  it('draws no line at the top, and one once the page has scrolled', () => {
    expect(isStuck(0)).toBe(false);
    expect(isStuck(STUCK_AFTER)).toBe(false);
    expect(isStuck(STUCK_AFTER + 1)).toBe(true);
    act(() => root.render(<StickyPageTop>hello</StickyPageTop>));
    const top = page.querySelector<HTMLElement>('.ui-page-top')!;
    expect(top.dataset.stuck).toBeUndefined();
    act(() => {
      page.scrollTop = 120;
      page.dispatchEvent(new Event('scroll'));
    });
    expect(top.dataset.stuck).toBeDefined();
    act(() => {
      page.scrollTop = 0;
      page.dispatchEvent(new Event('scroll'));
    });
    expect(top.dataset.stuck).toBeUndefined();
  });

  it('lets go of the page when it goes', () => {
    act(() => root.render(<StickyPageTop>hello</StickyPageTop>));
    expect(page.style.getPropertyValue('--page-top-h')).not.toBe('');
    act(() => root.render(<span />));
    expect(page.style.getPropertyValue('--page-top-h')).toBe('');
  });

  it('is plain css: sticky, a fill of its own, flush with the page edge, shadow only when stuck', () => {
    const top = block('.ui-page-top');
    expect(top).toContain('position: sticky');
    expect(top).toContain('background: var(--panel)');
    expect(top).toContain('top: calc(var(--page-pad-top) * -1)');
    expect(top).toContain('margin: calc(var(--page-pad-top) * -1) -18px');
    expect(block('.ui-page-top')).not.toContain('box-shadow:');
    expect(block('.ui-page-top[data-stuck]')).toContain('box-shadow');
    expect(block('.ui-prefs-page')).toContain('padding: var(--page-pad-top) 18px 24px');
  });
});
