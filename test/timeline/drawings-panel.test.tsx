// @vitest-environment jsdom
// The Drawings panel: a clip's drawings once each with their names, click to go, double-click to name, type to find.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newVectorLayer } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';
import { getPanel } from '../../src/core/registry';
import '../../src/timeline';
import { DrawingsPanel } from '../../src/timeline/DrawingsPanel';
import { setTl } from '../../src/timeline/state';
import { addCel, docWith } from './helpers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  setTl({ clipId: null, drawingsAll: false, editing: null });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

// Body drawings at 0, 5, 10, 15 (a held hold each); an Eyes layer with two named drawings. Clips: run 0 to 9, jump 10 to 19.
function make() {
  const doc = docWith([[0, 5], [5, 5], [10, 5], [15, 5]], 20);
  const eyes = newVectorLayer('Eyes');
  doc.layers.push(eyes);
  addCel(doc, eyes, 0, 10);
  addCel(doc, eyes, 10, 10);
  eyes.cels[0].name = 'eyes open';
  eyes.cels[1].name = 'eyes sad';
  doc.clips = [{ id: 'run', name: 'run', start: 0, end: 9, loop: true }, { id: 'jump', name: 'jump', start: 10, end: 19, loop: true }];
  return resetStore(doc);
}
const tiles = () => [...host.querySelectorAll<HTMLElement>('.dr-tile')];
const names = () => tiles().map((t) => t.querySelector('.dr-name')!.textContent);
const typeInto = (el: HTMLInputElement, v: string) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('the Drawings panel', () => {
  it('is a panel on the rail, in the animate group', () => {
    expect(getPanel('clip-drawings')?.title).toBe('Drawings');
  });

  it('shows the clip the playhead is in, each drawing once, named where it has a name', () => {
    make();
    act(() => root.render(<DrawingsPanel />));
    expect(host.textContent).toContain('run');
    expect(names()).toEqual(['eyes open', 'frame 6']);
    expect(host.textContent).toContain('2 drawings, 1 named');
  });

  it('follows the playhead into the next clip', () => {
    const s = make();
    act(() => root.render(<DrawingsPanel />));
    act(() => s.setUi({ frame: 12 }));
    expect(names()).toEqual(['eyes sad', 'frame 16']);
  });

  it('marks the picture that is on screen now', () => {
    const s = make();
    act(() => root.render(<DrawingsPanel />));
    act(() => s.setUi({ frame: 7 }));
    expect(tiles().map((t) => t.classList.contains('is-current'))).toEqual([false, true]);
  });

  it('goes to a drawing when you click it, onto the layer its name is on', () => {
    const s = make();
    act(() => root.render(<DrawingsPanel />));
    act(() => s.setUi({ frame: 12 }));
    act(() => tiles()[0].querySelector<HTMLButtonElement>('.dr-pic')!.click());
    expect(s.get().ui.frame).toBe(10);
    expect(s.get().ui.activeLayerId).toBe(s.get().doc.layers[1].id);
  });

  it('shows the whole animation with Everything, and goes back with This clip', () => {
    make();
    act(() => root.render(<DrawingsPanel />));
    const scope = host.querySelector<HTMLButtonElement>('.dr-scope')!;
    act(() => scope.click());
    expect(names()).toEqual(['eyes open', 'frame 6', 'eyes sad', 'frame 16']);
    expect(host.textContent).toContain('The whole animation');
    act(() => host.querySelector<HTMLButtonElement>('.dr-scope')!.click());
    expect(names()).toEqual(['eyes open', 'frame 6']);
  });

  it('finds a drawing by part of its name, and points at Everything when the clip has none', () => {
    make();
    act(() => root.render(<DrawingsPanel />));
    const find = host.querySelector<HTMLInputElement>('.dr-find')!;
    act(() => typeInto(find, 'sad'));
    expect(tiles()).toHaveLength(0);
    expect(host.textContent).toContain('Press Everything');
    act(() => host.querySelector<HTMLButtonElement>('.dr-scope')!.click());
    expect(names()).toEqual(['eyes sad']);
  });

  it('names a drawing from the words under its picture', () => {
    const s = make();
    act(() => root.render(<DrawingsPanel />));
    act(() => {
      tiles()[1].querySelector('.dr-name')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    const input = host.querySelector<HTMLInputElement>('.dr-tile input')!;
    act(() => {
      input.value = 'body lean';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(s.get().doc.layers[0].cels[1].name).toBe('body lean');
    expect(names()).toEqual(['eyes open', 'body lean']);
  });

  it('says what to do when nothing is drawn', () => {
    resetStore(docWith([], 10));
    act(() => root.render(<DrawingsPanel />));
    expect(host.textContent).toContain('Nothing drawn here yet');
  });
});
