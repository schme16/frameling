// Clip flow inputs, checks on arrows, "Any clip" arrows and fades: the pure rules, the file, and what the exports say.
import { strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { FLOW_ANY, type Clip, type Doc, type FlowCondition } from '../../src/core/format';
import { newDoc } from '../../src/core/doc';
import {
  addCondition, addInput, addTransition, arrowWords, cleanFlow, conditionHolds, conditionWords, editCondition, editInput, flowExportNotes, flowExtras, flowManifest, flowProblems,
  inputDefaults, nextClip, pickTransition, removeCondition, removeInput, setAnyFirst, uniqueInputName, updateTransition, flowLayout,
} from '../../src/core/flow';
import { readFlow, loadFile, saveFile } from '../../src/io/file';
import { carryWarnings } from '../../src/export/carries';
import { buildSheetFiles, godotFlowScript } from '../../src/export/engines';
import { buildPlayable } from '../../src/export/playable';
import { DEFAULT_SHEET } from '../../src/export/types';
import '../export/withInteractives';

const clips: Clip[] = [
  { id: 'i', name: 'idle', start: 0, end: 1, loop: true },
  { id: 'r', name: 'run', start: 2, end: 3, loop: true },
  { id: 'j', name: 'jump', start: 4, end: 5, loop: false },
  { id: 'h', name: 'hurt', start: 6, end: 7, loop: false },
];

/** idle <-> run on speed, run to jump when grounded and a trigger, hurt from any clip. */
function hero(): Doc {
  const doc = newDoc({ name: 'Hero', width: 8, height: 8, length: 8, fps: 10 });
  doc.clips = clips.map((c) => ({ ...c }));
  addInput(doc, 'number', 'speed');
  addInput(doc, 'toggle', 'grounded');
  addInput(doc, 'number', 'health');
  editInput(doc, 'health', { start: 3 });
  const a = addTransition(doc, 'i', 'r', 'now')!;
  addCondition(doc, a);
  editCondition(doc, a, 0, { input: 'speed', op: '>', value: 0.5 });
  const b = addTransition(doc, 'r', 'i', 'now')!;
  addCondition(doc, b);
  editCondition(doc, b, 0, { input: 'speed', op: '<=', value: 0.5 });
  const c = addTransition(doc, 'r', 'j', 'trigger', 'jump')!;
  addCondition(doc, c);
  editCondition(doc, c, 0, { input: 'grounded' });
  const d = addTransition(doc, FLOW_ANY, 'h', 'now')!;
  addCondition(doc, d);
  editCondition(doc, d, 0, { input: 'health', op: '<=', value: 0 });
  addTransition(doc, 'j', 'i', 'end');
  addTransition(doc, 'h', 'i', 'end');
  return doc;
}

const c = (input: string, op: FlowCondition['op'], value: boolean | number): FlowCondition => ({ input, op, value });

describe('checks', () => {
  it('compare numbers the way they read', () => {
    const v = { speed: 0.5 };
    expect(conditionHolds(c('speed', '>', 0.5), v)).toBe(false);
    expect(conditionHolds(c('speed', '>=', 0.5), v)).toBe(true);
    expect(conditionHolds(c('speed', '<', 0.6), v)).toBe(true);
    expect(conditionHolds(c('speed', '<=', 0.4), v)).toBe(false);
    expect(conditionHolds(c('speed', '==', 0.5), v)).toBe(true);
    expect(conditionHolds(c('speed', '!=', 0.5), v)).toBe(false);
  });

  it('compare on/off values', () => {
    expect(conditionHolds(c('grounded', '==', true), { grounded: true })).toBe(true);
    expect(conditionHolds(c('grounded', '==', true), { grounded: false })).toBe(false);
    expect(conditionHolds(c('grounded', '!=', true), { grounded: false })).toBe(true);
    // Above or below makes no sense for an on/off value.
    expect(conditionHolds(c('grounded', '>', true), { grounded: true })).toBe(false);
  });

  it('never hold for a missing input or the wrong kind of value', () => {
    expect(conditionHolds(c('nope', '==', true), {})).toBe(false);
    expect(conditionHolds(c('speed', '>', 1), { speed: true })).toBe(false);
    expect(conditionHolds(c('grounded', '==', true), { grounded: 1 })).toBe(false);
  });

  it('are said in plain words', () => {
    expect(conditionWords(c('speed', '>', 0.5))).toBe('speed is above 0.5');
    expect(conditionWords(c('speed', '>=', 2))).toBe('speed is at least 2');
    expect(conditionWords(c('grounded', '==', true))).toBe('grounded is on');
    expect(conditionWords(c('grounded', '!=', true))).toBe('grounded is off');
    expect(arrowWords({ when: 'end' })).toBe('at the end');
    expect(arrowWords({ when: 'trigger', trigger: 'jump', conditions: [c('grounded', '==', true)] })).toBe('on jump if grounded is on');
    expect(arrowWords({ when: 'now', conditions: [c('speed', '>', 1), c('grounded', '==', true)] })).toBe('when speed is above 1 and grounded is on');
  });
});

describe('picking the arrow', () => {
  it('starts every input at its starting value', () => {
    expect(inputDefaults(hero().flow)).toEqual({ speed: 0, grounded: false, health: 3 });
    expect(inputDefaults(undefined)).toEqual({});
  });

  it('takes an "as soon as" arrow when its check holds, and only on a check', () => {
    const doc = hero();
    expect(pickTransition(doc, 'i', { kind: 'check' }, { speed: 0.4, grounded: false, health: 3 })).toBeUndefined();
    expect(pickTransition(doc, 'i', { kind: 'check' }, { speed: 0.6, grounded: false, health: 3 })?.to).toBe('r');
    // Not on a clip end or a trigger.
    expect(pickTransition(doc, 'i', { kind: 'end' }, { speed: 0.6, grounded: false, health: 3 })).toBeUndefined();
    expect(pickTransition(doc, 'i', { kind: 'trigger', name: 'x' }, { speed: 0.6, grounded: false, health: 3 })).toBeUndefined();
  });

  it('only fires a trigger when its checks hold too', () => {
    const doc = hero();
    expect(pickTransition(doc, 'r', { kind: 'trigger', name: 'jump' }, { speed: 1, grounded: false, health: 3 })).toBeUndefined();
    expect(pickTransition(doc, 'r', { kind: 'trigger', name: 'jump' }, { speed: 1, grounded: true, health: 3 })?.to).toBe('j');
  });

  it('plays hurt from any clip, but not while hurt is already playing', () => {
    const doc = hero();
    const dead = { speed: 0, grounded: true, health: 0 };
    for (const id of ['i', 'r', 'j']) expect(pickTransition(doc, id, { kind: 'check' }, dead)?.to).toBe('h');
    expect(pickTransition(doc, 'h', { kind: 'check' }, dead)).toBeUndefined();
  });

  it('puts Any clip arrows first by default, or last when the flow says so', () => {
    const doc = hero();
    // From run with speed low and health gone: run to idle and Any to hurt are both ready.
    const both = { speed: 0, grounded: true, health: 0 };
    expect(pickTransition(doc, 'r', { kind: 'check' }, both)?.to).toBe('h');
    setAnyFirst(doc, false);
    expect(doc.flow!.anyFirst).toBe(false);
    expect(pickTransition(doc, 'r', { kind: 'check' }, both)?.to).toBe('i');
    setAnyFirst(doc, true);
    expect('anyFirst' in doc.flow!).toBe(false);
  });

  it('leaves an arrow with no checks that says "as soon as" alone', () => {
    const doc = newDoc();
    doc.clips = clips.map((x) => ({ ...x }));
    addTransition(doc, 'i', 'r', 'now');
    expect(pickTransition(doc, 'i', { kind: 'check' })).toBeUndefined();
  });

  it('keeps nextClip working the old way for a flow without inputs', () => {
    const doc = newDoc();
    doc.clips = clips.map((x) => ({ ...x }));
    addTransition(doc, 'i', 'j', 'trigger', 'jump');
    addTransition(doc, 'j', 'i', 'end');
    expect(nextClip(doc, 'i')).toBeUndefined();
    expect(nextClip(doc, 'i', 'jump')?.name).toBe('jump');
    expect(nextClip(doc, 'j')?.name).toBe('idle');
  });

  it('forgets an Any clip arrow whose target clip was deleted, and keeps the others', () => {
    const doc = hero();
    doc.clips = doc.clips.filter((x) => x.id !== 'h');
    const f = cleanFlow(doc);
    expect(f.transitions.some((t) => t.from === FLOW_ANY)).toBe(false);
    expect(f.inputs).toHaveLength(3);
  });
});

describe('editing inputs and checks', () => {
  it('names inputs uniquely', () => {
    expect(uniqueInputName([{ name: 'speed', kind: 'number' }], 'speed')).toBe('speed 2');
    expect(uniqueInputName([], '  ')).toBe('input');
    const doc = newDoc();
    expect(addInput(doc, 'number')).toBe('speed');
    expect(addInput(doc, 'number')).toBe('speed 2');
    expect(addInput(doc, 'toggle')).toBe('grounded');
  });

  it('renaming an input renames it in every check that uses it', () => {
    const doc = hero();
    expect(editInput(doc, 'speed', { name: 'pace' })).toBe('pace');
    const names = doc.flow!.transitions.flatMap((t) => t.conditions ?? []).map((x) => x.input);
    expect(names).toContain('pace');
    expect(names).not.toContain('speed');
    // A name that is taken gets a number instead of merging two inputs.
    expect(editInput(doc, 'pace', { name: 'health' })).toBe('health 2');
  });

  it('changing an input\'s kind resets the checks that used it, so none is left nonsense', () => {
    const doc = hero();
    editInput(doc, 'speed', { kind: 'toggle' });
    const cond = doc.flow!.transitions.flatMap((t) => t.conditions ?? []).filter((x) => x.input === 'speed');
    expect(cond.length).toBeGreaterThan(0);
    for (const x of cond) expect(x).toEqual({ input: 'speed', op: '==', value: true });
    expect(flowProblems(doc)).toEqual([]);
  });

  it('keeps checks on a removed input and says they never go', () => {
    const doc = hero();
    removeInput(doc, 'speed');
    expect(doc.flow!.transitions.some((t) => t.conditions?.some((x) => x.input === 'speed'))).toBe(true);
    expect(flowProblems(doc).join(' ')).toContain('"speed"');
    expect(flowProblems(doc).join(' ')).toContain('never goes');
  });

  it('switching to a different input in a check resets its operator and value', () => {
    const doc = hero();
    const t = doc.flow!.transitions[0];
    editCondition(doc, t.id, 0, { input: 'grounded' });
    expect(t.conditions![0]).toEqual({ input: 'grounded', op: '==', value: true });
    editCondition(doc, t.id, 0, { input: 'health' });
    expect(t.conditions![0]).toEqual({ input: 'health', op: '>', value: 0 });
  });

  it('removes a check, and the field goes when none is left', () => {
    const doc = hero();
    const t = doc.flow!.transitions[0];
    expect(removeCondition(doc, t.id, 0)).toBe(true);
    expect('conditions' in t).toBe(false);
  });

  it('cannot add a check with no inputs', () => {
    const doc = newDoc();
    doc.clips = clips.map((x) => ({ ...x }));
    const id = addTransition(doc, 'i', 'r', 'now')!;
    expect(addCondition(doc, id)).toBe(false);
  });

  it('limits fades to 0 to 5 seconds and drops a fade of 0', () => {
    const doc = hero();
    const id = doc.flow!.transitions[0].id;
    updateTransition(doc, id, { blend: 0.256 });
    expect(doc.flow!.transitions[0].blend).toBe(0.26);
    updateTransition(doc, id, { blend: 99 });
    expect(doc.flow!.transitions[0].blend).toBe(5);
    updateTransition(doc, id, { blend: 0 });
    expect('blend' in doc.flow!.transitions[0]).toBe(false);
  });

  it('puts the Any clip box in the next place in the grid until it is moved', () => {
    const doc = hero();
    const p = flowLayout(doc);
    expect(p[FLOW_ANY]).toEqual({ x: 20 + (4 % 3) * 170, y: 20 + Math.floor(4 / 3) * 90 });
  });
});

describe('the file', () => {
  it('opens an old flow exactly as it was', () => {
    const raw = { start: 'i', transitions: [{ id: 't1', from: 'i', to: 'j', when: 'trigger', trigger: 'jump' }, { id: 't2', from: 'j', to: 'i', when: 'end' }], positions: { i: { x: 1, y: 2 } } };
    expect(readFlow(raw, clips)).toEqual(raw);
  });

  it('round trips inputs, checks, Any clip arrows and fades through a saved document', () => {
    const doc = hero();
    updateTransition(doc, doc.flow!.transitions[0].id, { blend: 0.2 });
    doc.flow!.positions = { [FLOW_ANY]: { x: 5, y: 6 } };
    const back = loadFile(saveFile(doc)).doc;
    expect(back.flow).toEqual(doc.flow);
  });

  it('drops nonsense but keeps a check on an input that is gone', () => {
    const f = readFlow(
      {
        inputs: [{ name: 'speed', kind: 'number', start: 'x' }, { name: 'speed', kind: 'toggle' }, { name: '', kind: 'toggle' }, { name: 'g', kind: 'toggle', start: true }, 7],
        transitions: [
          { id: 'a', from: FLOW_ANY, to: 'h', when: 'now', conditions: [{ input: 'speed', op: '>', value: 1 }, { input: 'x', op: 'between', value: 1 }, { input: 'y', op: '==', value: 'z' }, { input: 'gone', op: '!=', value: true }], blend: 99 },
          { id: 'b', from: 'nope', to: 'h', when: 'end' },
          { id: 'c', from: 'i', to: 'h', when: 'weird', blend: -1 },
        ],
        anyFirst: false,
      },
      clips,
    )!;
    expect(f.inputs).toEqual([{ name: 'speed', kind: 'number' }, { name: 'g', kind: 'toggle', start: true }]);
    expect(f.transitions.map((t) => t.id)).toEqual(['a', 'c']);
    expect(f.transitions[0].conditions).toEqual([{ input: 'speed', op: '>', value: 1 }, { input: 'gone', op: '!=', value: true }]);
    expect(f.transitions[0].blend).toBe(5);
    expect(f.transitions[1]).toEqual({ id: 'c', from: 'i', to: 'h', when: 'end' });
    expect(f.anyFirst).toBe(false);
  });

  it('reads a flow that is only inputs', () => {
    expect(readFlow({ transitions: [], inputs: [{ name: 'speed', kind: 'number' }] }, clips)).toEqual({ transitions: [], inputs: [{ name: 'speed', kind: 'number' }] });
  });
});

describe('what the exports carry', () => {
  it('writes the manifest by name, Any clip arrows first, with inputs, checks and fades', () => {
    const doc = hero();
    updateTransition(doc, doc.flow!.transitions[0].id, { blend: 0.25 });
    const m = flowManifest(doc)!;
    expect(m.inputs).toEqual([
      { name: 'speed', kind: 'number', start: 0 },
      { name: 'grounded', kind: 'toggle', start: false },
      { name: 'health', kind: 'number', start: 3 },
    ]);
    expect(m.transitions[0]).toEqual({ any: true, to: 'hurt', on: 'now', conditions: [{ input: 'health', op: '<=', value: 0 }] });
    const idleToRun = m.transitions.find((t) => t.from === 'idle' && t.to === 'run')!;
    expect(idleToRun).toEqual({ from: 'idle', to: 'run', on: 'now', conditions: [{ input: 'speed', op: '>', value: 0.5 }], blend: 0.25 });
    setAnyFirst(doc, false);
    expect(flowManifest(doc)!.transitions.at(-1)?.any).toBe(true);
  });

  it('says what a flow uses, in words', () => {
    expect(flowExtras(hero())).toEqual({ inputs: true, conditions: true, any: true, blend: false });
    const plain = newDoc();
    plain.clips = clips.map((x) => ({ ...x }));
    addTransition(plain, 'i', 'j', 'trigger', 'jump');
    expect(flowExportNotes(plain, 'godot')).toEqual([]);
    expect(flowExportNotes(plain, 'other')).toEqual([]);
    expect(flowExportNotes(hero(), 'other')[0]).toContain('inputs, checks on arrows and Any clip arrows');
  });

  it('does not drop a check silently: Godot and Interactives say they carry them, everything else says it leaves them out', () => {
    const doc = hero();
    expect(flowExportNotes(doc, 'godot').join(' ')).toContain('set_flow_input');
    expect(flowExportNotes(doc, 'interactives').join(' ')).toContain('written into the package');
    expect(carryWarnings(doc, 'gif').join(' ')).toContain('no clip flow');
    expect(carryWarnings(doc, 'png').join(' ')).toContain('inputs');
    expect(carryWarnings(doc, 'interactives', undefined, { start: 0, end: 7 }).join(' ')).toContain('written into the package');
    // A flow with only the old parts adds nothing new to say.
    const plain = newDoc();
    plain.clips = clips.map((x) => ({ ...x }));
    addTransition(plain, 'i', 'j', 'trigger', 'jump');
    expect(carryWarnings(plain, 'gif')).toEqual([]);
  });

  it('warns about fades only for Godot, where it says how they are made', () => {
    const doc = hero();
    updateTransition(doc, doc.flow!.transitions[0].id, { blend: 0.2 });
    expect(flowExportNotes(doc, 'godot').join(' ')).toContain('cross fade');
    expect(flowExportNotes(hero(), 'godot').join(' ')).not.toContain('cross fade');
  });

  it('warns about an arrow that can never go', () => {
    const doc = newDoc();
    doc.clips = clips.map((x) => ({ ...x }));
    addTransition(doc, 'i', 'r', 'now');
    expect(flowExportNotes(doc, 'godot').join(' ')).toContain('no check');
  });

  it('rides along in the Interactives package manifest', () => {
    const doc = hero();
    const frames = Array.from({ length: 8 }, (_, i) => ({ width: 8, height: 8, pixels: new Uint8ClampedArray(8 * 8 * 4).fill(i * 20) }));
    const { manifest } = buildPlayable({ doc, frames, range: { start: 0, end: 7 }, scale: 1, pixelArt: true, background: null, maxSide: 4096 });
    expect(manifest.flow?.inputs).toHaveLength(3);
    expect(manifest.flow?.transitions[0]).toMatchObject({ any: true, to: 'hurt', on: 'now' });
    expect(manifest.flow?.transitions.every((t) => t.on !== 'now' || t.conditions?.length)).toBe(true);
  });

  it('writes the Godot flow file and a script that handles inputs, checks, Any clip and fades', () => {
    const doc = hero();
    const frames = Array.from({ length: 8 }, (_, i) => ({ width: 8, height: 8, pixels: new Uint8ClampedArray(8 * 8 * 4).fill(i * 20) }));
    const out = buildSheetFiles({ doc, sheet: { ...DEFAULT_SHEET, engine: 'godot' }, frames, range: { start: 0, end: 7 }, whole: true, clipId: null, scale: 1, name: 'Hero', pixelArt: true, maxSide: 8192 } as never);
    const json = JSON.parse(strFromU8(out.files.find((f) => f.name.endsWith('-flow.json'))!.bytes));
    expect(json.inputs).toHaveLength(3);
    expect(json.transitions[0].any).toBe(true);
    const gd = strFromU8(out.files.find((f) => f.name.endsWith('_flow.gd'))!.bytes);
    for (const bit of ['func set_flow_input(', 'func fire(trigger: String) -> bool:', 'func _holds(', 'func _fade_out_copy(', '"conditions"']) expect(gd).toContain(bit);
  });

  it('godotFlowScript keeps working for a flow with none of the new parts', () => {
    const gd = godotFlowScript({ start: 'a', states: [{ name: 'a', loop: true, frames: 1 }], transitions: [{ from: 'a', to: 'a', on: 'end' }] }, 'x.tres');
    expect(gd).toContain('"on": "end"');
    expect(gd).not.toContain('"inputs":');
  });
});
