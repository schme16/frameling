// @vitest-environment jsdom
// The status bar in the Pixel workspace: zoom as a percentage of screen pixels per art pixel, size in art pixels.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';
import { applyWorkspace } from '../../src/ui/dock';
import { StatusBar } from '../../src/ui/StatusBar';
import '../../src/renderer/features';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const text = () => host.textContent ?? '';

describe('status bar units', () => {
  it('Pixel workspace: 800% and 32 x 32 pixels', () => {
    applyWorkspace('pixel');
    const s = resetStore(newDoc({ width: 512, height: 512, pixel: { pixelSize: 16 } }));
    s.setUi({ zoom: 0.5 });
    act(() => root.render(<StatusBar />));
    expect(text()).toContain('800%');
    expect(text()).toContain('32 x 32 pixels');
    expect(text()).not.toContain('512 x 512');
  });

  it('Draw workspace keeps the stage numbers', () => {
    applyWorkspace('draw');
    const s = resetStore(newDoc({ width: 512, height: 512, pixel: { pixelSize: 16 } }));
    s.setUi({ zoom: 0.5 });
    act(() => root.render(<StatusBar />));
    expect(text()).toContain('50%');
    expect(text()).toContain('512 x 512 (32 x 32 pixels)');
  });
});
