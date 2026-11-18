// @vitest-environment jsdom
// The Brush options' top: Tip and Stick under the Brush as its parts, each "as it comes" or "changed" with its own reset,
// one Back to how it came, the tag on the preview, and the flash that honours reduced motion.
import fs from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/brushes';
import { preloadPicker } from './preloadPicker';
import { BrushOptions } from '../../src/tools/options/BrushOptions';
import { DEFAULT_BRUSH, newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import * as P from '../../src/brushes/presets';
import { startBrushFlash, currentFlash } from '../../src/brushes/flash';
import { pickStick, pickTip } from '../../src/brushes/tips';

// The preview draws on a canvas jsdom does not have; these tests look at the words, not the pixels.
vi.mock('../../src/brushes/thumbs', async (orig) => ({ ...(await orig<typeof import('../../src/brushes/thumbs')>()), drawPreviewStroke: () => undefined }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
let stop: () => void;
const part = (id: string) => host.querySelector<HTMLElement>(`[data-control="${id}"]`);
const status = (id: string) => part(id)?.querySelector('.bp-st')?.textContent ?? null;

beforeAll(async () => {
  const noop = new Proxy(() => undefined, { get: () => noop, apply: () => undefined });
  HTMLCanvasElement.prototype.getContext = (() => noop) as unknown as HTMLCanvasElement['getContext'];
  await preloadPicker();
});
beforeEach(() => {
  localStorage.clear();
  resetStore(newDoc());
  store().setUi({ brush: { ...DEFAULT_BRUSH }, tool: 'brush' });
  P.applyPreset('starter:sketch-pencil');
  stop = startBrushFlash();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<BrushOptions />));
});
afterEach(() => {
  stop();
  act(() => root.unmount());
  host.remove();
  document.querySelectorAll('.pk-pop').forEach((n) => n.remove());
});

describe('the parts of this brush', () => {
  it('say "as it comes" for a brush as it came, and have no Back button yet', () => {
    expect(host.querySelector('.bp-parts-title')!.textContent).toBe('Parts of this brush');
    expect(status('tip-picker')).toBe('as it comes');
    expect(status('stick-picker')).toBe('as it comes');
    expect(host.querySelector('[data-control="revert"]')).toBeNull();
  });
  it('say "changed" for both the tip and the stick when a tip brings its own stick, and name both in the tag', () => {
    act(() => void pickTip('tip:chalk'));
    expect(status('tip-picker')).toBe('changed');
    expect(status('stick-picker')).toBe('changed');
    expect(host.querySelector('.bf-tag')!.textContent).toBe('Tip: Chalk, Stick: Chalk');
    expect(host.querySelector('[data-control="revert"]')!.textContent).toContain('Back to how it came');
  });
  it('mark only the stick when only the stick changed, and each reset puts back its own part', () => {
    act(() => void pickStick('stick:crayon'));
    expect(status('tip-picker')).toBe('as it comes');
    expect(status('stick-picker')).toBe('changed');
    expect(host.querySelector('.bf-tag')!.textContent).toBe('Stick: Crayon');
    act(() => host.querySelector<HTMLElement>('[data-control="reset-stick"]')!.click());
    expect(status('stick-picker')).toBe('as it comes');
    expect(host.querySelector('[data-control="revert"]')).toBeNull();
  });
  it('Back to how it came puts every part back', () => {
    act(() => void pickTip('tip:chalk'));
    act(() => host.querySelector<HTMLElement>('[data-control="revert"]')!.click());
    expect(status('tip-picker')).toBe('as it comes');
    expect(status('stick-picker')).toBe('as it comes');
  });
  it('say nothing about changes for a brush that was never saved', () => {
    P.saveCurrentAs('Tmp');
    P.deleteActive();
    act(() => store().setUi({ brush: { ...DEFAULT_BRUSH, size: 77 } }));
    expect(status('tip-picker')).toBeNull();
    expect(host.querySelector('[data-control="revert"]')).toBeNull();
  });
  it('say Paper is the sheet\'s unless the brush keeps its own, beside them', () => {
    expect(host.querySelector('.bp-parts-foot')!.textContent).toContain('Paper is the sheet’s, unless this brush keeps its own');
    expect(host.querySelector('[data-testid="paper-group"]')).not.toBeNull();
  });
  it('leave the flash to the words: the tag is there with no animation to depend on', () => {
    act(() => void pickTip('tip:chalk'));
    expect(currentFlash().parts).toEqual(['tip', 'stick']);
    const css = fs.readFileSync(path.join(__dirname, '../../src/brushes/parts.css'), 'utf8');
    expect(css).toMatch(/data-motion='reduce'\] \.bf-ring \{ animation: none/);
    // The line drawn on is the preview's own job, and it checks for reduced motion before it starts.
    const preview = fs.readFileSync(path.join(__dirname, '../../src/tools/options/BrushOptions.tsx'), 'utf8');
    expect(preview).toMatch(/if \(!fresh \|\| reducedMotion\(\)\) return paint\(n \+ 1\)/);
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
    expect(css).not.toMatch(/\.bf-tag \{[^}]*animation/);
  });
});
