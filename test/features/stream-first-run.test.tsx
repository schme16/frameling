// @vitest-environment jsdom
// Streaming in the first-run hello: the question offers it, no tucks the streaming tools away, yes keeps them, nothing
// becomes unreachable either way, and somebody who finished the hello long ago is offered the same choice once.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allCommands, allHelp, getCommand } from '../../src/core/registry';
import { rememberedChoice, setChoice, setChoiceAsker, _resetChoicesForTests } from '../../src/core/choices';
import { hiddenHelp, isFeatureOn, offFeatures, setFeatureOn, switchableFeatures } from '../../src/features/host';
import { FeaturesPage } from '../../src/features/FeaturesPage';
import { STREAM_FEATURES } from '../../src/features/streamIds';
import { considerStreamOffer, markStreamOfferDone, noteHelloAnswer, offerAction, registerStreamOfferChoice, resetStreamOffer, STREAM_OFFER_ID, streamOfferDone, type OfferFacts } from '../../src/features/streamOffer';
import { setStreaming, streamingCount, streamingOn } from '../../src/features/streamFamily';
import { syncDynamicCommands } from '../../src/ui/dynamic';
import { featuresToTuck, INTERESTS, INTEREST_KEEPS, planFor, TUCKABLE, type TuckFeature } from '../../src/ui/onboarding/flow';
import { OnboardingSheet } from '../../src/ui/onboarding/Onboarding';
import { closeOnboarding, openOnboarding } from '../../src/ui/overlays';
import { resolveMenus } from '../../src/ui/menus';
import { paletteItems } from '../../src/ui/palette';
import { getPrefs, resetPrefs, setPrefs } from '../../src/ui/prefs';
import { clearToasts, toasts } from '../../src/ui/toast';
import '../../src/ui/commands';
import '../../src/renderer/features';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const live = (over: Record<string, boolean> = {}): TuckFeature[] => [
  { id: 'audio', on: true },
  { id: 'rig', on: true },
  ...STREAM_FEATURES.map((id) => ({ id, on: over[id] ?? true, requires: id === 'stream-door' || id === 'stream-twitch' ? [] : ['stream-door'] })),
];

const ids = () => {
  syncDynamicCommands();
  return allCommands().map((c) => c.id).sort();
};
const viewHas = (id: string): boolean => resolveMenus().some((m) => m.items.some((i) => JSON.stringify(i).includes(`"${id}"`)));
const viewLabels = (): string[] => JSON.stringify(resolveMenus()).match(/"label":"[^"]*"/g) ?? [];

beforeEach(() => {
  localStorage.clear();
  resetPrefs();
  clearToasts();
  resetStreamOffer();
  setStreaming(true, { remember: false });
  setChoice(STREAM_OFFER_ID, undefined);
});
afterEach(() => {
  setStreaming(true, { remember: false });
  setChoice(STREAM_OFFER_ID, undefined);
  setChoiceAsker(null);
});

describe('the question', () => {
  it('has a Streaming it live card, in the same plain style as the others', () => {
    const c = INTERESTS.find((i) => i.id === 'stream')!;
    expect(c.title).toBe('Streaming it live');
    expect(c.blurb.length).toBeGreaterThan(5);
    for (const i of INTERESTS) expect(`${i.title} ${i.blurb} ${i.reaction}`).not.toMatch(/—/);
    // Every kind of card has a row in the table, so none is forgotten.
    for (const i of INTERESTS) expect(INTEREST_KEEPS[i.id], i.id).toBeDefined();
  });

  it('keeps exactly the nine streaming features for that pick, and they are all real optional features', () => {
    expect(INTEREST_KEEPS.stream).toEqual([...STREAM_FEATURES]);
    const real = new Set(switchableFeatures().map((f) => f.id));
    for (const id of STREAM_FEATURES) {
      expect(real.has(id), id).toBe(true);
      expect(TUCKABLE).toContain(id);
    }
  });

  it('covers every feature that is only for streaming (nothing added later is forgotten)', () => {
    const named = switchableFeatures().filter((f) => /audience features are on|actions door/i.test(f.about)).map((f) => f.id);
    for (const id of named) expect(STREAM_FEATURES, id).toContain(id);
  });
});

describe('what is put away', () => {
  it('puts the streaming tools away for any pick that is not Streaming it live, the actions door last', () => {
    const away = featuresToTuck(['cartoons'], live());
    for (const id of STREAM_FEATURES) expect(away).toContain(id);
    expect(away.indexOf('stream-door')).toBeGreaterThan(away.indexOf('quill-reacts'));
    expect(away.indexOf('stream-door')).toBeGreaterThan(away.indexOf('stream-guess'));
  });

  it('keeps them for a streamer, with or without another pick', () => {
    expect(featuresToTuck(['stream', 'cartoons'], live())).not.toEqual(expect.arrayContaining(['stream-door']));
    expect(featuresToTuck(['stream'], live())).toEqual([]);
    expect(featuresToTuck(['stream', 'play'], live())).toEqual([]);
  });

  it('for Just playing puts away the streaming tools and nothing else', () => {
    expect(featuresToTuck(['play'], live()).sort()).toEqual([...STREAM_FEATURES].sort());
  });

  it('puts nothing away when nothing was picked', () => {
    expect(featuresToTuck([], live())).toEqual([]);
  });

  it('a streamer picking only streaming does not lose the making areas either', () => {
    expect(featuresToTuck(['stream'], live())).not.toContain('rig');
  });

  it('streaming never leads the plan, and its help comes first', () => {
    const plan = planFor(['cartoons', 'stream']);
    expect(plan.workspace).toBe('animate');
    expect(plan.help[0]).toBe('audience');
    expect(planFor(['stream']).workspace).toBe('draw');
  });
});

describe('answering no, then yes, in the real hello', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const click = async (el: Element) => act(async () => void (el as HTMLElement).click());
  const card = (t: string) => [...document.querySelectorAll<HTMLElement>('.ob-card')].find((c) => c.textContent?.includes(t));
  const run = async (...picks: string[]) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => openOnboarding());
    await act(async () => root.render(<OnboardingSheet />));
    await click(document.querySelector('.ob-next')!);
    for (const p of picks) await click(card(p)!);
    for (let i = 0; i < 3; i++) await click(document.querySelector('.ob-next')!);
    await click(document.querySelector<HTMLElement>('.ob-go-list .ob-go:last-child')!);
  };
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    act(() => closeOnboarding());
  });

  it('offers the card', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => openOnboarding());
    await act(async () => root.render(<OnboardingSheet />));
    await click(document.querySelector('.ob-next')!);
    expect(card('Streaming it live')).toBeTruthy();
  });

  it('no (a pick that is not streaming) tucks every streaming tool away, says so, and records it', async () => {
    await run('Sketches and cartoons');
    for (const id of STREAM_FEATURES) expect(isFeatureOn(id), id).toBe(false);
    expect(streamingOn()).toBe(false);
    const t = toasts.get().find((x) => x.message.includes('Streaming tools'))!;
    expect(t.action?.label).toBe('Bring them back');
    expect(rememberedChoice(STREAM_OFFER_ID)).toBe('no');
    expect(streamOfferDone()).toBe(true);
    // Bring them back works like it does for everything else.
    act(() => t.action!.run());
    for (const id of STREAM_FEATURES) expect(isFeatureOn(id), id).toBe(true);
    expect(rememberedChoice(STREAM_OFFER_ID)).toBe('yes');
  });

  it('yes (Streaming it live) keeps them all, and notes it', async () => {
    await run('Sketches and cartoons', 'Streaming it live');
    for (const id of STREAM_FEATURES) expect(isFeatureOn(id), id).toBe(true);
    expect(rememberedChoice(STREAM_OFFER_ID)).toBe('yes');
    expect(streamOfferDone()).toBe(true);
    expect(isFeatureOn('audio')).toBe(true);
  });

  it('declining the tuck switch keeps them, and the offer never comes later', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => openOnboarding());
    await act(async () => root.render(<OnboardingSheet />));
    await click(document.querySelector('.ob-next')!);
    await click(card('Sketches and cartoons')!);
    for (let i = 0; i < 3; i++) await click(document.querySelector('.ob-next')!);
    await click(document.querySelector('.ob-tuck [role="switch"]')!);
    await click(document.querySelector<HTMLElement>('.ob-go-list .ob-go:last-child')!);
    for (const id of STREAM_FEATURES) expect(isFeatureOn(id), id).toBe(true);
    expect(streamOfferDone()).toBe(true);
  });

  it('picking nothing leaves everything and leaves the offer for later', async () => {
    await run();
    for (const id of STREAM_FEATURES) expect(isFeatureOn(id), id).toBe(true);
    expect(streamOfferDone()).toBe(false);
  });
});

describe('after answering no, as a non-streamer sees it', () => {
  beforeEach(() => setStreaming(false, { remember: false }));

  it('has no Audience features in View, and no gate commands anywhere', () => {
    expect(viewLabels().join(' ')).not.toContain('Audience');
    expect(viewHas('audience.toggle')).toBe(false);
    for (const id of ['audience.toggle', 'audience.kill', 'audience.show', 'audience.drawing', 'audience.clearQueue']) expect(getCommand(id), id).toBeUndefined();
    // The streaming help that stays is the core: Stream-safe, the OBS link, the capture view, and the audience page that says what it all is.
    expect(allHelp().filter((h) => h.section === 'Streaming').map((h) => h.id).sort()).toEqual(['audience', 'obs-golive', 'stream-capture', 'stream-safe']);
  });

  it('has none of the streaming commands in the palette except the way back', () => {
    const labels = paletteItems().filter((i) => i.kind === 'command' && !i.id.startsWith('features.turnOn.')).map((i) => i.id);
    for (const prefix of ['dares.', 'penmods.', 'votes.', 'promptJar.', 'guess.', 'twitch.', 'streamdoor.', 'streamoverlay.', 'quillreacts.']) expect(labels.filter((l) => l.startsWith(prefix)), prefix).toEqual([]);
    expect(labels).toContain('features.streamingOn');
    // It is listed greyed out, with the reason, rather than missing.
    expect(getCommand('features.streamingOff')!.enabled?.({} as never)).toBe(false);
  });

  it('keeps every streaming feature reachable: a Turn on entry each, help found through them, the group switch and the Features page', async () => {
    const turnOn = new Set(paletteItems().map((i) => i.id));
    for (const id of STREAM_FEATURES) expect(turnOn.has(`features.turnOn.${id}`), id).toBe(true);
    expect(offFeatures().map((f) => f.id)).toEqual(expect.arrayContaining([...STREAM_FEATURES]));
    // Their help is held back, not lost: a search finds it and offers to turn the feature on.
    const held = new Set(hiddenHelp().map((h) => h.feature.id));
    for (const id of STREAM_FEATURES) expect(held.has(id), id).toBe(true);
    const page = document.createElement('div');
    document.body.appendChild(page);
    const r = createRoot(page);
    await act(async () => r.render(<FeaturesPage />));
    expect(page.querySelector<HTMLElement>('[data-testid="streaming-switch"]')!.getAttribute('aria-checked')).toBe('false');
    // Each of the nine still has its own switch inside the folded part.
    for (const id of STREAM_FEATURES) expect(page.querySelector(`[data-testid="feature-switch-${id}"]`), id).toBeTruthy();
    // The page lists the streaming tools as one row, not nine, until it is opened.
    expect(page.querySelector('details')!.hasAttribute('open')).toBe(false);
    await act(async () => void page.querySelector<HTMLElement>('[data-testid="streaming-switch"]')!.click());
    for (const id of STREAM_FEATURES) expect(isFeatureOn(id), id).toBe(true);
    act(() => r.unmount());
    page.remove();
  });

  it('turning them back on restores every command exactly as it was', () => {
    setStreaming(true, { remember: false });
    const before = ids();
    setStreaming(false, { remember: false });
    expect(ids().length).toBeLessThan(before.length - 40);
    setStreaming(true, { remember: false });
    expect(ids()).toEqual(before);
  });

  it('the palette command brings them back, and it can tuck them again', () => {
    const on = getCommand('features.streamingOn')!;
    expect(on.enabled?.({} as never)).toBe(true);
    on.run();
    expect(streamingCount()).toBe(STREAM_FEATURES.length);
    expect(on.enabled?.({} as never)).toBe(false);
    expect(on.reason?.({} as never)).toMatch(/already on/);
    const off = getCommand('features.streamingOff')!;
    off.run();
    expect(streamingOn()).toBe(false);
    expect(off.reason?.({} as never)).toMatch(/already tucked/);
  });

  it('every streaming feature can be switched on one at a time too, the actions door coming with whatever needs it', () => {
    expect(setFeatureOn('quill-reacts', true, { remember: false }).ok).toBe(true);
    expect(isFeatureOn('stream-door')).toBe(true);
    expect(getCommand('audience.toggle')).toBeTruthy();
    expect(viewLabels().join(' ')).toContain('Audience');
  });
});

describe('people who finished the hello before it asked', () => {
  const facts = (o: Partial<OfferFacts> = {}): OfferFacts => ({ onboarded: true, helloThisRun: false, done: false, answered: false, on: 9, total: 9, ...o });

  it('is offered once: due only when everything is on, nothing is answered and the hello is not on this run', () => {
    expect(offerAction(facts())).toBe('ask');
    expect(offerAction(facts({ onboarded: false }))).toBe('wait');
    expect(offerAction(facts({ helloThisRun: true }))).toBe('wait');
    expect(offerAction(facts({ done: true }))).toBe('wait');
  });

  it('is never offered to somebody who has answered, has none left to tuck, or already switched some off themselves', () => {
    expect(offerAction(facts({ answered: true }))).toBe('retire');
    expect(offerAction(facts({ on: 0 }))).toBe('retire');
    expect(offerAction(facts({ on: 6 }))).toBe('retire');
  });

  const ask = (answer: 'yes' | 'no' | null) => {
    let asked = 0;
    setChoiceAsker(async () => {
      asked++;
      return answer ? { value: answer, remember: true } : null;
    });
    return () => asked;
  };

  beforeEach(() => {
    _resetChoicesForTests();
    setPrefs({ onboarded: true });
  });

  it('once: no tucks the streaming tools away and is remembered, and a second look asks nothing', async () => {
    registerStreamOfferChoice();
    const asked = ask('no');
    expect(await considerStreamOffer()).toBe('asked');
    expect(asked()).toBe(1);
    expect(streamingOn()).toBe(false);
    expect(rememberedChoice(STREAM_OFFER_ID)).toBe('no');
    expect(toasts.get().some((t) => t.action?.label === 'Bring them back')).toBe(true);
    expect(await considerStreamOffer()).toBe('waiting');
    expect(asked()).toBe(1);
  });

  it('once: yes changes nothing', async () => {
    registerStreamOfferChoice();
    const asked = ask('yes');
    await considerStreamOffer();
    expect(streamingCount()).toBe(STREAM_FEATURES.length);
    expect(rememberedChoice(STREAM_OFFER_ID)).toBe('yes');
    expect(await considerStreamOffer()).toBe('waiting');
    expect(asked()).toBe(1);
  });

  it('once: closing it is an answer for good, and nothing changes', async () => {
    registerStreamOfferChoice();
    const asked = ask(null);
    await considerStreamOffer();
    expect(streamingCount()).toBe(STREAM_FEATURES.length);
    expect(streamOfferDone()).toBe(true);
    expect(await considerStreamOffer()).toBe('waiting');
    expect(asked()).toBe(1);
  });

  it('waits while a dialog is open, and does not mark itself done', async () => {
    registerStreamOfferChoice();
    // No asker at all (before the sheet is mounted): nothing can be asked yet.
    expect(await considerStreamOffer(40)).toBe('waiting');
    expect(streamOfferDone()).toBe(false);
  });

  it('is changeable later in Preferences: no tucks, yes brings them back', () => {
    setChoice(STREAM_OFFER_ID, 'no');
    expect(streamingOn()).toBe(false);
    setChoice(STREAM_OFFER_ID, 'yes');
    expect(streamingCount()).toBe(STREAM_FEATURES.length);
  });

  it('noteHelloAnswer does nothing for a hello with no picks', () => {
    noteHelloAnswer({ picked: false, answered: false });
    expect(streamOfferDone()).toBe(false);
    markStreamOfferDone();
    expect(getPrefs().onboarded).toBe(true);
  });
});
