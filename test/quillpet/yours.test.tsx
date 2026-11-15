// @vitest-environment jsdom
// His room with your work in it: nothing when you have made nothing, your drawings on the wall and your sprite on the
// floor when you have, new work appearing by itself, nothing removed when time passes, only real work recorded, and
// the room costing nothing extra to have open.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setQuillSheet } from '../../src/ui/mascot/runtime';
import { QuillPetPanel } from '../../src/quillpet/QuillPetPanel';
import { FRESH_PET } from '../../src/quillpet/model';
import { setPet } from '../../src/quillpet/store';
import { keepMade, madeStore, setMade, YOURS_CHOICE, type Made } from '../../src/quillpet/made';
import { setHouseTab } from '../../src/quillpet/house';
import { setChoice, _resetChoicesForTests } from '../../src/core/choices';
import { registerYoursChoice } from '../../src/quillpet/choices';
import { setStreamSafe } from '../../src/core/streamSafe';
import { resetClaims } from '../../src/ui/mascot/claims';
import { FAKE_SHEET as S } from '../fixtures/quill-sheet';
import '../../src/renderer/features';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PIC = 'data:image/png;base64,AAAA';
const made = (id: string, kind: Made['kind'], madeAt: number, name = id): Made => ({ id, name, kind, picture: PIC, madeAt });

let root: Root;
let host: HTMLElement;

beforeEach(async () => {
  setQuillSheet({ ...S, url: 'quill.png', width: 128, height: 352 });
  resetClaims();
  setPet(FRESH_PET);
  setMade([]);
  setHouseTab('room');
  registerYoursChoice();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<QuillPetPanel />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setStreamSafe(false);
  setMade([]);
  vi.useRealTimers();
});

const frames = () => [...host.querySelectorAll('.qp-frame')];
const toy = () => host.querySelector('.qp-toy');

describe('the room with nothing of yours in it', () => {
  it('is simply empty: no frames, no toy, and nothing standing in for them', () => {
    expect(host.querySelector('.qp-room')).toBeTruthy();
    expect(frames()).toHaveLength(0);
    expect(toy()).toBeNull();
    expect(host.querySelectorAll('.qp-blank')).toHaveLength(0);
  });
});

describe('the room with your work in it', () => {
  it('hangs your newest drawings on the wall and lays your sprite on the floor, with their real pictures', async () => {
    await act(async () => setMade([made('d1', 'drawing', 9), made('s1', 'sprite', 8), made('d2', 'drawing', 7), made('d3', 'drawing', 6), made('d4', 'drawing', 5)]));
    expect(frames()).toHaveLength(3);
    expect(toy()).toBeTruthy();
    for (const img of host.querySelectorAll('.qp-frame img, .qp-toy img')) expect(img.getAttribute('src')).toBe(PIC);
  });

  it('shows drawings only when there are no sprites, and the toy only when there is a sprite', async () => {
    await act(async () => setMade([made('d1', 'drawing', 9)]));
    expect(frames()).toHaveLength(1);
    expect(toy()).toBeNull();
    await act(async () => setMade([made('s1', 'sprite', 9)]));
    expect(frames()).toHaveLength(0);
    expect(toy()).toBeTruthy();
  });

  it('puts new work up by itself, with nothing asked', async () => {
    expect(frames()).toHaveLength(0);
    await act(async () => keepMade(made('d1', 'drawing', 1, 'First')));
    expect(frames()).toHaveLength(1);
    await act(async () => keepMade(made('s1', 'sprite', 2, 'Hero')));
    expect(toy()).toBeTruthy();
    expect(host.textContent).not.toMatch(/\?/);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('answers a press on a frame or the toy with a word from him', async () => {
    await act(async () => setMade([made('d1', 'drawing', 9), made('s1', 'sprite', 8)]));
    const says = () => host.querySelector('.qp-says')?.textContent;
    await act(async () => void (host.querySelector('.qp-frame') as HTMLElement).click());
    const wall = says();
    await act(async () => void (toy() as HTMLElement).click());
    expect(wall).toBeTruthy();
    expect(says()).toBeTruthy();
    expect(toy()?.className).toContain('is-poked');
  });
});

describe('nothing is taken away', () => {
  it('leaves everything in the room after a year of the panel sitting there', async () => {
    vi.useFakeTimers();
    await act(async () => setMade([made('d1', 'drawing', 1), made('s1', 'sprite', 1)]));
    await act(async () => void vi.advanceTimersByTime(365 * 86_400_000));
    expect(frames()).toHaveLength(1);
    expect(toy()).toBeTruthy();
    expect(madeStore.get().list).toHaveLength(2);
  });
});

describe('switching it off', () => {
  beforeEach(() => _resetChoicesForTests());
  afterEach(() => _resetChoicesForTests());

  it('plain room while off, and all of it back when on again, none lost', async () => {
    registerYoursChoice();
    await act(async () => setMade([made('d1', 'drawing', 9), made('s1', 'sprite', 8)]));
    expect(frames()).toHaveLength(1);
    await act(async () => setChoice(YOURS_CHOICE, 'hide'));
    expect(frames()).toHaveLength(0);
    expect(toy()).toBeNull();
    expect(madeStore.get().list).toHaveLength(2);
    await act(async () => setChoice(YOURS_CHOICE, 'show'));
    expect(frames()).toHaveLength(1);
    expect(toy()).toBeTruthy();
  });
});

describe('stream-safe', () => {
  it('shows stand-in names and blank pictures while on, and the real ones when off again', async () => {
    await act(async () => setMade([made('d1', 'drawing', 9, 'Secret client logo'), made('s1', 'sprite', 8, 'Hidden hero')]));
    await act(async () => setStreamSafe(true));
    const text = host.innerHTML;
    expect(text).not.toContain('Secret client logo');
    expect(text).not.toContain('Hidden hero');
    expect(text).toContain('My drawing');
    expect(host.querySelectorAll('.qp-frame img, .qp-toy img')).toHaveLength(0);
    expect(host.querySelectorAll('.qp-blank')).toHaveLength(2);
    await act(async () => setStreamSafe(false));
    expect(host.innerHTML).toContain('Secret client logo');
    expect(host.querySelectorAll('.qp-frame img, .qp-toy img')).toHaveLength(2);
  });
});
