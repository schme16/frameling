// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Quill, QuillEmpty, QuillSays } from '../../src/ui/mascot';
import { noteInput, playerCount, setQuillSheet, SLEEP_AFTER } from '../../src/ui/mascot/runtime';
import { resetPrefs, setPrefs } from '../../src/ui/prefs';
import { FAKE_SHEET } from '../fixtures/quill-sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  resetPrefs();
  setQuillSheet({ ...FAKE_SHEET, url: 'quill.png', width: 128, height: 288 });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  resetPrefs();
});

describe('Quill on screen', () => {
  it('draws the first frame at a whole-number scale, pixelated', async () => {
    await act(async () => root.render(<Quill anim="wave" size={96} />));
    const el = host.querySelector<HTMLElement>('.quill')!;
    expect(el).toBeTruthy();
    expect(el.style.width).toBe('96px');
    expect(el.style.backgroundSize).toBe('384px 864px');
    expect(el.style.backgroundPosition).toBe('0px -96px');
    expect(el.dataset.anim).toBe('wave');
    expect(playerCount()).toBe(1);
  });

  it('hides everywhere when Show Quill is off, but bubbles people need keep their words', async () => {
    await act(async () =>
      root.render(
        <>
          <Quill />
          <QuillSays>
            <p>Hello there</p>
          </QuillSays>
        </>,
      ),
    );
    expect(host.querySelectorAll('.quill')).toHaveLength(2);
    await act(async () => setPrefs({ showQuill: false }));
    expect(host.querySelector('.quill')).toBeNull();
    expect(host.textContent).toContain('Hello there');
    expect(host.querySelector('.quill-says')!.classList.contains('is-alone')).toBe(true);
    expect(playerCount()).toBe(0);
  });

  it('drops his chatter when Show Quill is off, or swaps in the plain version', async () => {
    await act(async () =>
      root.render(
        <>
          <QuillSays whenHidden={null}>
            <p>Chatter</p>
          </QuillSays>
          <QuillSays whenHidden={<p>Plain words</p>}>
            <p>Chatty words</p>
          </QuillSays>
          <QuillEmpty whenHidden="Nothing here.">I looked hard!</QuillEmpty>
        </>,
      ),
    );
    expect(host.textContent).toContain('Chatter');
    expect(host.textContent).toContain('Chatty words');
    expect(host.textContent).toContain('I looked hard!');
    await act(async () => setPrefs({ showQuill: false }));
    expect(host.textContent).not.toContain('Chatter');
    expect(host.textContent).not.toContain('Chatty words');
    expect(host.textContent).toContain('Plain words');
    expect(host.textContent).not.toContain('I looked hard!');
    expect(host.textContent).toContain('Nothing here.');
    expect(host.querySelectorAll('.quill-says')).toHaveLength(1);
  });

  it('draws nothing while there is no sheet', async () => {
    setQuillSheet(null);
    await act(async () => root.render(<Quill />));
    expect(host.querySelector('.quill')).toBeNull();
  });
});

describe('Quill waking from a nap', () => {
  afterEach(() => {
    vi.useRealTimers();
    noteInput();
  });

  it('stirs and stretches through the wake frames, then settles into idle', async () => {
    vi.useFakeTimers();
    // The idle clock started on the real timer, so start it again on the fake one.
    noteInput();
    await act(async () => root.render(<Quill anim="idle" size={96} />));
    const el = host.querySelector<HTMLElement>('.quill')!;
    await act(async () => void vi.advanceTimersByTime(SLEEP_AFTER + 500));
    expect(el.dataset.anim).toBe('sleep');
    await act(async () => noteInput());
    expect(el.dataset.anim).toBe('wake');
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      await act(async () => void vi.advanceTimersByTime(100));
      seen.add(el.dataset.anim!);
    }
    expect([...seen]).toEqual(['wake', 'idle']);
    expect(el.dataset.anim).toBe('idle');
  });

  it('wakes the same way when he was asked for idle then idle, as the Quill tab does', async () => {
    vi.useFakeTimers();
    noteInput();
    await act(async () => root.render(<Quill anim="idle" then="idle" size={96} />));
    const el = host.querySelector<HTMLElement>('.quill')!;
    await act(async () => void vi.advanceTimersByTime(SLEEP_AFTER + 10_000));
    expect(el.dataset.anim).toBe('sleep');
    await act(async () => noteInput());
    expect(el.dataset.anim).toBe('wake');
  });

  it('goes back to sleep without waking if he nods off again mid-stretch', async () => {
    vi.useFakeTimers();
    // The idle clock started on the real timer, so start it again on the fake one.
    noteInput();
    await act(async () => root.render(<Quill anim="idle" size={96} />));
    const el = host.querySelector<HTMLElement>('.quill')!;
    await act(async () => void vi.advanceTimersByTime(SLEEP_AFTER + 500));
    await act(async () => noteInput());
    expect(el.dataset.anim).toBe('wake');
    await act(async () => void vi.advanceTimersByTime(SLEEP_AFTER + 500));
    expect(el.dataset.anim).toBe('sleep');
  });

  it('wakes through the frames when an explicit sleep changes to idle, but a cheer goes straight in', async () => {
    await act(async () => root.render(<Quill anim="sleep" size={96} />));
    const el = host.querySelector<HTMLElement>('.quill')!;
    expect(el.dataset.anim).toBe('sleep');
    await act(async () => root.render(<Quill anim="idle" size={96} />));
    expect(el.dataset.anim).toBe('wake');
    await act(async () => root.render(<Quill anim="sleep" size={96} />));
    await act(async () => root.render(<Quill anim="cheer" size={96} />));
    expect(el.dataset.anim).toBe('cheer');
  });
});
