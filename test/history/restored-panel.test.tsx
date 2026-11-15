// @vitest-environment jsdom
// Steps that came back from a file show up in the History panel like any others, and a look at another artboard stays hidden.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import '../../src/history';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { HistoryPanel } from '../../src/history/HistoryPanel';
import { loadFile, saveFile } from '../../src/io/file';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = () => {};

let host: HTMLElement | null = null;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = root = null;
});

describe('History panel after opening a file that carried its steps', () => {
  it('lists the restored steps, hides the look-around ones, and a click goes back', () => {
    const start = newDoc();
    const s = resetStore(start);
    s.update('One', (d) => void (d.name = 'One'));
    s.update('Go to "Other"', (d) => void (d.fps = 12), { view: true });
    s.update('Two', (d) => void (d.name = 'Two'));
    s.undo();
    const loaded = loadFile(saveFile(s.get().doc, '', new Date(2026, 10, 14), { history: s.historyForSave()! }));
    expect(loaded.history).toBeDefined();
    resetStore();
    store().load(loaded.doc, null, loaded.history);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(<HistoryPanel />));
    const names = () => [...host!.querySelectorAll('.hi-row')].map((r) => `${r.className.replace('hi-row ', '')}:${r.querySelector('.hi-label')!.textContent}`);
    expect(names()).toEqual(['undone:Two', 'current:One', 'done:Start']);
    act(() => host!.querySelectorAll<HTMLButtonElement>('.hi-step')[2].click());
    expect(store().get().doc.name).toBe(start.name);
    expect(store().get().doc.fps).toBe(start.fps);
  });
});
