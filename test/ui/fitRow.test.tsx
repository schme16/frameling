// @vitest-environment jsdom
// A pick-one row keeps every label on one line, and stacks one per line (on purpose) when they do not fit side by side.
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { overflows, useStackWhenTight } from '../../src/ui/fitRow';
import { Choice } from '../../src/canvas/controls';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let notify: () => void = () => {};
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
  constructor(cb: () => void) {
    notify = cb;
  }
  observe() {}
  disconnect() {}
};

describe('overflows', () => {
  it('is true only when the contents are wider than the row', () => {
    expect(overflows({ scrollWidth: 180, clientWidth: 150 })).toBe(true);
    expect(overflows({ scrollWidth: 150, clientWidth: 150 })).toBe(false);
    expect(overflows({ scrollWidth: 150.5, clientWidth: 150 })).toBe(false);
  });
});

describe('useStackWhenTight', () => {
  let root: Root | null = null;
  const host = document.createElement('div');
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
  });

  // jsdom has no layout, so the row's measured sizes are set by hand.
  let sizes = { scrollWidth: 100, clientWidth: 200, width: 200 };
  function Row() {
    const ref = useRef<HTMLDivElement>(null);
    useStackWhenTight(ref);
    return <div ref={ref} id="row" />;
  }
  const measured = () => {
    const el = document.getElementById('row') as HTMLElement;
    Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => sizes.scrollWidth });
    Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => sizes.clientWidth });
    el.getBoundingClientRect = () => ({ width: sizes.width }) as DOMRect;
    return el;
  };

  it('stacks when the buttons do not fit and returns to a row when they do', () => {
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(<Row />));
    const el = measured();
    expect(el.getAttribute('data-stacked')).toBeNull();
    sizes = { scrollWidth: 260, clientWidth: 150, width: 150 };
    act(() => notify());
    expect(el.getAttribute('data-stacked')).toBe('true');
    sizes = { scrollWidth: 260, clientWidth: 300, width: 300 };
    act(() => notify());
    expect(el.getAttribute('data-stacked')).toBeNull();
  });

  it('a change of height alone does not start it again', () => {
    document.body.append(host);
    root = createRoot(host);
    sizes = { scrollWidth: 260, clientWidth: 150, width: 150 };
    act(() => root!.render(<Row />));
    const el = measured();
    act(() => notify());
    expect(el.getAttribute('data-stacked')).toBe('true');
    // Same width again (stacking only changed the height): the row is left as it is.
    sizes = { scrollWidth: 100, clientWidth: 150, width: 150 };
    act(() => notify());
    expect(el.getAttribute('data-stacked')).toBe('true');
  });
});

describe('Choice', () => {
  it('keeps each option as one button with its words whole', () => {
    const host2 = document.createElement('div');
    document.body.append(host2);
    const r = createRoot(host2);
    act(() => r.render(<Choice label="Each new pick" value="add" options={[{ value: 'replace', label: 'Starts afresh' }, { value: 'add', label: 'Adds' }]} onChange={() => {}} />));
    expect([...host2.querySelectorAll('[role=radio]')].map((b) => b.textContent)).toEqual(['Starts afresh', 'Adds']);
    act(() => r.unmount());
  });
});
