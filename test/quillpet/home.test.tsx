// @vitest-environment jsdom
// Quill's one home: him, his shelves and the way to his lessons, all in the one Quill panel.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setQuillSheet } from '../../src/ui/mascot/runtime';
import { QuillPetPanel } from '../../src/quillpet/QuillPetPanel';
import { FRESH_PET } from '../../src/quillpet/model';
import { setPet } from '../../src/quillpet/store';
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

describe('the Quill panel', () => {
  it('holds him, his pencils, his shelves and the way to his lessons in one place', () => {
    expect(host.querySelector('.qp-stage')).toBeTruthy();
    expect(host.textContent).toContain('His pencils');
    expect(host.querySelector('.qt-panel')).toBeTruthy();
    expect(host.textContent).toContain('Give him this drawing');
    expect(host.querySelector('.qp-lessons')).toBeTruthy();
    expect(host.querySelectorAll('[data-help]').length).toBeGreaterThanOrEqual(2);
  });

  it('calls nothing "His things" or "Quill\'s things" any more', () => {
    expect(host.textContent).not.toMatch(/His things|Quill's things/);
  });

  it('opens the Quests panel from the lessons row', async () => {
    const b = [...host.querySelectorAll('button')].find((x) => x.textContent === 'Open Quests')!;
    await act(async () => void b.click());
    expect(showPanel).toHaveBeenCalledWith('quests');
  });
});
