// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { takeFocusWhenReady } from '../../src/ui/takeFocusWhenReady';

/** Runs the animation frames the watcher asked for, one after another. */
function frames(n: number): void {
  for (let i = 0; i < n; i++) vi.advanceTimersByTime(16);
}

describe('taking the focus into a box a panel is still drawing', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('takes the focus as soon as the box appears, not after a fixed wait', () => {
    vi.useFakeTimers();
    takeFocusWhenReady('[data-bone-name]');
    frames(2);
    const el = document.createElement('input');
    el.setAttribute('data-bone-name', '');
    el.value = 'Arm';
    document.body.append(el);
    frames(1);
    expect(document.activeElement).toBe(el);
    expect(el.selectionStart).toBe(0);
    expect(el.selectionEnd).toBe(3);
  });

  it('leaves the text alone when asked only to focus', () => {
    vi.useFakeTimers();
    const el = document.createElement('input');
    el.className = 'box';
    el.value = 'Arm';
    el.setSelectionRange(3, 3);
    document.body.append(el);
    takeFocusWhenReady('.box', { select: false });
    frames(1);
    expect(document.activeElement).toBe(el);
    expect(el.selectionStart).toBe(3);
  });

  it('gives up quietly when the box never comes, and stops watching', () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, 'requestAnimationFrame');
    takeFocusWhenReady('.never');
    frames(100);
    const asked = spy.mock.calls.length;
    frames(100);
    // It stopped asking for frames once it gave up, rather than watching for the rest of the session.
    expect(spy.mock.calls.length).toBe(asked);
    spy.mockRestore();
  });

  it('does nothing and leaves nothing ticking where there is no page', () => {
    const doc = globalThis.document;
    // @ts-expect-error standing in for a run with no page at all (a test, a script).
    delete globalThis.document;
    try {
      expect(() => takeFocusWhenReady('.box')()).not.toThrow();
    } finally {
      globalThis.document = doc;
    }
  });
});
