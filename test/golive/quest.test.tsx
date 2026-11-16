// @vitest-environment jsdom
// The Go live quest in the real app: it is for streamers, it asks audience features' own questions instead of
// deferring them, every step waits for something to really happen, and every other way in agrees with it.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import '../../src/timeline';
import '../../src/export';
import '../../src/artboards';
import '../../src/pixel';
import '../../src/renderer/features';
import '../../src/quests';
import { canAsk, currentChoice, forgetAnswers, registerChoice, setChoiceAsker } from '../../src/core/choices';
import { getCommand, getHelp } from '../../src/core/registry';
import { resetStore } from '../../src/core/store';
import { setStreamSafe } from '../../src/core/streamSafe';
import { audience, installAudience } from '../../src/audience';
import { hasStreamMark, noteStreamMark, resetStreamMarks } from '../../src/features/streamMarks';
import { setStreaming } from '../../src/features/streamFamily';
import { StreamingPage } from '../../src/features/StreamingPage';
import { planFor } from '../../src/ui/onboarding/flow';
import { resolveMenus } from '../../src/ui/menus';
import { GO_LIVE_QUEST, snapshot } from '../../src/golive/quest';
import { QUESTS } from '../../src/quests/library';
import { engine } from '../../src/quests/runtime';
import { allQuests, getFullQuest, questProgress, setStarter, startQuest } from '../../src/quests/registry';
import { copyAddress } from '../../src/streamdoor/copy';
import { saveFirebotSetup } from '../../src/streamdoor/firebotFile';
import { doorStatus } from '../../src/streamdoor/state';
import { startOverlayTest, overlayTest } from '../../src/streamoverlay/sources';
import { twitchStatus } from '../../src/twitch/state';
import { signedOutStatus } from '../../src/shared/twitch';
import { questWord } from '../../src/words/quests';
import { didWords } from '../../src/quests/did';
import { vectorDoc } from '../quests/helpers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('../../src/quests/QuestLayer', () => ({ mountQuestLayer: () => {} }));

installAudience();

const stepId = () => GO_LIVE_QUEST.steps[questProgress.get().step]?.id;
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

beforeEach(() => {
  localStorage.clear();
  resetStore(vectorDoc());
  engine.resetAll();
  resetStreamMarks();
  audience.kill();
  setStreamSafe(false);
  twitchStatus.set(signedOutStatus());
  setStreaming(true, { remember: false });
});
afterEach(() => {
  engine.stop();
  setChoiceAsker(null);
  setStarter(null);
  vi.restoreAllMocks();
});

describe('the Go live quest', () => {
  it('is in the library with a badge, a start and every step worded', () => {
    expect(getFullQuest('go-live')).toBe(GO_LIVE_QUEST);
    expect(GO_LIVE_QUEST.badge?.name).toBe('Showrunner');
    expect(GO_LIVE_QUEST.steps.map((s) => s.id)).toEqual(['audience', 'door', 'obs', 'safe', 'twitch', 'overlay', 'test']);
    for (const s of GO_LIVE_QUEST.steps) {
      expect(s.say, s.id).not.toMatch(/—|–/);
      expect(s.why, s.id).toBeTruthy();
      expect(s.hint, s.id).toBeTruthy();
      expect(typeof s.done, s.id).toBe('function');
      expect(s.help && getHelp(s.help), `${s.id} help ${s.help}`).toBeTruthy();
    }
  });

  it('is only offered while the streaming tools are on, so a person who said they do not stream never sees it', () => {
    expect(allQuests().map((q) => q.id)).toContain('go-live');
    setStreaming(false, { remember: false });
    expect(allQuests().map((q) => q.id)).not.toContain('go-live');
    expect(startQuest('go-live')).toBe(false);
  });

  it('never asks audience features\' questions twice: they are asked in the quest, everything else waits', async () => {
    forgetAnswers(['audience.strictness', 'audience.view']);
    registerChoice({ id: 'test.other', title: 'Other', question: 'Other?', category: 'Test', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], default: 'a' });
    const asked: string[] = [];
    setChoiceAsker(async (def) => (asked.push(def.id), { value: def.id === 'audience.view' ? 'capture' : 'strict', remember: true }));
    expect(engine.start('go-live')).toBe(true);
    expect(canAsk('audience.strictness')).toBe(true);
    expect(canAsk('audience.view')).toBe(true);
    expect(canAsk('test.other')).toBe(false);
    await getCommand('audience.toggle')!.run();
    await settle();
    expect(asked).toEqual(['audience.strictness', 'audience.view']);
    expect(currentChoice('audience.strictness')).toBe('strict');
    expect(audience.isOn()).toBe(true);
    // Switched on again later: remembered, so nothing is asked.
    audience.setOn(false);
    await getCommand('audience.toggle')!.run();
    await settle();
    expect(asked).toEqual(['audience.strictness', 'audience.view']);
  });

  it('puts every question back to waiting for another quest', () => {
    registerChoice({ id: 'test.other', title: 'Other', question: 'Other?', category: 'Test', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], default: 'a' });
    setChoiceAsker(async () => null);
    expect(canAsk('test.other')).toBe(true);
    engine.start('go-live');
    expect(canAsk('test.other')).toBe(false);
    engine.stop();
    expect(canAsk('test.other')).toBe(true);
    engine.start('first-animation');
    expect(canAsk('audience.strictness')).toBe(false);
  });

  it('waits for each thing to really happen, and finishes with the badge', () => {
    engine.start('go-live');
    expect(stepId()).toBe('audience');
    // Nothing has happened yet, however long it waits.
    engine.tick();
    expect(stepId()).toBe('audience');
    act(() => audience.setOn(true));
    engine.tick();
    expect(stepId()).toBe('door');
    // A switch alone is not the door: something has to be saved or copied.
    engine.tick();
    expect(stepId()).toBe('door');
    noteStreamMark('setupFile');
    engine.tick();
    expect(stepId()).toBe('obs');
    // No OBS here: skipping is allowed, and nothing is counted as done for it.
    engine.skip();
    expect(stepId()).toBe('safe');
    setStreamSafe(true);
    engine.tick();
    expect(stepId()).toBe('twitch');
    twitchStatus.set({ ...signedOutStatus(), state: 'signed-in', login: 'quillfan' });
    engine.tick();
    expect(stepId()).toBe('overlay');
    noteStreamMark('overlayAddress');
    engine.tick();
    expect(stepId()).toBe('test');
    expect(questProgress.get().active).toBe('go-live');
    noteStreamMark('overlayTest');
    engine.tick();
    expect(questProgress.get()).toMatchObject({ active: null, completed: ['go-live'], badges: ['showrunner'] });
    expect(questProgress.get().done['go-live']).not.toContain('obs');
  });

  it('counts only what is done during the quest: an old copy does not skip a step', () => {
    noteStreamMark('overlayAddress');
    noteStreamMark('doorAddress');
    engine.start('go-live');
    expect(hasStreamMark('overlayAddress')).toBe(false);
    expect(snapshot().doorAddressCopied).toBe(false);
  });

  it('has Quill\'s words for every step but the last', () => {
    for (const s of GO_LIVE_QUEST.steps.slice(0, -1)) expect(didWords('go-live', s.id), s.id).toMatch(/^You /);
    expect(didWords('go-live', 'test')).toBeUndefined();
    expect(questWord('quest.go-live.finish')).toMatch(/Ctrl\+Alt\+I/);
  });

  it('is in the streaming group of the Quests panel', async () => {
    const { questGroupOf } = await import('../../src/quests/groups');
    expect(questGroupOf(GO_LIVE_QUEST)).toBe('streaming');
    expect(QUESTS.at(-1)).toBe(GO_LIVE_QUEST);
  });
});

describe('what the quest checks really happens', () => {
  it('remembers a copied door address', async () => {
    const write = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    doorStatus.set({ ...doorStatus.get(), running: true, address: 'http://127.0.0.1:47213' });
    expect(await copyAddress()).toBe(true);
    expect(hasStreamMark('doorAddress')).toBe(true);
  });

  it('does not remember a copy that failed', async () => {
    doorStatus.set({ ...doorStatus.get(), running: false, address: '' });
    expect(await copyAddress()).toBe(false);
    expect(hasStreamMark('doorAddress')).toBe(false);
  });

  it('remembers the Firebot file once it is saved, and not before', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(hasStreamMark('setupFile')).toBe(false);
    expect(await saveFirebotSetup()).toBe('saved');
    expect(hasStreamMark('setupFile')).toBe(true);
  });

  it('remembers the overlay test the moment it is pressed', () => {
    startOverlayTest();
    expect(hasStreamMark('overlayTest')).toBe(true);
    expect(overlayTest.get()).not.toBeNull();
  });
});

describe('every other way in agrees with the quest', () => {
  it('has a palette command and a Streaming menu entry', () => {
    const c = getCommand('audience.walk')!;
    expect(c.label).toBe('Walk me through going live');
    expect(c.category).toBe('Audience');
    expect(getHelp(c.help!)).toBeTruthy();
    expect(JSON.stringify(resolveMenus())).toContain('"audience.walk"');
  });

  it('starts the quest from the command, and says why when it cannot', () => {
    const started: string[] = [];
    setStarter((id) => (started.push(id), true));
    getCommand('audience.walk')!.run();
    expect(started).toEqual(['go-live']);
  });

  it('has a Walk me through it button on the Streaming page beside Show me how', () => {
    const started: string[] = [];
    setStarter((id) => (started.push(id), true));
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root: Root = createRoot(host);
    act(() => root.render(<StreamingPage sharing={null} />));
    expect(host.querySelector('[data-testid="streaming-start-help"]')).toBeTruthy();
    act(() => (host.querySelector('[data-testid="streaming-start-quest"]') as HTMLElement).click());
    expect(started).toEqual(['go-live']);
    act(() => root.unmount());
    host.remove();
  });

  it('is the help route\'s guided version, and the help says so', async () => {
    const { helpBody, loadHelpBodies } = await import('../../src/core/registry');
    await loadHelpBodies();
    const body = helpBody(getHelp('viewers-take-part')!);
    expect(body).toContain('Walk me through it');
    expect(body).not.toMatch(/—/);
  });

  it('is offered to a streamer once the first animation is done, and never to somebody who did not say they stream', () => {
    expect(planFor(['stream'], ['first-animation']).quest).toBe('go-live');
    expect(planFor(['cartoons', 'stream'], ['first-animation']).quest).toBe('go-live');
    expect(planFor(['stream'], ['first-animation', 'go-live']).quest).toBe('fill-it-in');
    expect(planFor(['cartoons'], ['first-animation']).quest).toBe('bouncing-ball');
    expect(planFor(['stream']).quest).toBe('first-animation');
  });
});
