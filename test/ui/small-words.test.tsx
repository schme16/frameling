// @vitest-environment jsdom
// Small wording fixes from the second first-hour review.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../src/renderer/features';
import { newDoc } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';
import { ArtboardsPanel } from '../../src/artboards/ArtboardsPanel';
import { PrefsModal } from '../../src/ui/PrefsModal';
import { openPrefs, closePrefs } from '../../src/ui/overlays';
import { infoFor } from '../../src/ui/panelInfo';
import { resetPrefs, setPrefs } from '../../src/ui/prefs';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  // A drawing surface that accepts any call: thumbnails are not what is checked here.
  const g = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? null : () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })), set: () => true });
  HTMLCanvasElement.prototype.getContext = (() => g) as never;
  resetPrefs();
  resetStore(newDoc());
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  closePrefs();
});

describe('wording that used to contradict itself', () => {
  it('the Sounds preference does not say "off" while its switch is on', async () => {
    setPrefs({ sounds: true });
    await act(async () => {
      root.render(<PrefsModal />);
      openPrefs('general');
    });
    const text = host.textContent ?? '';
    expect(text).toContain('Soft little sounds');
    expect(text).not.toContain('Off unless you turn them on');
  });
  it('the Artboards tip does not repeat the panel blurb', () => {
    act(() => root.render(<ArtboardsPanel />));
    const tip = host.textContent ?? '';
    const blurb = infoFor({ id: 'artboards', title: 'Artboards' }).blurb;
    expect(blurb).toContain('Several canvases in one file');
    expect(tip).not.toMatch(/separate canvases in one file/);
    expect(tip).toContain('palette, swatches and symbols');
  });
});
