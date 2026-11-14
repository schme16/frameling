// @vitest-environment jsdom
// Try it with inputs: changing an input in the panel switches the clip, and Any clip arrows cut in.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { FLOW_ANY, type Doc } from '../../src/core/format';
import { addCondition, addInput, addTransition, editCondition } from '../../src/core/flow';
import { resetStore, store } from '../../src/core/store';
import { tl } from '../../src/timeline/state';
import { connectClips, fireTrigger, setTryInput, startTrying, stopTrying, tryingClip, tryValues } from '../../src/flow/ops';

function hero(): Doc {
  const doc = newDoc({ name: 'Hero', width: 8, height: 8, length: 8, fps: 10 });
  doc.clips = [
    { id: 'i', name: 'idle', start: 0, end: 1, loop: true },
    { id: 'r', name: 'run', start: 2, end: 3, loop: true },
    { id: 'h', name: 'hurt', start: 4, end: 5, loop: false },
  ];
  addInput(doc, 'number', 'speed');
  addInput(doc, 'number', 'health');
  const a = addTransition(doc, 'i', 'r', 'now')!;
  addCondition(doc, a);
  editCondition(doc, a, 0, { input: 'speed', op: '>', value: 0.5 });
  const b = addTransition(doc, 'r', 'i', 'now')!;
  addCondition(doc, b);
  editCondition(doc, b, 0, { input: 'speed', op: '<=', value: 0.5 });
  const c = addTransition(doc, FLOW_ANY, 'h', 'now')!;
  addCondition(doc, c);
  editCondition(doc, c, 0, { input: 'health', op: '<=', value: 0 });
  doc.flow!.inputs![1].start = 3;
  return doc;
}

beforeEach(() => resetStore(hero()));
afterEach(() => stopTrying());

describe('Try it with inputs', () => {
  it('starts on the first clip with every input at its starting value', () => {
    startTrying();
    expect(tryingClip()).toBe('i');
    expect(tryValues()).toEqual({ speed: 0, health: 3 });
    expect(tl().clipId).toBe('i');
  });

  it('switches clips as an input changes, and back again', () => {
    startTrying();
    setTryInput('speed', 0.9);
    expect(tryingClip()).toBe('r');
    setTryInput('speed', 0.3);
    expect(tryingClip()).toBe('i');
  });

  it('plays hurt from whichever clip is playing', () => {
    startTrying();
    setTryInput('speed', 0.9);
    setTryInput('health', 0);
    expect(tryingClip()).toBe('h');
  });

  it('does nothing when no flow is being tried, and a trigger that leads nowhere stays put', () => {
    setTryInput('speed', 1);
    expect(tryingClip()).toBeNull();
    startTrying();
    fireTrigger('nope');
    expect(tryingClip()).toBe('i');
  });

  it('draws an Any clip arrow as a trigger named after where it goes', () => {
    store().update('clear', (d) => void ((d as Doc).flow = undefined));
    const id = connectClips(FLOW_ANY, 'h');
    const t = store().get().doc.flow!.transitions.find((x) => x.id === id)!;
    expect(t).toMatchObject({ from: FLOW_ANY, to: 'h', when: 'trigger', trigger: 'hurt' });
    startTrying();
    fireTrigger('hurt');
    expect(tryingClip()).toBe('h');
  });

  it('undoes an input change as one step', () => {
    const before = store().get().doc.flow!.inputs!.length;
    store().update('Add', (d) => void addInput(d as Doc, 'toggle'));
    store().undo();
    expect(store().get().doc.flow!.inputs!.length).toBe(before);
  });
});
