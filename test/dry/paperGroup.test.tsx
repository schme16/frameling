// @vitest-environment jsdom
// The Paper group is one control: the same picker and the same words in chalk and charcoal, the pixel brush and a chalk tip
// that catches on paper. It says which paper you are on, and a brush that keeps its own says so.
import fs from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '../../src/brushes';
import '../../src/dry';
import { preloadPicker } from '../brushes/preloadPicker';
import { TipOptions } from '../../src/brushes/TipOptions';
import { setTipKind, patchTip } from '../../src/brushes/tips';
import { DEFAULT_BRUSH, newDoc } from '../../src/core/doc';
import { _resetChoicesForTests, setChoice } from '../../src/core/choices';
import { resetStore, store } from '../../src/core/store';
import { PaperSection } from '../../src/dab/DynamicsOptions';
import { resetDab, setDab, getDab } from '../../src/dab/settings';
import { DryOptionsPanel } from '../../src/dry/Options';
import { PAPER_PINNED_CHOICE } from '../../src/dry/choices';
import { getDry, resetDry, setPaper } from '../../src/dry/settings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
const render = (el: React.ReactElement) => act(() => root.render(el));
const group = () => host.querySelector<HTMLElement>('[data-testid="paper-group"]');
// The paper is one picker: a button with a swatch, and a list of the five papers that opens from it.
const picker = () => group()?.querySelector<HTMLButtonElement>('[data-control="paper-choice"] .pk-btn') ?? null;
const options = () => [...document.querySelectorAll<HTMLElement>('.pp-menu [role="option"]')];
const nameOf = (o: HTMLElement) => o.querySelector('.pk-name-text')!.textContent;
const chips = () => {
  const b = picker();
  if (!b) return [];
  if (!options().length) act(() => b.click());
  return options();
};
const on = () => picker()?.querySelector('.pk-btn-name-text')?.textContent;
const chip = (name: string) => ({
  click: () => {
    const o = chips().find((c) => nameOf(c) === name)!;
    act(() => o.click());
  },
});
const text = () => group()?.textContent ?? '';
const button = (name: RegExp) => [...(group()?.querySelectorAll<HTMLButtonElement>('button.cv-action') ?? [])].find((b) => name.test(b.textContent ?? ''));

beforeAll(preloadPicker);
beforeEach(() => {
  localStorage.clear();
  _resetChoicesForTests();
  resetStore(newDoc());
  resetDry();
  resetDab();
  store().setUi({ brush: { ...DEFAULT_BRUSH } });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.querySelectorAll('.pp-menu').forEach((n) => n.remove());
});

describe('in chalk and charcoal', () => {
  it('is always there, with the five papers and the one the sheet is on chosen', () => {
    render(<DryOptionsPanel />);
    expect(chips().map(nameOf)).toEqual(['Smooth', 'Fine', 'Medium', 'Laid', 'Rough']);
    expect(on()).toBe('Medium');
    expect(text()).toContain('Medium, the sheet’s');
  });
  it('picking a paper changes the sheet', () => {
    render(<DryOptionsPanel />);
    chip('Rough').click();
    expect(getDry().paper).toBe('rough');
    expect(on()).toBe('Rough');
  });
});

describe('in the pixel brush', () => {
  it('with grain off is just a box with its switch, and shows no papers', () => {
    render(<PaperSection />);
    expect(group()).not.toBeNull();
    expect(chips()).toHaveLength(0);
    expect(group()!.querySelector('input[type="checkbox"]')).not.toBeNull();
  });
  it('with grain on follows the sheet: the same chips, the sheet’s paper chosen, and it changes the sheet', () => {
    setDab({ grain: { depth: 0.8, scale: 1, moving: false } });
    setPaper('laid');
    render(<PaperSection />);
    expect(on()).toBe('Laid');
    expect(text()).toContain('Laid, the sheet’s');
    chip('Fine').click();
    expect(getDry().paper).toBe('fine');
    expect(getDab().grain?.paper).toBeUndefined();
  });
  it('a brush that keeps its own paper says so, and shows its paper, not the sheet’s', () => {
    setPaper('rough');
    setDab({ grain: { paper: 'fine', depth: 0.8, scale: 1, moving: false } });
    render(<PaperSection />);
    expect(on()).toBe('Fine');
    expect(text()).toContain('Fine, this brush’s own');
    expect(text()).toContain('Your sheet is on Rough');
  });
  it('picking on a brush that keeps its own paper changes only the brush by default', () => {
    setPaper('rough');
    setDab({ grain: { paper: 'fine', depth: 0.8, scale: 1, moving: false } });
    render(<PaperSection />);
    chip('Laid').click();
    expect(getDab().grain?.paper).toBe('laid');
    expect(getDry().paper).toBe('rough');
  });
  it('and changes the sheet, with the brush following it, when that is the remembered answer', () => {
    setChoice(PAPER_PINNED_CHOICE, 'sheet');
    setPaper('rough');
    setDab({ grain: { paper: 'fine', depth: 0.8, scale: 1, moving: false } });
    render(<PaperSection />);
    chip('Laid').click();
    expect(getDry().paper).toBe('laid');
    expect(getDab().grain?.paper).toBeUndefined();
  });
  it('can keep a brush on its paper, and let it go again', () => {
    setPaper('rough');
    setDab({ grain: { depth: 0.8, scale: 1, moving: false } });
    render(<PaperSection />);
    act(() => button(/Keep this brush on Rough/)!.click());
    expect(getDab().grain?.paper).toBe('rough');
    act(() => button(/Use the sheet/)!.click());
    expect(getDab().grain?.paper).toBeUndefined();
  });
});

describe('in the brush with a chalk tip', () => {
  it('is there for a chalk tip as its Catch on paper switch, and opens to the same chips when the tip catches on paper', () => {
    render(<TipOptions />);
    expect(group()).toBeNull();
    act(() => setTipKind('chalk'));
    act(() => patchTip({ dry: undefined }));
    expect(group()).not.toBeNull();
    expect(chips()).toHaveLength(0);
    expect(text()).toContain('Catch on paper');
    expect(text()).toContain('Grain size');
    act(() => patchTip({ dry: 'chalk' }));
    expect(chips().map(nameOf)).toEqual(['Smooth', 'Fine', 'Medium', 'Laid', 'Rough']);
    act(() => setPaper('rough'));
    expect(on()).toBe('Rough');
  });
  it('sits under the Stick picker, which stays', () => {
    render(<TipOptions />);
    act(() => setTipKind('chalk'));
    act(() => patchTip({ dry: 'chalk' }));
    const ids = [...host.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')).filter((t) => ['brush-tips', 'brush-stick', 'brush-paper'].includes(t!));
    expect(ids).toEqual(['brush-tips', 'brush-stick', 'brush-paper']);
  });
  it('a tip that is not chalk or charcoal has none', () => {
    render(<TipOptions />);
    act(() => setTipKind('watercolour'));
    expect(group()).toBeNull();
  });
});

describe('one control, not several that look alike', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, '../../src', f), 'utf8');
  it('every tool that carries the group renders the shared one', () => {
    expect(read('dry/Options.tsx')).toContain('<PaperGroup');
    expect(read('dab/DynamicsOptions.tsx')).toContain('<PaperGroup');
    expect(read('brushes/TipOptions.tsx')).toContain('<PaperGroup');
  });
  it('and nothing but the Paper picker lays out the list of papers', () => {
    const own: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(__dirname, '../../src', dir), { withFileTypes: true })) {
        const rel = path.posix.join(dir, e.name);
        if (e.isDirectory()) walk(rel);
        else if (e.name.endsWith('.tsx') && rel !== 'dry/PaperPicker.tsx' && /PAPERS\.map/.test(read(rel))) own.push(rel);
      }
    };
    walk('.');
    expect(own).toEqual([]);
  });
});
