import { describe, expect, it, vi } from 'vitest';
import { QUESTS_KEY } from '../../src/quests/engine';
import { hasInkAt } from '../../src/quests/predicates';
import type { Quest, QuestEvent } from '../../src/quests/types';
import { memoryStorage, putShapes, ring, rig, stroke } from './helpers';

const badge = { id: 'b', name: 'Test Badge', icon: 'sparkle', color: '--sunny' };

/** Draw -> go to frame 2 -> play. Small, but touches the store, the frame and a command. */
function trio(extra: Partial<Quest> = {}): Quest {
  return {
    id: 'trio',
    title: 'Trio',
    summary: 'three steps',
    minutes: 1,
    icon: 'sparkle',
    badge,
    steps: [
      { id: 'draw', say: 'draw', done: (c) => hasInkAt(c.state.doc, 0), hint: 'use the brush', hintAfter: 10 },
      { id: 'frame', say: 'move on', done: (c) => c.state.ui.frame === 1 },
      { id: 'play', say: 'play', done: (c) => c.state.ui.playing, show: 'timeline.play' },
    ],
    ...extra,
  };
}

const draw = (r: ReturnType<typeof rig>) =>
  r.store.update('Draw stroke', (d) => {
    putShapes(d as never, d.layers[0] as never, 0, [stroke(ring())]);
  });

describe('step progression', () => {
  it('starts on the first step and ticks steps off from store changes', () => {
    const r = rig([trio()]);
    expect(r.engine.start('trio')).toBe(true);
    expect(r.progress.get()).toMatchObject({ active: 'trio', step: 0 });
    draw(r);
    expect(r.progress.get().step).toBe(1);
    expect(r.progress.get().done.trio).toEqual(['draw']);
    r.store.setUi({ frame: 1 });
    expect(r.progress.get().step).toBe(2);
    r.store.setUi({ playing: true });
    expect(r.progress.get()).toMatchObject({ active: null, completed: ['trio'], badges: ['b'] });
  });

  it('does not tick a step off for a change that is not the one asked for', () => {
    const r = rig([trio()]);
    r.engine.start('trio');
    r.store.setUi({ frame: 1 });
    r.store.setUi({ zoom: 2 });
    expect(r.progress.get().step).toBe(0);
  });

  it('carries on down the list when the next steps are already true', () => {
    const r = rig([trio()]);
    draw(r);
    r.store.setUi({ frame: 1 });
    r.engine.start('trio');
    expect(r.progress.get()).toMatchObject({ active: 'trio', step: 2 });
  });

  it('says what it is doing through events', () => {
    const r = rig([trio()]);
    const seen: string[] = [];
    r.engine.on((e: QuestEvent) => seen.push(e.kind === 'step' ? `step:${e.step.id}${e.skipped ? ':skipped' : ''}` : e.kind));
    r.engine.start('trio');
    draw(r);
    r.engine.skip();
    r.store.setUi({ playing: true });
    expect(seen).toEqual(['start', 'step:draw', 'step:frame:skipped', 'step:play', 'finish']);
  });

  it('refuses a quest that does not exist or has no steps', () => {
    const r = rig([trio({ steps: [] })]);
    expect(r.engine.start('nope')).toBe(false);
    expect(r.engine.start('trio')).toBe(false);
  });

  it('sees edits by their undo label, and ignores an undo', () => {
    const quest: Quest = { ...trio(), steps: [{ id: 'fill', say: 'fill', done: (c) => c.edits.includes('Fill') }, { id: 'end', say: 'end', done: () => false }] };
    const r = rig([quest]);
    r.engine.start('trio');
    draw(r);
    r.store.undo();
    expect(r.progress.get().step).toBe(0);
    r.store.update('Fill', (d) => void (d.name = 'x'));
    expect(r.progress.get().step).toBe(1);
  });

  it('remembers which frames the playhead visited during a step', () => {
    const quest: Quest = { ...trio(), steps: [{ id: 'scrub', say: 'scrub', done: (c) => c.frames.size >= 3 }, { id: 'end', say: 'end', done: () => false }] };
    const r = rig([quest]);
    r.engine.start('trio');
    r.store.setUi({ frame: 1 });
    r.store.setUi({ frame: 1 });
    expect(r.progress.get().step).toBe(0);
    r.store.setUi({ frame: 5 });
    expect(r.progress.get().step).toBe(1);
  });

  it('compares with how things stood when the step began, and runs enter before taking that snapshot', () => {
    const r = rig([
      {
        ...trio(),
        steps: [
          { id: 'onion', say: 'onion', enter: () => r.store.setUi((ui) => ({ onion: { ...ui.onion, enabled: true } })), done: (c) => c.state.ui.onion.enabled !== c.entry.state.ui.onion.enabled },
          { id: 'end', say: 'end', done: () => false },
        ],
      },
    ]);
    r.engine.start('trio');
    // enter() turned onion on, which must not count as the person doing it.
    expect(r.progress.get().step).toBe(0);
    r.store.setUi((ui) => ({ onion: { ...ui.onion, enabled: false } }));
    expect(r.progress.get().step).toBe(1);
  });

  it('reads the probe for things that are not in the store', () => {
    const quest: Quest = { ...trio(), steps: [{ id: 'gif', say: 'gif', done: (c) => c.probe.exportOpen && c.probe.exportFormat === 'gif' }, { id: 'end', say: 'end', done: () => false }] };
    const r = rig([quest]);
    r.engine.start('trio');
    r.probe.value = { fillGap: null, exportOpen: true, exportFormat: 'mp4' };
    r.engine.tick();
    expect(r.progress.get().step).toBe(0);
    r.probe.value = { fillGap: null, exportOpen: true, exportFormat: 'gif' };
    r.engine.tick();
    expect(r.progress.get().step).toBe(1);
  });

  it('survives a step whose check throws', () => {
    const quest: Quest = { ...trio(), steps: [{ id: 'bad', say: 'bad', done: () => { throw new Error('boom'); } }, { id: 'end', say: 'end', done: () => false }] };
    const r = rig([quest]);
    r.engine.start('trio');
    expect(() => r.store.setUi({ frame: 3 })).not.toThrow();
    expect(r.progress.get().step).toBe(0);
  });

  it('stops listening once the quest is put down', () => {
    const check = vi.fn(() => false);
    const r = rig([trio({ steps: [{ id: 'a', say: 'a', done: check }] })]);
    r.engine.start('trio');
    r.store.setUi({ frame: 4 });
    expect(check).toHaveBeenCalled();
    r.engine.stop();
    check.mockClear();
    r.store.setUi({ frame: 5 });
    r.engine.tick();
    expect(check).not.toHaveBeenCalled();
  });
});

describe('the command-run hook, as the engine sees it', () => {
  it('counts a command that ran, for steps that are about doing rather than a result', () => {
    const quest: Quest = { ...trio(), steps: [{ id: 'hold', say: 'hold', done: (c) => c.ran.has('timeline.hold2') }, { id: 'end', say: 'end', done: () => false }] };
    const r = rig([quest]);
    r.engine.start('trio');
    r.engine.noteCommand('timeline.hold3');
    expect(r.progress.get().step).toBe(0);
    r.engine.noteCommand('timeline.hold2');
    expect(r.progress.get().step).toBe(1);
  });

  it('forgets commands from an earlier step', () => {
    const quest: Quest = {
      ...trio(),
      steps: [
        { id: 'a', say: 'a', done: (c) => c.state.ui.frame === 1 },
        { id: 'b', say: 'b', done: (c) => c.ran.has('x.y') },
        { id: 'end', say: 'end', done: () => false },
      ],
    };
    const r = rig([quest]);
    r.engine.start('trio');
    r.engine.noteCommand('x.y');
    r.store.setUi({ frame: 1 });
    expect(r.progress.get().step).toBe(1);
  });
});

describe('skipping', () => {
  it('moves on without counting the step as done', () => {
    const r = rig([trio()]);
    r.engine.start('trio');
    r.engine.skip();
    expect(r.progress.get().step).toBe(1);
    expect(r.progress.get().done.trio ?? []).toEqual([]);
  });

  it('leaves the quest, with no badge, when the last step is skipped', () => {
    const r = rig([trio()]);
    r.engine.start('trio');
    r.engine.skip();
    r.engine.skip();
    r.engine.skip();
    const p = r.progress.get();
    expect(p.active).toBeNull();
    expect(p.paused).toBeNull();
    expect(p.badges).toEqual([]);
    expect(p.completed).toEqual([]);
  });

  it('advances a step that has no check of its own with next()', () => {
    const r = rig([trio({ steps: [{ id: 'read', say: 'read this' }, { id: 'end', say: 'end', done: () => false }] })]);
    r.engine.start('trio');
    r.store.setUi({ frame: 2 });
    expect(r.progress.get().step).toBe(0);
    r.engine.next();
    expect(r.progress.get().step).toBe(1);
  });
});

describe('show me', () => {
  it('runs a command by id, and the step can finish from what that did', async () => {
    const r = rig([trio()]);
    r.engine.start('trio');
    draw(r);
    r.store.setUi({ frame: 1 });
    await r.engine.showMe();
    expect(r.ran).toEqual(['timeline.play']);
  });

  it('runs a function, waits for it and then looks again', async () => {
    const quest: Quest = {
      ...trio(),
      steps: [{ id: 'a', say: 'a', done: (c) => c.state.ui.frame === 3, show: async () => { await Promise.resolve(); r.store.setUi({ frame: 3 }); } }, { id: 'end', say: 'end', done: () => false }],
    };
    const r = rig([quest]);
    r.engine.start('trio');
    await r.engine.showMe();
    expect(r.progress.get().step).toBe(1);
  });
});

describe('the quiet hint', () => {
  it('appears after a while of nothing, and goes away on activity', () => {
    const r = rig([trio()]);
    r.engine.start('trio');
    r.clock.advance(9000);
    r.engine.tick();
    expect(r.progress.get().hint).toBe(false);
    r.clock.advance(2000);
    r.engine.tick();
    expect(r.progress.get().hint).toBe(true);
    r.store.setUi({ zoom: 2 });
    expect(r.progress.get().hint).toBe(false);
    r.engine.tick();
    expect(r.progress.get().hint).toBe(false);
  });

  it('never shows for a step without a hint, and clears when the step changes', () => {
    const r = rig([trio()]);
    r.engine.start('trio');
    r.clock.advance(60000);
    r.engine.tick();
    expect(r.progress.get().hint).toBe(true);
    draw(r);
    expect(r.progress.get().hint).toBe(false);
    r.clock.advance(60000);
    r.engine.tick();
    expect(r.progress.get().hint).toBe(false);
  });
});

describe('persistence', () => {
  it('saves finished quests and badges', () => {
    const r = rig([trio()]);
    r.engine.start('trio');
    draw(r);
    r.store.setUi({ frame: 1 });
    r.store.setUi({ playing: true });
    const saved = JSON.parse(r.storage.data.get(QUESTS_KEY)!);
    expect(saved).toMatchObject({ v: 1, completed: ['trio'], badges: ['b'], paused: null });
  });

  it('brings them back in a new session, with a quest in progress waiting to be resumed', () => {
    const first = rig([trio()]);
    first.engine.start('trio');
    draw(first);
    const again = rig([trio()], undefined, first.storage);
    expect(again.progress.get()).toMatchObject({ active: null, paused: { id: 'trio', step: 1 }, completed: [], badges: [] });
    expect(again.engine.current()).toBeNull();
  });

  it('copes with storage that is missing, throws or holds junk', () => {
    const throwing = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('full'); } };
    const r = rig([trio()], undefined, throwing as never);
    expect(() => r.engine.start('trio')).not.toThrow();
    for (const junk of ['{', '[]', '{"completed":"x","badges":3,"paused":{"id":5}}', 'null']) {
      const j = rig([trio()], undefined, memoryStorage({ [QUESTS_KEY]: junk }));
      expect(j.progress.get()).toMatchObject({ active: null, completed: expect.any(Array), badges: expect.any(Array) });
    }
  });
});

describe('putting a quest down and resuming', () => {
  it('stop remembers the step, resume goes back to it', () => {
    const r = rig([trio()]);
    r.engine.start('trio');
    draw(r);
    expect(r.progress.get().step).toBe(1);
    r.engine.stop();
    expect(r.progress.get()).toMatchObject({ active: null, paused: { id: 'trio', step: 1 } });
    // Nothing ticks while it is put down.
    r.store.setUi({ frame: 1 });
    expect(r.progress.get().step).toBe(1);
    expect(r.engine.resume()).toBe(true);
    // Resuming looks again, and frame 1 is already where it should be.
    expect(r.progress.get()).toMatchObject({ active: 'trio', step: 2, paused: null });
  });

  it('keeps the step ticks from before the pause', () => {
    const r = rig([trio()]);
    r.engine.start('trio');
    draw(r);
    r.engine.stop();
    r.engine.resume();
    expect(r.progress.get().done.trio).toEqual(['draw']);
  });

  it('has nothing to resume when nothing was put down', () => {
    const r = rig([trio()]);
    expect(r.engine.resume()).toBe(false);
  });

  it('starting again from the top clears the old ticks', () => {
    const r = rig([trio()]);
    r.engine.start('trio');
    draw(r);
    r.engine.start('trio', { step: 0 });
    expect(r.progress.get().done.trio).toEqual(['draw']);
    r.engine.stop();
    r.engine.start('trio');
    expect(r.progress.get().step).toBeGreaterThanOrEqual(1);
  });

  it('resetAll forgets badges and progress', () => {
    const r = rig([trio()]);
    r.engine.start('trio');
    draw(r);
    r.store.setUi({ frame: 1 });
    r.store.setUi({ playing: true });
    r.engine.resetAll();
    expect(r.progress.get()).toMatchObject({ completed: [], badges: [], paused: null, active: null });
    expect(JSON.parse(r.storage.data.get(QUESTS_KEY)!).badges).toEqual([]);
  });
});
