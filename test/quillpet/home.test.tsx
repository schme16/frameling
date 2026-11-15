// @vitest-environment jsdom
// Quill's one house: three tabs in the one Quill panel. The room (him, his pencils, the way to his lessons), his things
// and his presents.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setQuillSheet } from '../../src/ui/mascot/runtime';
import { QuillPetPanel } from '../../src/quillpet/QuillPetPanel';
import { FRESH_PET } from '../../src/quillpet/model';
import { setPet } from '../../src/quillpet/store';
import { PictureStrip } from '../../src/pixel/PixelBar';
import { claimsNow } from '../../src/ui/mascot/claims';
import { openHouse, setHouseTab } from '../../src/quillpet/house';
import { FAKE_SHEET as S } from '../fixtures/quill-sheet';
import '../../src/renderer/features';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const showPanel = vi.fn();
vi.mock('../../src/ui/dock', async (orig) => ({ ...(await orig<typeof import('../../src/ui/dock')>()), showPanel: (id: string) => showPanel(id) }));

let root: Root;
let host: HTMLElement;

beforeEach(async () => {
  setQuillSheet({ ...S, url: 'quill.png', width: 128, height: 352 });
  setPet(FRESH_PET);
  setHouseTab('room');
  showPanel.mockClear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<QuillPetPanel />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const tabs = () => [...host.querySelectorAll('[role="tab"]')] as HTMLElement[];
const chosen = () => tabs().find((t) => t.getAttribute('aria-selected') === 'true')?.textContent;
const pick = async (label: string) => act(async () => void tabs().find((t) => t.textContent?.startsWith(label))!.click());

describe('the Quill house', () => {
  it('is his to live in: nothing that is not on screen holds a claim on him, so he is not "out"', async () => {
    await act(async () => root.render(<><QuillPetPanel /><PictureStrip /></>));
    expect(claimsNow()).not.toContain('ambient');
    expect(host.textContent).not.toContain("Quill's out helping");
  });

  it('has three tabs, and you land on the room', () => {
    expect(tabs().map((t) => t.textContent)).toEqual(['Room', 'His things', 'Presents']);
    expect(chosen()).toBe('Room');
    expect(host.querySelector('.qp-stage')).toBeTruthy();
    expect(host.textContent).toContain('His pencils');
    expect(host.querySelector('.qp-lessons')).toBeTruthy();
    expect(host.querySelector('.qt-panel')).toBeFalsy();
  });

  it('keeps his things, with the way to give him another, on the His things tab', async () => {
    await pick('His things');
    expect(chosen()).toBe('His things');
    expect(host.querySelector('[data-help="quill-things"]')).toBeTruthy();
    expect(host.textContent).toContain('Give him this drawing');
    expect(host.querySelector('.qp-stage')).toBeFalsy();
  });

  it('keeps the presents on the Presents tab, with a word while there are none', async () => {
    await pick('Presents');
    expect(host.querySelector('[data-help="quill-presents"]')).toBeTruthy();
    expect(host.querySelector('.qt-shelf-none')).toBeTruthy();
    expect(host.textContent).not.toContain('Give him this drawing');
  });

  it('shows a dot on the Presents tab while one is waiting, from any tab', async () => {
    expect(host.querySelector('.qp-tab-new')).toBeFalsy();
    const present = { id: 'p1', kind: 'crayon' as const, name: 'Ball', picture: 'data:image/png;base64,AA', source: { width: 1, height: 1, background: null, shapes: [] }, seed: 1, madeAt: 1 };
    await act(async () => setPet({ ...FRESH_PET, presents: [present] }));
    expect(host.querySelector('.qp-tab-new')).toBeTruthy();
    await act(async () => setPet({ ...FRESH_PET, presents: [{ ...present, opened: true }] }));
    expect(host.querySelector('.qp-tab-new')).toBeFalsy();
  });

  it('moves between tabs with the arrow keys, round the ends', async () => {
    const key = async (k: string) => act(async () => void tabs().find((t) => t.getAttribute('aria-selected') === 'true')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })));
    await key('ArrowRight');
    expect(chosen()).toBe('His things');
    await key('ArrowLeft');
    await key('ArrowLeft');
    expect(chosen()).toBe('Presents');
  });

  it('opens on the tab a command asks for', async () => {
    await act(async () => openHouse('presents'));
    expect(chosen()).toBe('Presents');
    await act(async () => openHouse());
    expect(chosen()).toBe('Room');
    expect(showPanel).toHaveBeenCalledWith('quill-pet');
  });

  it('opens the Quests panel from the lessons row', async () => {
    const b = [...host.querySelectorAll('button')].find((x) => x.textContent === 'Open Quests')!;
    await act(async () => void b.click());
    expect(showPanel).toHaveBeenCalledWith('quests');
  });
});
