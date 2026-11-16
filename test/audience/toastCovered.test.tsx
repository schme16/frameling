// @vitest-environment jsdom
// Words from chat that nobody has read stay out of the page until Read it is pressed, and an action that goes with them
// ("Put it up") waits behind the reading.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setChoice, setChoiceAsker } from '../../src/core/choices';
import { UNREAD_WAIT_MS } from '../../src/audience/spoilers';
import { clearToasts, toast, toasts } from '../../src/ui/toast';
import { ToastView } from '../../src/ui/ToastView';
import { askToShowWords } from '../../src/dares/askWords';
import { askToShowSign } from '../../src/quillreacts/react';
import { audience, setAudienceOn, submitAudience } from '../../src/audience';
import { _resetFeaturesForTests, registerFeatures } from '../../src/features/host';
import { streamDoorFeature } from '../../src/streamdoor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const q = (id: string) => document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);

beforeEach(() => {
  setChoiceAsker(null);
  setChoice('audience.view', 'screen');
  clearToasts();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<ToastView />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  clearToasts();
  setChoice('audience.view', undefined);
  vi.useRealTimers();
});

describe('a toast with covered words', () => {
  it('shows the cover, not the words, and a Read it button; pressing it shows the words', () => {
    act(() => void toast('some rude words', { covered: 'Chat sent some words.' }));
    expect(host.textContent).toContain('Chat sent some words.');
    expect(host.textContent).not.toContain('rude');
    act(() => q('toast.read-it')!.click());
    expect(host.textContent).toContain('some rude words');
    expect(q('toast.read-it')).toBeNull();
  });

  it('keeps the action behind the reading', () => {
    let ran = 0;
    act(() => void toast('some rude words', { covered: 'Chat sent some words.', action: { label: 'Put it up', id: 'words-yes', run: () => void ran++ }, decline: { label: 'Not that one', id: 'words-no', run: () => undefined } }));
    expect(q('toast.words-yes')).toBeNull();
    // Saying no never needs the words read.
    expect(q('toast.words-no')).toBeTruthy();
    act(() => q('toast.read-it')!.click());
    act(() => q('toast.words-yes')!.click());
    expect(ran).toBe(1);
  });

  it('shows the words straight away when viewers see only the capture window', () => {
    setChoice('audience.view', 'capture');
    act(() => void toast('some plain words', { covered: 'Chat sent some words.' }));
    expect(host.textContent).toContain('some plain words');
    expect(q('toast.read-it')).toBeNull();
  });

  it('is covered before the question has been answered', () => {
    setChoice('audience.view', undefined);
    act(() => void toast('some rude words', { covered: 'Chat sent some words.' }));
    expect(host.textContent).not.toContain('rude');
  });

  it('goes by itself if nobody reads it, and a toast with nothing covered is untouched', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    act(() => void toast('some rude words', { covered: 'Chat sent some words.' }));
    act(() => void toast('Emptied the queue.'));
    expect(host.textContent).toContain('Emptied the queue.');
    act(() => void vi.advanceTimersByTime(UNREAD_WAIT_MS + 100));
    expect(toasts.get().length).toBe(0);
  });
});

describe('the two questions that put chat words on screen', () => {
  it('the banner question keeps the words covered until Read it', () => {
    const ctl = new AbortController();
    act(() => void askToShowWords('a banner of rude words', ctl.signal));
    expect(document.body.textContent).not.toContain('rude');
    expect(q('toast.read-it')).toBeTruthy();
    act(() => q('toast.words-no')!.click());
  });
  it('the sign question keeps the sign covered until Read it', () => {
    const ctl = new AbortController();
    act(() => void askToShowSign('a sign of rude words', ctl.signal));
    expect(document.body.textContent).not.toContain('rude');
    act(() => q('toast.read-it')!.click());
    expect(document.body.textContent).toContain('a sign of rude words');
    act(() => q('toast.sign-no')!.click());
  });
});

describe('a message from a stream tool', () => {
  it('arrives covered, with its words held back until Read it', () => {
    _resetFeaturesForTests();
    registerFeatures([streamDoorFeature]);
    audience.kill();
    setChoice('audience.strictness', 'balanced');
    setAudienceOn(true);
    let ok = false;
    act(() => void (ok = submitAudience('door.message', { text: 'a rude message' }).ok));
    expect(ok).toBe(true);
    expect(toasts.get().some((t) => t.message === 'a rude message' && !!t.covered)).toBe(true);
    expect(document.body.textContent).not.toContain('rude');
    act(() => q('toast.read-it')!.click());
    expect(document.body.textContent).toContain('a rude message');
    setAudienceOn(false);
  });
});
