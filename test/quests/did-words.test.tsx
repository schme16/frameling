// @vitest-environment jsdom
// What Quill says on the Great work card: a line for every step that is followed by another one (the last step is
// followed by the badge card instead), kept in lines.json so it can be edited with the rest of his words.
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
import { resetStore } from '../../src/core/store';
import { didLineId, didWords } from '../../src/quests/did';
import { clearPraise, feedback } from '../../src/quests/feedback';
import { QuestBar } from '../../src/quests/QuestBar';
import { allQuests, getFullQuest, loadQuests } from '../../src/quests/registry';
import { engine } from '../../src/quests/runtime';
import { lineIds } from '../../src/ui/mascot/lines';
import { vectorDoc } from './helpers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('../../src/quests/QuestLayer', () => ({ mountQuestLayer: () => {} }));

describe("Quill's words for each step", () => {
  it('has a line for every step that another step follows, and no line for a step that is gone', async () => {
    await loadQuests();
    const want: string[] = [];
    for (const info of allQuests()) {
      const q = getFullQuest(info.id)!;
      for (const s of q.steps.slice(0, -1)) want.push(didLineId(q.id, s.id));
    }
    expect(want.length).toBeGreaterThan(50);
    const have = (lineIds() as string[]).filter((id) => id.startsWith('quests.did.'));
    expect(want.filter((id) => !have.includes(id))).toEqual([]);
    expect(have.filter((id) => !want.includes(id))).toEqual([]);
  });

  it('are sentences about what you did, with no long dashes', async () => {
    await loadQuests();
    for (const info of allQuests()) {
      for (const s of getFullQuest(info.id)!.steps.slice(0, -1)) {
        const words = didWords(info.id, s.id)!;
        expect(words, `${info.id}.${s.id}`).toMatch(/^You /);
        expect(words).not.toMatch(/—|–/);
        expect(words.length).toBeLessThan(140);
      }
    }
  });

  it('is undefined for a step it knows nothing about', () => {
    expect(didWords('no-such-quest', 'x')).toBeUndefined();
  });
});

describe('the Great work card', () => {
  let root: Root;
  let host: HTMLElement;
  beforeEach(() => {
    resetStore(vectorDoc());
    engine.resetAll();
    feedback.set((f) => ({ ...f, praise: null }));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<QuestBar />));
  });
  afterEach(() => {
    act(() => engine.stop());
    act(() => root.unmount());
    host.remove();
  });

  it('says what you just did in Quill\'s words, and keeps them until Next', async () => {
    expect(engine.start('first-animation')).toBe(true);
    await act(async () => void (await engine.showMe()));
    expect(feedback.get().praise?.did).toBe(didWords('first-animation', 'draw'));
    expect(host.querySelector('.qb-say')?.textContent).toContain(didWords('first-animation', 'draw')!);
    expect(host.querySelector('.qb-say')?.textContent).not.toContain('step 1 of');
    act(() => clearPraise());
    expect(host.querySelector('.qb-card')).toBeNull();
  });
});
