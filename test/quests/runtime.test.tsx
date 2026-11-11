// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import '../../src/timeline';
import '../../src/quests';
import { allHelp, getCommand, getPanel, registerCommand } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { celebrate, dismissCelebration, feedback } from '../../src/quests/feedback';
import { Celebration } from '../../src/quests/Celebration';
import { QuestBar } from '../../src/quests/QuestBar';
import { QuestsPanel } from '../../src/quests/QuestsPanel';
import { Spotlight } from '../../src/quests/Spotlight';
import { allQuests, getQuest, questProgress, registerQuest, startQuest } from '../../src/quests/registry';
import { engine, playQuest, putDownQuest, resumeQuest } from '../../src/quests/runtime';
import { QUESTS_KEY } from '../../src/quests/engine';
import { resolveTarget } from '../../src/quests/target';
import type { Quest } from '../../src/quests/types';
import { resetPrefs, setPrefs } from '../../src/ui/prefs';
import { vectorDoc } from './helpers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The real layer would render alongside the components under test and update outside act(). It has its own test.
vi.mock('../../src/quests/QuestLayer', () => ({ mountQuestLayer: () => {} }));

let root: Root;
let host: HTMLElement;

const testQuest: Quest = {
  id: 'test-quest',
  title: 'Test quest',
  summary: 'for the tests',
  minutes: 1,
  icon: 'sparkle',
  badge: { id: 'tq', name: 'Tester', icon: 'check', color: '--mint' },
  finish: 'Well done, tester.',
  requires: ['first-animation'],
  steps: [
    { id: 'one', say: 'Run the test command.', target: '#goal', done: (c) => c.ran.has('test.cmd'), show: 'test.cmd', hint: 'Try the command.', help: 'quests' },
    { id: 'two', say: 'Move to frame 3.', done: (c) => c.state.ui.frame === 2 },
  ],
};

beforeAll(() => {
  registerQuest(testQuest);
});

beforeEach(() => {
  resetStore(vectorDoc());
  resetPrefs();
  engine.resetAll();
  dismissCelebration();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  engine.stop();
  document.getElementById('goal')?.remove();
});

const mount = (el: React.ReactNode) => act(() => root.render(el));
const text = () => host.textContent ?? '';
const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as HTMLButtonElement;

describe('how quests are wired in', () => {
  it('registers the panel, the commands and the help topic', () => {
    expect(getPanel('quests')).toMatchObject({ zone: 'right', title: 'Quests' });
    for (const id of ['quests.open', 'quests.resume']) expect(getCommand(id)).toBeTruthy();
    const topic = allHelp().filter((t) => t.id === 'quests');
    expect(topic).toHaveLength(1);
    expect(topic[0].body).toContain('Show me');
    expect(topic[0].body).not.toMatch(/—/);
  });

  it('keeps the names the UI shell and welcome sheet import', async () => {
    const ui = await import('../../src/ui/quests');
    expect(ui.getQuest('first-animation')).toBe(getQuest('first-animation'));
    expect(ui.allQuests()[0].id).toBe('first-animation');
    expect(ui.startQuest('nope')).toBe(false);
    expect(ui.startQuest('first-animation')).toBe(true);
    expect(ui.questProgress.get().active).toBe('first-animation');
  });

  it('quests.resume is only enabled when something was put down', () => {
    const cmd = getCommand('quests.resume')!;
    expect(cmd.enabled!(resetStore().get())).toBe(false);
    playQuest('first-animation');
    putDownQuest();
    expect(cmd.enabled!(resetStore().get())).toBe(true);
  });
});

describe('the command-run hook, end to end', () => {
  it('watches commands while a quest plays and lets go afterwards', () => {
    const body = vi.fn();
    registerCommand({ id: 'test.cmd', label: 'Test', category: 'Test', run: body });
    const original = getCommand('test.cmd')!.run;
    expect(startQuest('test-quest')).toBe(true);
    expect(engine.current()?.step.id).toBe('one');
    expect(getCommand('test.cmd')!.run).not.toBe(original);
    getCommand('test.cmd')!.run();
    expect(body).toHaveBeenCalledOnce();
    expect(engine.current()?.step.id).toBe('two');
    putDownQuest();
    expect(getCommand('test.cmd')!.run).toBe(original);
  });

  it('wraps a command registered after the quest started', async () => {
    vi.useFakeTimers();
    try {
      startQuest('test-quest');
      registerCommand({ id: 'test.cmd', label: 'Test', category: 'Test', run: () => {} });
      await vi.advanceTimersByTimeAsync(600);
      getCommand('test.cmd')!.run();
      expect(engine.current()?.step.id).toBe('two');
    } finally {
      engine.stop();
      vi.useRealTimers();
    }
  });
});

describe('finishing, celebrating and resuming', () => {
  it('celebrates with confetti, or a still badge when motion is turned down', () => {
    registerCommand({ id: 'test.cmd', label: 'Test', category: 'Test', run: () => {} });
    const finish = () => {
      startQuest('test-quest');
      getCommand('test.cmd')!.run();
      store().setUi({ frame: 2 });
    };
    finish();
    expect(questProgress.get().badges).toContain('tq');
    expect(feedback.get().celebration).toMatchObject({ still: false, badge: { name: 'Tester' } });
    mount(<Celebration />);
    expect(host.querySelectorAll('.qc-confetti i').length).toBeGreaterThan(10);
    expect(text()).toContain('You earned Tester');
    expect(text()).toContain('Well done, tester.');
    dismissCelebration();
    setPrefs({ reduceMotion: true });
    finish();
    expect(feedback.get().celebration?.still).toBe(true);
    mount(<Celebration />);
    expect(host.querySelector('.qc-confetti')).toBeNull();
    expect(host.querySelector('.qc')?.className).toContain('qc-still');
  });

  it('offers the next open quest on the card and Esc puts it away', () => {
    const q = getQuest('first-animation')!;
    act(() => questProgress.set((p) => ({ ...p, completed: ['first-animation'] })));
    celebrate(q, q.badge!, true);
    mount(<Celebration />);
    const next = button('Next:');
    expect(next).toBeTruthy();
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(feedback.get().celebration).toBeNull();
  });

  it('puts a quest down, remembers it across a restart, and resumes where it was', () => {
    registerCommand({ id: 'test.cmd', label: 'Test', category: 'Test', run: () => {} });
    startQuest('test-quest');
    getCommand('test.cmd')!.run();
    putDownQuest();
    expect(questProgress.get()).toMatchObject({ active: null, paused: { id: 'test-quest', step: 1 } });
    expect(JSON.parse(localStorage.getItem(QUESTS_KEY)!).paused).toEqual({ id: 'test-quest', step: 1 });
    expect(resumeQuest()).toBe(true);
    expect(engine.current()?.step.id).toBe('two');
  });

  it('starts a quest that does not suit the open drawing again from the top', () => {
    const bb = getQuest('bouncing-ball')!;
    engine.start('bouncing-ball', { step: 3 });
    putDownQuest();
    resetStore(vectorDoc());
    expect(bb.ready!(resetStore(vectorDoc()).get())).toBe(false);
    expect(resumeQuest()).toBe(true);
    expect(questProgress.get()).toMatchObject({ active: 'bouncing-ball', step: 0 });
  });

  it('has nothing to resume at first', () => {
    expect(resumeQuest()).toBe(false);
  });
});

describe('the quest bar', () => {
  it('shows the step, the dots, and Show me / Skip that work', () => {
    const body = vi.fn();
    registerCommand({ id: 'test.cmd', label: 'Test', category: 'Test', run: body });
    startQuest('test-quest');
    mount(<QuestBar />);
    expect(text()).toContain('Test quest');
    expect(text()).toContain('Step 1 of 2');
    expect(text()).toContain('Run the test command.');
    expect(host.querySelectorAll('.qb-dots i')).toHaveLength(2);
    act(() => button('Show me').click());
    expect(body).toHaveBeenCalledOnce();
    expect(text()).toContain('Step 2 of 2');
    expect(host.querySelector('.qb-dots i.is-done')).toBeTruthy();
    act(() => button('Not now').click());
    expect(questProgress.get().active).toBeNull();
    expect(host.textContent).toBe('');
  });

  it('says a quiet hint only after a quiet spell', () => {
    startQuest('test-quest');
    mount(<QuestBar />);
    expect(host.querySelector('.qb-hint')).toBeNull();
    act(() => questProgress.set((p) => ({ ...p, hint: true })));
    expect(host.querySelector('.qb-hint')?.textContent).toContain('Try the command.');
  });

  it('the cross puts the quest down, and Skip moves on', () => {
    startQuest('test-quest');
    mount(<QuestBar />);
    act(() => button('Skip').click());
    expect(questProgress.get().step).toBe(1);
    act(() => (host.querySelector('.qb-x') as HTMLButtonElement).click());
    expect(questProgress.get().paused).toMatchObject({ id: 'test-quest', step: 1 });
  });

  it('shows nothing when no quest is playing', () => {
    mount(<QuestBar />);
    expect(host.textContent).toBe('');
  });
});

describe('the spotlight', () => {
  it('finds the first target that is showing', () => {
    const a = document.createElement('div');
    a.id = 'goal';
    document.body.appendChild(a);
    const b = document.createElement('div');
    b.className = 'second';
    document.body.appendChild(b);
    const shown = (el: Element) => el === b;
    expect(resolveTarget('#goal', shown)).toBeNull();
    expect(resolveTarget(['#goal', '.second'], shown)).toBe(b);
    expect(resolveTarget(() => b, shown)).toBe(b);
    expect(resolveTarget(() => null, shown)).toBeNull();
    expect(resolveTarget('((bad', shown)).toBeNull();
    expect(resolveTarget(undefined, shown)).toBeNull();
    b.remove();
  });

  it('draws a ring that lets clicks through, around the target', () => {
    const goal = document.createElement('div');
    goal.id = 'goal';
    goal.getBoundingClientRect = () => ({ left: 100, top: 50, width: 80, height: 40, right: 180, bottom: 90, x: 100, y: 50, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(goal);
    startQuest('test-quest');
    mount(<Spotlight />);
    const ring = host.querySelector('.qs-ring') as HTMLElement;
    expect(ring).toBeTruthy();
    expect(ring.style.left).toBe('95px');
    expect(ring.style.width).toBe('90px');
    expect(ring.getAttribute('aria-hidden')).toBe('true');
    // pointer-events: none is in the stylesheet; make sure the ring has no handlers or tabindex that could take focus.
    expect(ring.getAttribute('tabindex')).toBeNull();
  });

  it('shows no ring when the target is not on screen', () => {
    startQuest('test-quest');
    mount(<Spotlight />);
    expect(host.querySelector('.qs-ring')).toBeNull();
  });
});

describe('the Quests panel', () => {
  it('lists every quest, with the later ones locked until the first is done', () => {
    mount(<QuestsPanel />);
    expect(host.querySelectorAll('.qp-card')).toHaveLength(allQuests().length);
    expect(text()).toContain('0 of 8 badges');
    expect(host.querySelectorAll('.qp-card.is-locked').length).toBe(allQuests().length - 1);
    expect(text()).toContain('Locked. Do "Your first animation in 60 seconds" first.');
    expect(button('Try it anyway')).toBeTruthy();
  });

  it('unlocks the others and shows the badge once the first quest is done', () => {
    act(() => questProgress.set((p) => ({ ...p, completed: ['first-animation'], badges: ['flipbooker'] })));
    mount(<QuestsPanel />);
    expect(host.querySelectorAll('.qp-card.is-locked')).toHaveLength(0);
    expect(host.querySelector('.qp-card.is-done')?.textContent).toContain('Flipbooker');
    expect(host.querySelectorAll('.qm:not(.qm-empty)')).toHaveLength(1);
    expect(text()).toContain('1 of 8 badges');
  });

  it('continues a paused quest and starts a quest from its button', () => {
    act(() => questProgress.set((p) => ({ ...p, paused: { id: 'first-animation', step: 1 } })));
    mount(<QuestsPanel />);
    expect(text()).toContain('Put down at step 2 of 4');
    act(() => button('Continue').click());
    expect(questProgress.get().active).toBe('first-animation');
  });
});
