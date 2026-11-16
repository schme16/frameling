// @vitest-environment jsdom
// Pressing a help icon opens its tip and keeps it there, with the link to the help topic; Escape closes it.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { registerHelp } from '../../src/core/registry';
import { TooltipLayer } from '../../src/ui/Tooltips';
import { ExplainIcon } from '../../src/ui/explain/ExplainIcon';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('pressing a help icon', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
  });
  const setup = () => {
    registerHelp({ id: 'test-explain-topic', title: 'Test topic', section: 'Test', summary: 'x', keywords: [] } as never);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() =>
      root!.render(
        <>
          <ExplainIcon title="Smoothing" words="Higher evens out a shaky hand." help="test-explain-topic" />
          <button type="button" id="other">
            other
          </button>
          <TooltipLayer />
        </>,
      ),
    );
    return host.querySelector<HTMLButtonElement>('.ui-explain')!;
  };

  it('shows the words and the link, and keeps them while the pointer wanders off', () => {
    const icon = setup();
    act(() => icon.click());
    const tip = document.querySelector('.ui-tip');
    expect(tip?.textContent).toContain('Smoothing');
    expect(tip?.textContent).toContain('Higher evens out a shaky hand.');
    expect(tip?.querySelector('.ui-tip-more')?.textContent).toBe('Learn more');
    expect(tip?.classList.contains('is-pinned')).toBe(true);
    act(() => {
      icon.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    });
    expect(document.querySelector('.ui-tip')).not.toBeNull();
  });

  it('closes on Escape, and on a second press', () => {
    const icon = setup();
    act(() => icon.click());
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('.ui-tip')).toBeNull();
    act(() => icon.click());
    expect(document.querySelector('.ui-tip')).not.toBeNull();
    act(() => icon.click());
    expect(document.querySelector('.ui-tip')).toBeNull();
  });

  it('closes when a press lands anywhere else', () => {
    const icon = setup();
    act(() => icon.click());
    act(() => {
      document.getElementById('other')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(document.querySelector('.ui-tip')).toBeNull();
  });
});
