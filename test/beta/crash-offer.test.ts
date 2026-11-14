// @vitest-environment jsdom
// Quill after a crash: what the offer decides in each case (pure), what the report says, and the dialog's presses.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetChoicesForTests } from '../../src/core/choices';
import { resetPrefs } from '../../src/ui/prefs';
import { clearToasts } from '../../src/ui/toast';
import { FAKE_SHEET } from '../fixtures/quill-sheet';
import type { CrashNotes } from '../../src/preload/api';
import type { Reply } from '../../src/beta/outcome';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = { url: 'https://boards.example', key: 'pbk_test' };
const notes: CrashNotes = { how: 'both', startedAt: Date.UTC(2026, 10, 14, 9, 30), version: '1.4.0', platform: 'linux x64', events: ['The drawing window stopped (crashed, exit code 139) in /home/ada/art/secret-film.frameling.'] };

/** Loads the beta code fresh, as a build with a key or as an ordinary build with none. */
async function load(withKey: boolean) {
  localStorage.clear();
  vi.resetModules();
  vi.stubGlobal('__FRAMELING_INGEST__', withKey ? KEY : undefined);
  const offer = await import('../../src/beta/crashAsk');
  const choices = await import('../../src/core/choices');
  const prefs = await import('../../src/ui/prefs');
  return { ...offer, choices, prefs };
}

describe('what the offer decides', () => {
  const base = { crash: true, offered: false, canSend: true, switchOn: true };
  let crashAction: Awaited<ReturnType<typeof load>>['crashAction'];
  beforeEach(async () => void ({ crashAction } = await load(false)));

  it('a clean quit: nothing, ever', () => {
    expect(crashAction({ ...base, crash: false }).kind).toBe('none');
    expect(crashAction({ ...base, crash: false, offered: true, remembered: 'no' }).kind).toBe('none');
  });

  it('a crash in a build that can send: Quill asks', () => {
    expect(crashAction(base).kind).toBe('ask');
  });

  it('a crash in a build that cannot send: he says what happened and does not offer to send', () => {
    expect(crashAction({ ...base, canSend: false, switchOn: false }).kind).toBe('tell');
  });

  it('a No thanks already remembered: he stays away, whether the build can send or not', () => {
    expect(crashAction({ ...base, remembered: 'no' }).kind).toBe('none');
    expect(crashAction({ ...base, canSend: false, remembered: 'no' }).kind).toBe('none');
  });

  it('he turns up once per crash', () => {
    expect(crashAction({ ...base, offered: true }).kind).toBe('none');
    expect(crashAction({ ...base, canSend: false, offered: true }).kind).toBe('none');
  });

  it('with reports switched off in a build that can send, he does not offer', () => {
    expect(crashAction({ ...base, switchOn: false }).kind).toBe('none');
  });

  it('the command asks again whatever was said before, and says so when there is nothing', () => {
    expect(crashAction({ ...base, offered: true, remembered: 'no', force: true }).kind).toBe('ask');
    expect(crashAction({ ...base, canSend: false, offered: true, remembered: 'no', force: true }).kind).toBe('tell');
    expect(crashAction({ ...base, switchOn: false, force: true }).kind).toBe('off');
    expect(crashAction({ ...base, crash: false, force: true }).kind).toBe('nothing');
  });
});

describe('how long ago', () => {
  it("a crash from this week is his to bring up; an old one only comes back through the command", async () => {
    const { isFresh } = await load(false);
    const now = Date.UTC(2026, 10, 20);
    expect(isFresh({ ...notes, startedAt: now - 3 * 86_400_000 }, now)).toBe(true);
    expect(isFresh({ ...notes, startedAt: now - 30 * 86_400_000 }, now)).toBe(false);
  });

  it('on start-up he skips a crash from long ago, and the command still offers it', async () => {
    const m = await load(true);
    m.prefs.setPrefs({ betaReports: true });
    const old = { ...notes, startedAt: Date.now() - 40 * 86_400_000 };
    (window as unknown as { frameling?: unknown }).frameling = { app: { getLastCrash: async () => ({ notes: old, offered: false }), crashOffered: () => undefined } };
    await m.considerCrash();
    expect(m.crashDialog.get()).toBeNull();
    await m.considerCrash({ force: true });
    expect(m.crashDialog.get()?.mode).toBe('ask');
    (window as unknown as { frameling?: unknown }).frameling = undefined;
  });
});

describe('the report', () => {
  it('is a crash report with the facts, and nothing of what was drawn or where it lives', async () => {
    const { crashReport, sayHow } = await load(true);
    const r = crashReport(notes, { appVersion: '9.9.9', platform: 'linux', screen: { width: 1920, height: 1080 } }, 'ada@example.com');
    expect(r).toMatchObject({ kind: 'crash', app: 'Frameling', version: '1.4.0', platform: 'linux x64', contact: 'ada@example.com', summary: sayHow('both') });
    expect((r.data as { crash: unknown }).crash).toEqual({ how: 'both', startedAt: '2026-11-14T09:30:00.000Z', version: '1.4.0', platform: 'linux x64' });
    const text = JSON.stringify(r);
    expect(text).not.toContain('/home/ada');
    expect(text).not.toContain('secret-film');
    // The contact is given on purpose, so it is in as typed (see the report tests); it is the only address that may be.
    expect(text.split('ada@example.com').length - 1).toBe(1);
    expect(text).toContain('exit code 139');
  });

  it('says in plain words how it stopped', async () => {
    const { sayHow } = await load(true);
    expect(sayHow('killed')).toMatch(/without closing properly/);
    expect(sayHow('window')).toMatch(/window crashed/);
    for (const h of ['killed', 'window', 'both'] as const) expect(sayHow(h)).not.toMatch(/—/);
  });
});

describe('the command and the start-up check', () => {
  const app = (last: unknown) => ({ getLastCrash: vi.fn(async () => last), crashOffered: vi.fn() });
  const setBridge = (a: ReturnType<typeof app> | undefined) => ((window as unknown as { frameling?: unknown }).frameling = a ? { app: a, platform: 'linux', versions: { app: '1.4.0', electron: '45', chrome: '140' } } : undefined);
  beforeEach(() => {
    _resetChoicesForTests();
    resetPrefs();
    clearToasts();
  });
  afterEach(() => {
    setBridge(undefined);
    vi.unstubAllGlobals();
  });

  it('after a crash in a build that can send, the dialog opens and the desktop side hears that it was offered', async () => {
    const m = await load(true);
    m.prefs.setPrefs({ betaReports: true });
    const a = app({ notes, offered: false });
    setBridge(a);
    await m.considerCrash();
    expect(m.crashDialog.get()?.mode).toBe('ask');
    expect(a.crashOffered).toHaveBeenCalledOnce();
  });

  it('in a build that cannot send, he only tells', async () => {
    const m = await load(false);
    setBridge(app({ notes, offered: false }));
    await m.considerCrash();
    expect(m.crashDialog.get()?.mode).toBe('tell');
  });

  it('after a clean quit, or when already offered, or in a web page, nothing opens', async () => {
    const m = await load(true);
    m.prefs.setPrefs({ betaReports: true });
    for (const last of [null, { notes, offered: true }]) {
      setBridge(app(last));
      await m.considerCrash();
      expect(m.crashDialog.get()).toBeNull();
    }
    setBridge(undefined);
    await m.considerCrash();
    expect(m.crashDialog.get()).toBeNull();
  });

  it('a remembered No thanks keeps him away, and the command still brings him', async () => {
    const m = await load(true);
    m.prefs.setPrefs({ betaReports: true });
    m.registerCrashChoice();
    m.choices.setChoice(m.CRASH_CHOICE, 'no');
    setBridge(app({ notes, offered: false }));
    await m.considerCrash();
    expect(m.crashDialog.get()).toBeNull();
    await m.considerCrash({ force: true });
    expect(m.crashDialog.get()?.mode).toBe('ask');
  });

  it('the command with nothing to send says so in a toast', async () => {
    const m = await load(true);
    setBridge(app(null));
    await m.considerCrash({ force: true });
    expect(m.crashDialog.get()).toBeNull();
    const { toasts } = await import('../../src/ui/toast');
    expect(toasts.get().some((t) => /Nothing to send/.test(t.message))).toBe(true);
  });

  it('the choice is listed in Preferences, Behaviour, so a No thanks can be undone', async () => {
    const m = await load(true);
    m.registerCrashChoice();
    const c = (await import('../../src/core/choices')).allChoices().find((x) => x.id === m.CRASH_CHOICE);
    expect(c?.options.map((o) => o.value)).toEqual(['ask', 'no']);
    expect(c?.default).toBe('ask');
  });
});

describe('the dialog', () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    _resetChoicesForTests();
    resetPrefs();
    host = document.createElement('div');
    document.body.append(host);
  });
  afterEach(() => {
    host.remove();
    vi.unstubAllGlobals();
  });

  async function open(withKey: boolean, mode: 'ask' | 'tell') {
    const m = await load(withKey);
    // The same fresh copy of the modules the dialog uses, so the page has a Quill to draw.
    (await import('../../src/ui/mascot/runtime')).setQuillSheet({ ...FAKE_SHEET, url: 'quill.png', width: 128, height: 384 });
    const { CrashOffer } = await import('../../src/beta/CrashOffer');
    const { createElement } = await import('react');
    const root = createRoot(host);
    await act(async () => root.render(createElement(CrashOffer)));
    const report = m.crashReport(notes, { appVersion: '1.4.0', platform: 'linux' });
    await act(async () => m.crashDialog.set({ mode, notes, report }));
    return { m, report, root };
  }
  const press = async (id: string) => {
    await act(async () => void host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click());
  };
  // The mascot's own sheet is fetched too; only the board matters here.
  const posts = (f: ReturnType<typeof vi.fn>) => (f.mock.calls as unknown as [string, { body: string }][]).filter(([u]) => /api\/ingest/.test(u));
  const reply = (r: Reply) => vi.fn(async () => new Response(r && 'text' in r ? r.text : '', { status: 'status' in r ? r.status : 0, headers: { 'content-type': 'application/json' } }));

  it('the offer has Send the notes and No thanks, and lets you read the report before anything goes', async () => {
    const { m, report } = await open(true, 'ask');
    expect(host.querySelector('.quill')).not.toBeNull();
    expect(host.textContent).toContain('Send the notes');
    expect(host.textContent).toContain('No thanks');
    expect(host.textContent).toContain('Read what would go');
    expect(host.querySelector('[data-testid="crash.report"]')!.textContent).toBe(JSON.stringify(report, null, 2));
    expect(m.crashDialog.get()).not.toBeNull();
  });

  it('nothing is sent until Send is pressed, and then exactly the report that was shown', async () => {
    const f = reply({ status: 200, type: 'application/json', text: '{"ok":true}' });
    vi.stubGlobal('fetch', f);
    const { report } = await open(true, 'ask');
    expect(posts(f)).toHaveLength(0);
    await press('crash.send');
    expect(posts(f)).toHaveLength(1);
    const [url, init] = posts(f)[0];
    expect(url).toBe('https://boards.example/api/ingest');
    expect(JSON.parse(init.body)).toEqual(JSON.parse(JSON.stringify(report)));
    expect(host.textContent).toContain('Sent!');
  });

  it('a failed send says why in plain words and lets you try again', async () => {
    vi.stubGlobal('fetch', reply({ status: 500, type: 'application/json', text: '{}' }));
    await open(true, 'ask');
    await press('crash.send');
    expect(host.querySelector('[data-testid="crash.failed"]')!.textContent).toMatch(/board is having trouble/);
    expect(host.textContent).toContain('Try again');
  });

  it('No thanks remembers itself by default, and sends nothing', async () => {
    const f = reply({ status: 200, type: 'application/json', text: '{"ok":true}' });
    vi.stubGlobal('fetch', f);
    const { m } = await open(true, 'ask');
    m.registerCrashChoice();
    await press('crash.no');
    expect(posts(f)).toHaveLength(0);
    expect(m.crashDialog.get()).toBeNull();
    expect(m.choices.rememberedChoice(m.CRASH_CHOICE)).toBe('no');
  });

  it('No thanks with the box cleared is for this time only', async () => {
    const { m } = await open(true, 'ask');
    m.registerCrashChoice();
    await act(async () => void host.querySelector<HTMLInputElement>('[data-testid="crash.remember"]')!.click());
    await press('crash.no');
    expect(m.crashDialog.get()).toBeNull();
    expect(m.choices.rememberedChoice(m.CRASH_CHOICE)).toBeUndefined();
  });

  it('in a build that cannot send there is no Send button at all, just OK', async () => {
    const { m } = await open(false, 'tell');
    expect(host.querySelector('[data-testid="crash.send"]')).toBeNull();
    expect(host.querySelector('[data-testid="crash.no"]')).toBeNull();
    expect(host.textContent).toContain("can't send anything");
    await press('crash.ok');
    expect(m.crashDialog.get()).toBeNull();
  });

  it('while he is up, other offers wait (he counts as an open overlay)', async () => {
    const { m } = await open(true, 'ask');
    const { anyOverlayOpen } = await import('../../src/ui/overlays');
    expect(anyOverlayOpen()).toBe(true);
    await press('crash.no');
    expect(anyOverlayOpen()).toBe(false);
    void m;
  });
});
