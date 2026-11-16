// @vitest-environment jsdom
// The ring of dead space round a dialog must cover every modal, and keep doing so. Every modal in Frameling is one of two
// shells (src/ui/Modal.tsx and src/io/mount.tsx) and both hand a press on the dim area to `pressedBackdrop`, which owns the
// ring. These tests hold that: a press inside the ring does nothing, one outside does what the setting says, in both shells,
// and no other file builds a dim area of its own that would skip the ring. scripts/e2e/dialog-ring.cjs walks the real app.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setChoice, setChoiceAsker } from '../../src/core/choices';
import { Modal as IoModal } from '../../src/io/mount';
import { Modal as UiModal } from '../../src/ui/Modal';
import { NEAR_MISS } from '../../src/ui/backdropClick';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOX = { left: 400, top: 300, right: 800, bottom: 600, width: 400, height: 300, x: 400, y: 300 };
let root: Root;
let host: HTMLElement;

beforeEach(() => {
  setChoice('ui.backdropClick', undefined);
  setChoiceAsker(null);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  Element.prototype.getBoundingClientRect = function () {
    const isDialog = this.getAttribute?.('role') === 'dialog';
    return (isDialog ? { ...BOX, toJSON: () => BOX } : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  };
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

// Each shell listens for a different press event, so a real click sends both.
const press = (x: number, y: number) => {
  const back = host.querySelector('.ui-backdrop, .io-backdrop')!;
  act(() => {
    back.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
    back.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
  });
};

const shells: [string, (close: () => void) => React.ReactElement][] = [
  ['the usual dialog shell', (close) => <UiModal title="T" onClose={close}><p>Hi</p></UiModal>],
  ['the file and tools dialog shell', (close) => <IoModal title="T" onClose={close}><p>Hi</p></IoModal>],
];

describe.each(shells)('%s', (_name, make) => {
  it('does nothing for a press inside the ring, on every side, even when the setting says close', () => {
    setChoice('ui.backdropClick', 'close');
    const close = vi.fn();
    act(() => root.render(make(close)));
    const inside = NEAR_MISS - 1;
    for (const [x, y] of [
      [BOX.left - inside, 450],
      [BOX.right + inside, 450],
      [600, BOX.top - inside],
      [600, BOX.bottom + inside],
      [BOX.left - 5, BOX.top - 5],
    ]) {
      press(x, y);
    }
    expect(close).not.toHaveBeenCalled();
  });

  it('does what the setting says for a press outside it', () => {
    setChoice('ui.backdropClick', 'close');
    const close = vi.fn();
    act(() => root.render(make(close)));
    press(BOX.right + NEAR_MISS + 5, 450);
    expect(close).toHaveBeenCalledOnce();
  });

  it('leaves it open for a press outside it when the setting says stay', () => {
    setChoice('ui.backdropClick', 'stay');
    const close = vi.fn();
    act(() => root.render(make(close)));
    press(BOX.right + NEAR_MISS + 5, 450);
    expect(close).not.toHaveBeenCalled();
  });
});

describe('the ring is 24 pixels', () => {
  it('is the size the person confirmed', () => {
    expect(NEAR_MISS).toBe(24);
  });
});

describe('no modal skips the ring', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
    });
  const src = files(join(__dirname, '../../src')).map((p) => [p.split('/src/')[1], readFileSync(p, 'utf8')] as const);

  it('builds a dim area only inside the two shells', () => {
    const own = src.filter(([f, text]) => !['ui/Modal.tsx', 'io/mount.tsx'].includes(f) && /className=["'`{][^>]*\b(ui|io)-backdrop\b/.test(text)).map(([f]) => f);
    expect(own).toEqual([]);
  });

  it('both shells hand the press to pressedBackdrop, the one place the ring lives', () => {
    for (const f of ['ui/Modal.tsx', 'io/mount.tsx']) expect(src.find(([n]) => n === f)![1]).toContain('pressedBackdrop(');
  });

  it('the save question keeps ignoring the dim area, and nothing else does it by accident', () => {
    const ignoring = src.filter(([f, text]) => f !== 'ui/Modal.tsx' && /backdropDoesNothing/.test(text)).map(([f]) => f);
    expect(ignoring).toEqual(['io/SaveQuestionDialog.tsx']);
  });
});
