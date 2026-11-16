// @vitest-environment jsdom
// A picker can never be on top of a dialog. Two halves hold it: the picker's layer is under a dialog's backdrop (the
// ladder in src/ui/layers.ts), and a dialog that opens while a picker is up closes it (src/ui/popover.ts), so nothing is
// left floating on the page the dialog has put out of reach. The window close question is the one that found it: it
// comes from the desktop side, with a picker open and no click to close it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAYER, flyoutLayer } from '../../src/ui/layers';
import { closePopoversOutside, usePopover } from '../../src/ui/popover';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Picker({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  usePopover(ref, onClose);
  return (
    <div ref={ref} className="pk-pop" role="dialog" tabIndex={-1}>
      <input />
    </div>
  );
}

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const flush = () => act(async () => void (await Promise.resolve()));
const addModal = async (html: string, into: HTMLElement = document.body) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  into.append(el);
  await flush();
  return el;
};

describe('a dialog that opens while a picker is up', () => {
  it('closes the picker, so it cannot sit over the question', async () => {
    const onClose = vi.fn();
    act(() => root.render(<Picker onClose={onClose} />));
    await addModal('<div class="ui-backdrop"><div class="ui-modal" role="dialog" aria-modal="true"><button>Save</button></div></div>');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does the same for the plain aria-modal dialogs and the io ones', async () => {
    for (const html of ['<div aria-modal="true"></div>', '<div class="io-backdrop"><div class="io-modal"></div></div>']) {
      const onClose = vi.fn();
      act(() => root.render(<Picker onClose={onClose} />));
      await addModal(html);
      expect(onClose, html).toHaveBeenCalledTimes(1);
      act(() => root.render(null));
    }
  });

  it('leaves a picker alone when it was opened from inside that dialog', async () => {
    const dlg = await addModal('<div class="ui-backdrop"><div class="ui-modal"><button id="colour">Colour</button></div></div>');
    (dlg.querySelector('#colour') as HTMLElement).focus();
    const onClose = vi.fn();
    act(() => root.render(<Picker onClose={onClose} />));
    // The dialog it came from showing up again changes nothing; a different dialog closes it.
    closePopoversOutside(dlg);
    expect(onClose).not.toHaveBeenCalled();
    closePopoversOutside(document.createElement('div'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is not bothered by things that are not dialogs', async () => {
    const onClose = vi.fn();
    act(() => root.render(<Picker onClose={onClose} />));
    await addModal('<div role="dialog" class="sn-pop"></div><div class="ui-toasts"></div>');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stops watching once nothing is open, so a dialog later is just a dialog', async () => {
    const onClose = vi.fn();
    act(() => root.render(<Picker onClose={onClose} />));
    act(() => root.render(null));
    await addModal('<div class="ui-backdrop"></div>');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('where the pickers sit', () => {
  it('a picker opened from the page is under every dialog backdrop', () => {
    const page = document.createElement('button');
    document.body.append(page);
    expect(flyoutLayer(page)).toBeLessThan(LAYER.backdrop);
  });

  it('the brush, tip and colour pickers take their height from flyoutLayer, never a number of their own', () => {
    for (const file of ['../../src/brushes/BrushPickerPanel.tsx', '../../src/ui/colour/ColourPicker.tsx']) {
      expect(readFileSync(join(__dirname, file), 'utf8')).toMatch(/zIndex:\s*flyoutLayer\(/);
    }
    for (const file of ['../../src/brushes/picker.css', '../../src/ui/colour/colourPicker.css']) {
      expect(readFileSync(join(__dirname, file), 'utf8')).toMatch(/z-index:\s*var\(--z-flyout\)/);
    }
  });

  it('every dialog backdrop in the app is at or above the backdrop rung', () => {
    const files = ['../../src/ui/ui.css', '../../src/io/io.css', '../../src/io/saveAsk.css', '../../src/beta/beta.css'];
    for (const file of files) {
      const css = readFileSync(join(__dirname, file), 'utf8');
      for (const m of css.matchAll(/([^{}]*backdrop[^{}]*)\{([^}]*)\}/g)) {
        const z = /z-index:\s*(?:(\d+)|var\(--z-(backdrop|big-dialog)\))/.exec(m[2]);
        if (!z) continue;
        const n = z[1] ? Number(z[1]) : z[2] === 'backdrop' ? LAYER.backdrop : LAYER.bigDialog;
        expect(n, `${file}: ${m[1].trim()}`).toBeGreaterThanOrEqual(LAYER.backdrop);
      }
    }
  });
});
