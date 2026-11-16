// @vitest-environment jsdom
// What sits on top of what. The ladder in src/ui/layers.ts is the one place the order is written down, and these tests
// keep it honest: that it really does go back to front, that the CSS says the same numbers, and that a picker opened
// from the page stays under a dialog's backdrop while one opened from inside a dialog climbs above it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flyoutLayer, insideModal, LAYER, LAYER_ORDER } from '../../src/ui/layers';

describe('the ladder', () => {
  it('goes back to front, with no two rungs at the same height', () => {
    const values = LAYER_ORDER.map((name) => LAYER[name]);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
  });

  it('names every rung exactly once', () => {
    expect([...LAYER_ORDER].sort()).toEqual(Object.keys(LAYER).sort());
  });

  it('keeps a page flyout under the backdrop, so a dialog really does put the page out of reach', () => {
    expect(LAYER.flyout).toBeLessThan(LAYER.backdrop);
    expect(LAYER.flyout).toBeGreaterThan(LAYER.panelFloat);
  });

  it('keeps a flyout opened inside a dialog above every dialog, and under the quest walkthrough', () => {
    expect(LAYER.flyoutOverModal).toBeGreaterThan(LAYER.bigDialog);
    expect(LAYER.flyoutOverModal).toBeLessThan(LAYER.quest);
  });

  it('keeps toasts above everything a dialog draws, because a toast is the app talking to you', () => {
    expect(LAYER.toast).toBeGreaterThan(LAYER.modal);
    expect(LAYER.toast).toBeGreaterThan(LAYER.tip);
  });
});

describe('the stylesheet says the same numbers', () => {
  const css = readFileSync(join(__dirname, '../../src/ui/ui.css'), 'utf8');
  const pairs: [string, number][] = [
    ['--z-in-panel', LAYER.inPanel],
    ['--z-panel', LAYER.panel],
    ['--z-panel-float', LAYER.panelFloat],
    ['--z-dock-chip', LAYER.dockChip],
    ['--z-flyout', LAYER.flyout],
    ['--z-backdrop', LAYER.backdrop],
    ['--z-modal', LAYER.modal],
    ['--z-menu-over-modal', LAYER.menuOverModal],
    ['--z-tip', LAYER.tip],
    ['--z-toast', LAYER.toast],
    ['--z-big-dialog', LAYER.bigDialog],
    ['--z-flyout-over-modal', LAYER.flyoutOverModal],
    ['--z-quest', LAYER.quest],
  ];
  it.each(pairs)('%s is %i in ui.css too', (name, want) => {
    const found = new RegExp(`${name}:\\s*(\\d+);`).exec(css);
    expect(found?.[1]).toBe(String(want));
  });
});

describe('where a flyout opens', () => {
  const inside = (html: string, pick: string) => {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    const el = host.querySelector(pick);
    const layer = flyoutLayer(el);
    host.remove();
    return layer;
  };

  it('a picker opened from the page stays under the backdrop', () => {
    expect(inside('<div class="ui-app"><button id="b">Brush</button></div>', '#b')).toBe(LAYER.flyout);
    expect(inside('<div class="ui-app"><button id="b">Brush</button></div>', '#b')).toBeLessThan(LAYER.backdrop);
  });

  it('a picker opened from inside a dialog climbs above it', () => {
    expect(inside('<div class="ui-backdrop"><div class="ui-modal"><button id="b">Colour</button></div></div>', '#b')).toBe(LAYER.flyoutOverModal);
    expect(inside('<div class="io-backdrop"><div class="io-modal"><button id="b">Colour</button></div></div>', '#b')).toBe(LAYER.flyoutOverModal);
    expect(inside('<div aria-modal="true"><button id="b">Colour</button></div>', '#b')).toBe(LAYER.flyoutOverModal);
  });

  it('a popover that merely says role=dialog is a page flyout, not a modal', () => {
    // The snapping popover, the prompt jar card and the panel picker all carry role="dialog" and sit on the page.
    expect(inside('<div role="dialog" class="sn-pop"><button id="b">Colour</button></div>', '#b')).toBe(LAYER.flyout);
    expect(insideModal(document.createElement('div'))).toBe(false);
  });

  it('with nothing to go on it stays on the page level, which is the safe answer', () => {
    expect(flyoutLayer(null)).toBe(LAYER.flyout);
    expect(flyoutLayer(undefined)).toBe(LAYER.flyout);
  });
});

describe('nothing floats over a backdrop by accident', () => {
  it('no stylesheet writes a bare z-index above the backdrop for a page flyout', () => {
    // The three that used to: the brush and tip picker, the colour popover, and the timeline's floating boxes.
    for (const file of ['../../src/brushes/picker.css', '../../src/ui/colour/colourPicker.css', '../../src/timeline/timeline.css']) {
      const text = readFileSync(join(__dirname, file), 'utf8');
      expect(text).not.toMatch(/z-index:\s*1000/);
    }
  });
});
