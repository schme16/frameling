// @vitest-environment jsdom
// The frames chip in the status bar and the "Animation, N frames" chip in the pixel bar follow the length at once:
// tidying the end (or any edit that changes it) is seen by both in the same step. Checked on the real chips.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newSpriteDoc } from '../../src/pixel/way';
import { resetStore, store } from '../../src/core/store';
import { PixelBar } from '../../src/pixel/PixelBar';
import { StatusBar } from '../../src/ui/StatusBar';
import { tidyEnd } from '../../src/timeline/ops';
import { applyWorkspace } from '../../src/ui/dock';
import '../../src/renderer/features';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  applyWorkspace('pixel');
  resetStore(newSpriteDoc({ way: 'animation', width: 16, height: 16 }));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<><PixelBar /><StatusBar /></>));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

const status = () => [...host.querySelectorAll('.ui-status-item')].map((e) => e.textContent ?? '').find((t) => t.includes('Frame '));
const way = () => host.querySelector('.px-way-chip')?.textContent;

describe('the length chips', () => {
  it('both catch up the moment the empty frames come off the end', () => {
    const was = store().get().doc.length;
    act(() => store().update('Longer', (d) => void (d.length += 10)));
    expect(status()).toContain(`of ${was + 10}`);
    expect(way()).toContain(`Animation, ${was + 10} frames`);
    act(() => void tidyEnd());
    expect(store().get().doc.length).toBe(was);
    expect(status()).toContain(`of ${was}`);
    expect(way()).toContain(`Animation, ${was} frames`);
  });
});
