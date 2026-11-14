// @vitest-environment jsdom
// The History panel on screen: the rows, a click going back, the greyed steps, and Keep making a version from a step.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/history';
import { newDoc } from '../../src/core/doc';
import { getCommand, getPanel } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { HistoryPanel } from '../../src/history/HistoryPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = () => {};

let host: HTMLElement | null = null;
let root: Root | null = null;
const show = () => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<HistoryPanel />));
};
const names = () => [...host!.querySelectorAll('.hi-row')].map((r) => `${r.className.replace('hi-row ', '')}:${r.querySelector('.hi-label')!.textContent}`);

beforeEach(() => {
  resetStore(newDoc());
  for (const n of ['One', 'Two', 'Three']) store().update(n, (d) => void (d.name = n));
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = root = null;
});

describe('History panel', () => {
  it('is registered with a command, keys and help', () => {
    expect(getPanel('history')).toMatchObject({ title: 'History', help: 'history' });
    expect(getCommand('history.back')!.keys).toEqual(['Mod+Alt+Z']);
    expect(getCommand('history.forward')!.keys).toEqual(['Mod+Alt+Shift+Z']);
  });

  it('lists the steps newest first with Start at the bottom', () => {
    show();
    expect(names()).toEqual(['current:Three', 'done:Two', 'done:One', 'done:Start']);
    expect(host!.querySelector('[aria-current="step"]')!.textContent).toContain('Three');
  });

  it('goes back when a row is clicked, greys the later steps, and follows Redo', () => {
    show();
    act(() => (host!.querySelectorAll<HTMLButtonElement>('.hi-step')[2]).click());
    expect(store().get().doc.name).toBe('One');
    expect(names()).toEqual(['undone:Three', 'undone:Two', 'current:One', 'done:Start']);
    act(() => store().redo());
    expect(names()).toEqual(['undone:Three', 'current:Two', 'done:One', 'done:Start']);
  });

  it('goes all the way back from Start and forward again from the top row', () => {
    show();
    act(() => host!.querySelector<HTMLButtonElement>('[data-step="start"]')!.click());
    expect(store().get().doc.name).toBe('Untitled');
    act(() => host!.querySelectorAll<HTMLButtonElement>('.hi-step')[0].click());
    expect(store().get().doc.name).toBe('Three');
  });

  it('shows a new step as it is made', () => {
    show();
    act(() => store().update('Four', (d) => void (d.name = 'Four')));
    expect(names()[0]).toBe('current:Four');
  });

  it('the ten-step commands go in one jump', () => {
    for (let i = 0; i < 12; i++) store().update(`s${i}`, (d) => void (d.name = `s${i}`));
    act(() => void getCommand('history.back')!.run());
    expect(store().get().doc.name).toBe('s1');
    act(() => void getCommand('history.forward')!.run());
    expect(store().get().doc.name).toBe('s11');
  });

  it('Keep saves the drawing as it was at that step as a version, leaving the drawing alone', async () => {
    const versions = await import('../../src/io/versions');
    const take = vi.spyOn(versions, 'takeVersion').mockResolvedValue({ id: 'x', docId: 'd', takenAt: 1, size: 1, frames: 1, width: 1, height: 1, name: 'ok' });
    show();
    const before = store().get().doc;
    await act(async () => (host!.querySelectorAll<HTMLButtonElement>('.hi-keep')[1]).click());
    await vi.waitFor(() => expect(take).toHaveBeenCalled());
    const arg = take.mock.calls[0][0]!;
    expect(arg.name).toBe('Two (1 step back)');
    expect(arg.doc!.name).toBe('Two');
    expect(store().get().doc).toBe(before);
    take.mockRestore();
  });
});
