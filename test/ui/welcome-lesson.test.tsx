// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../src/renderer/features';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { watchFirstDrawing } from '../../src/ui/firstDrawing';
import { closeSheet, openSheet } from '../../src/ui/overlays';
import { getPrefs, migratePrefs, resetPrefs, setPrefs } from '../../src/ui/prefs';
import { WelcomeSheet } from '../../src/ui/Welcome';
import { stroke } from '../quests/helpers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  resetPrefs();
  resetStore(newDoc());
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  closeSheet();
});

const show = async (sheet: 'welcome' | 'new' = 'welcome') => {
  await act(async () => {
    root.render(<WelcomeSheet />);
    openSheet(sheet);
  });
  await act(async () => {});
};

describe('the 60-second lesson on the Welcome sheet', () => {
  it('is pinned at the top on first launch, before anything else but a crash recovery', async () => {
    await show();
    const strip = document.querySelector('.ui-quest-pinned');
    expect(strip?.textContent).toContain('Your first animation in 60 seconds');
    expect(document.querySelectorAll('.ui-quest')).toHaveLength(1);
    const sheet = document.querySelector('.ui-welcome')!;
    const kids = [...sheet.children];
    expect(kids.indexOf(strip!)).toBeLessThan(kids.indexOf(sheet.querySelector('.ui-presets')!));
  });
  it('goes from the top once something has been drawn, and the old card at the foot stays', async () => {
    setPrefs({ firstDrawn: true });
    await show();
    expect(document.querySelector('.ui-quest-pinned')).toBeNull();
    expect(document.querySelectorAll('.ui-quest')).toHaveLength(1);
  });
  it('is not on the New drawing sheet', async () => {
    await show('new');
    expect(document.querySelector('.ui-quest')).toBeNull();
  });
});

describe('noticing the first drawing', () => {
  it('waits for a real edit that leaves something on the page', () => {
    const off = watchFirstDrawing();
    store().load(newDoc());
    expect(getPrefs().firstDrawn).toBe(false);
    const doc = newDoc();
    const d = newVectorDrawing();
    d.shapes = [stroke([[1, 1], [20, 20]])];
    store().load({ ...doc, drawings: { ...doc.drawings, [d.id]: d } });
    expect(getPrefs().firstDrawn).toBe(false); // an opened file is not drawing
    store().update('Rename', (x) => void (x.name = 'x'));
    expect(getPrefs().firstDrawn).toBe(true);
    off();
  });
  it('is true for someone who already got past the first hello, false for a brand new profile', () => {
    expect(migratePrefs({ onboarded: true }).firstDrawn).toBe(true);
    expect(migratePrefs({}).firstDrawn).toBe(false);
    expect(migratePrefs({ onboarded: true, firstDrawn: false }).firstDrawn).toBe(false);
  });
});
