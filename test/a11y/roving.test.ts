// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { handleRovingKey, installRovingKeys, nextIndex } from '../../src/ui/roving';

describe('arrow keys in a row of choices', () => {
  it('wraps round and knows Home and End', () => {
    expect(nextIndex('ArrowRight', 2, 3)).toBe(0);
    expect(nextIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(nextIndex('ArrowDown', 0, 3)).toBe(1);
    expect(nextIndex('Home', 2, 3)).toBe(0);
    expect(nextIndex('End', 0, 3)).toBe(2);
    expect(nextIndex('a', 0, 3)).toBe(-1);
    expect(nextIndex('ArrowRight', 0, 0)).toBe(-1);
  });

  let off: (() => void) | null = null;
  afterEach(() => {
    off?.();
    document.body.innerHTML = '';
  });

  it('moves focus, picks the choice and keeps the arrow from reaching the canvas', () => {
    off = installRovingKeys();
    document.body.innerHTML = `<div role="radiogroup"><button role="radio" aria-checked="true">A</button><button role="radio" aria-checked="false" disabled>B</button><button role="radio" aria-checked="false">C</button></div>`;
    const [a, , c] = [...document.querySelectorAll('button')];
    let picked = '';
    c.addEventListener('click', () => (picked = 'C'));
    a.focus();
    const e = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    a.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(c);
    expect(picked).toBe('C');
  });

  it('leaves other keys and other elements alone', () => {
    document.body.innerHTML = `<button>x</button>`;
    const b = document.querySelector('button')!;
    const e = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    Object.defineProperty(e, 'target', { value: b });
    expect(handleRovingKey(e)).toBe(false);
  });
});
