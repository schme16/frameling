// @vitest-environment jsdom
// Switching Quill off: he's sad for a moment, waves a brave goodbye, then goes. Back on: a cheer.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Quill, setShowQuill } from '../../src/ui/mascot';
import { setQuillSheet } from '../../src/ui/mascot/runtime';
import { goodbyeScript, SAD_HOLD, GOODBYE_WORDS, welcomeBackScript } from '../../src/ui/mascot/scripts';
import { poseAt, totalMs } from '../../src/ui/mascot/timing';
import { getPrefs, resetPrefs, setPrefs } from '../../src/ui/prefs';
import { clearToasts, toasts } from '../../src/ui/toast';
import { ToastView } from '../../src/ui/ToastView';
import { FAKE_SHEET as S } from '../fixtures/quill-sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('the goodbye script', () => {
  const beats = goodbyeScript();
  const wave = totalMs(S.anims['wave-sad']);

  it('is sad first, then waves goodbye, then is done', () => {
    expect(poseAt(S, beats, 0).anim).toBe('sad');
    expect(poseAt(S, beats, SAD_HOLD.long - 1).anim).toBe('sad');
    expect(poseAt(S, beats, SAD_HOLD.long + 1).anim).toBe('wave-sad');
    expect(poseAt(S, beats, SAD_HOLD.long + 1).done).toBe(false);
    expect(poseAt(S, beats, SAD_HOLD.long + wave + 1).done).toBe(true);
  });

  it('is shorter from Preferences', () => {
    expect(poseAt(S, goodbyeScript(true), SAD_HOLD.short + 1).anim).toBe('wave-sad');
    expect(SAD_HOLD.short).toBeLessThan(SAD_HOLD.long);
  });

  it('with less motion shows a still sad frame, and still finishes', () => {
    for (const t of [0, 700, 2000, SAD_HOLD.long - 1]) expect(poseAt(S, beats, t, { still: true }).frame).toEqual(S.anims.sad.frames[0]);
    expect(poseAt(S, beats, SAD_HOLD.long + 1, { still: true }).frame).toEqual(S.anims['wave-sad'].frames[0]);
    expect(poseAt(S, beats, SAD_HOLD.long + wave + 1, { still: true }).done).toBe(true);
  });

  it('welcome back is a cheer', () => {
    expect(welcomeBackScript()[0].anim).toBe('cheer');
  });

  it('tells you where to find him again, without dashes', () => {
    for (const w of [...GOODBYE_WORDS.long, GOODBYE_WORDS.short]) expect(w).not.toMatch(/—/);
    expect(GOODBYE_WORDS.long.join(' ')).toContain('Meet Quill again');
    expect(GOODBYE_WORDS.long.join(' ')).toContain('Preferences');
    expect(GOODBYE_WORDS.short).toContain('Meet Quill again');
  });
});

describe('switching Show Quill', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    resetPrefs();
    clearToasts();
    setQuillSheet({ ...S, url: 'quill.png', width: 128, height: 352 });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    clearToasts();
    resetPrefs();
  });

  it('off: the pref goes off at once and a sad goodbye toast plays', () => {
    setShowQuill(false);
    expect(getPrefs().showQuill).toBe(false);
    const [t] = toasts.get();
    expect(t.farewell).toBe(true);
    expect(t.message).toBe(GOODBYE_WORDS.short);
    expect(t.quill).toEqual(goodbyeScript(true));
  });

  it('on again: a happy cheer; the same value twice says nothing', () => {
    setShowQuill(false);
    clearToasts();
    setShowQuill(true);
    expect(getPrefs().showQuill).toBe(true);
    expect(toasts.get()).toHaveLength(1);
    expect(toasts.get()[0].kind).toBe('success');
    setShowQuill(true);
    expect(toasts.get()).toHaveLength(1);
  });

  it('shows him being sad on the toast even though he is off, then he goes once the goodbye is done', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'queueMicrotask'] });
    await act(async () => root.render(<><Quill /><ToastView /></>));
    expect(host.querySelectorAll('.quill')).toHaveLength(1);
    await act(async () => setShowQuill(false));
    // The everyday Quill goes straight away; the one on the toast stays for his goodbye.
    const sad = host.querySelectorAll<HTMLElement>('.quill');
    expect(sad).toHaveLength(1);
    expect(sad[0].classList.contains('ui-toast-quill')).toBe(true);
    expect(sad[0].dataset.anim).toBe('sad');
    await act(async () => void (await vi.advanceTimersByTimeAsync(SAD_HOLD.short + 50)));
    expect(host.querySelector<HTMLElement>('.quill')!.dataset.anim).toBe('wave-sad');
    await act(async () => void (await vi.advanceTimersByTimeAsync(totalMs(S.anims['wave-sad']) + 100)));
    expect(host.querySelector('.quill')).toBeNull();
    // The words stay a little longer.
    expect(host.textContent).toContain(GOODBYE_WORDS.short);
  });

  it('a toast that is not a goodbye never forces him on', async () => {
    setPrefs({ showQuill: false });
    const { toast } = await import('../../src/ui/toast');
    toast('Nope', { kind: 'error' });
    await act(async () => root.render(<ToastView />));
    expect(host.querySelector('.quill')).toBeNull();
  });
});
