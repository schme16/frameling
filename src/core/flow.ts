/**
 * The clip flow (state graph): which clip plays first and what follows what. Pure functions on the format.
 *
 * States are the document's clips. A transition goes from one clip to another when the first ends, or when a named
 * trigger fires. Exports write it by clip name, the way game engines and Interactives refer to animations.
 */
import { FLOW_ANY, MAX_FLOW_BLEND, type Clip, type ClipDirection, type ClipFlow, type ClipTransition, type Doc, type FlowCondition, type FlowInput, type Id } from './format';
import { uid } from './doc';
import { readClipPlay } from './clipPlay';

/** The flow as exports write it: names, not ids. */
export interface FlowManifest {
  /** The clip that plays first. */
  start: string;
  /** `direction` and `repeat` are there only when the clip has them (see `Clip`); `frames` counts the clip's own frames. */
  states: { name: string; loop: boolean; frames: number; direction?: ClipDirection; repeat?: number }[];
  /** Named values the game sets, with what each starts as. Only there when the flow has inputs. */
  inputs?: { name: string; kind: 'toggle' | 'number'; start: boolean | number }[];
  /**
   * In the order they are checked: the first one that is ready wins. `any` (instead of `from`) is an arrow from every clip.
   * `conditions` must all hold, `blend` is seconds of fade; both are only there when the arrow has them.
   */
  transitions: { from?: string; any?: true; to: string; on: 'end' | 'trigger' | 'now'; trigger?: string; conditions?: FlowCondition[]; blend?: number }[];
}

/** The flow with anything pointing at a missing clip left out (clips can be deleted after the flow was made). */
export function cleanFlow(doc: Pick<Doc, 'clips' | 'flow'>): ClipFlow {
  const ids = new Set(doc.clips.map((c) => c.id));
  const f = doc.flow;
  return {
    ...(f?.start && ids.has(f.start) ? { start: f.start } : {}),
    transitions: (f?.transitions ?? []).filter((t) => (t.from === FLOW_ANY || ids.has(t.from)) && ids.has(t.to)),
    ...(f?.positions ? { positions: f.positions } : {}),
    ...(f?.inputs?.length ? { inputs: f.inputs } : {}),
    ...(f?.anyFirst === false ? { anyFirst: false } : {}),
  };
}

/** The clip that plays first: the chosen one, else the first clip. */
export function startClip(doc: Pick<Doc, 'clips' | 'flow'>): Clip | undefined {
  const f = cleanFlow(doc);
  return doc.clips.find((c) => c.id === f.start) ?? doc.clips[0];
}

/**
 * Where a clip goes next: on `trigger` (a name) or, with none, when it ends. Undefined = stay (loop or hold). Arrows
 * with checks only count when they hold for `values` (the inputs' starting values when none are given), and "Any
 * clip" arrows count for every clip.
 */
export function nextClip(doc: Pick<Doc, 'clips' | 'flow'>, from: Id, trigger?: string, values?: FlowValues): Clip | undefined {
  const t = pickTransition(doc, from, trigger === undefined ? { kind: 'end' } : { kind: 'trigger', name: trigger }, values);
  return t ? doc.clips.find((c) => c.id === t.to) : undefined;
}

// ---------------------------------------------------------------- inputs and conditions (pure)

/** What each input is right now, by name. */
export type FlowValues = Record<string, boolean | number>;

/** What happened: the clip finished, a trigger was fired, or an input changed (or a clip was just entered). */
export type FlowEvent = { kind: 'end' } | { kind: 'trigger'; name: string } | { kind: 'check' };

/** The starting value of an input: what it says, else off or 0. */
export function inputStart(i: FlowInput): boolean | number {
  return i.kind === 'toggle' ? i.start === true : typeof i.start === 'number' && Number.isFinite(i.start) ? i.start : 0;
}

/** Every input at its starting value. */
export function inputDefaults(flow: Pick<ClipFlow, 'inputs'> | undefined): FlowValues {
  const out: FlowValues = {};
  for (const i of flow?.inputs ?? []) out[i.name] = inputStart(i);
  return out;
}

/** Does one check hold? An input that doesn't exist, or a value of the wrong kind, never does. */
export function conditionHolds(c: FlowCondition, values: FlowValues): boolean {
  const v = values[c.input];
  if (v === undefined || typeof v !== typeof c.value) return false;
  if (typeof v === 'boolean') return c.op === '==' ? v === c.value : c.op === '!=' ? v !== c.value : false;
  const a = v as number;
  const b = c.value as number;
  switch (c.op) {
    case '>': return a > b;
    case '>=': return a >= b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '==': return a === b;
    case '!=': return a !== b;
  }
}

/** Do all of an arrow's checks hold? No checks means yes. */
export function conditionsHold(t: Pick<ClipTransition, 'conditions'>, values: FlowValues): boolean {
  return (t.conditions ?? []).every((c) => conditionHolds(c, values));
}

/** The arrows in the order they are tried: "Any clip" ones first unless the flow says its own go first. Stable. */
export function transitionOrder<T extends { from: Id }>(transitions: T[], anyFirst: boolean | undefined): T[] {
  const any = transitions.filter((t) => t.from === FLOW_ANY);
  const own = transitions.filter((t) => t.from !== FLOW_ANY);
  return anyFirst === false ? [...own, ...any] : [...any, ...own];
}

/**
 * The arrow to take from clip `from` after `event`, or undefined to stay. The first ready one in `transitionOrder`
 * wins. An arrow that waits for the clip's end or a trigger also needs its checks to hold; an "as soon as" arrow
 * (`now`) is looked at on 'check' events only and needs at least one check. An "Any clip" arrow is skipped when its
 * target is already playing, so a check that stays true doesn't restart the clip.
 */
export function pickTransition(doc: Pick<Doc, 'clips' | 'flow'>, from: Id, event: FlowEvent, values: FlowValues = inputDefaults(doc.flow)): ClipTransition | undefined {
  const f = cleanFlow(doc);
  return transitionOrder(f.transitions, f.anyFirst).find((t) => {
    if (t.from !== from && t.from !== FLOW_ANY) return false;
    if (t.from === FLOW_ANY && t.to === from) return false;
    const timed = event.kind === 'end' ? t.when === 'end' : event.kind === 'trigger' ? t.when === 'trigger' && t.trigger === event.name : t.when === 'now' && !!t.conditions?.length;
    return timed && conditionsHold(t, values);
  });
}

/** The words for one check, in plain English: "speed is above 0.5", "grounded is on". */
export function conditionWords(c: FlowCondition): string {
  if (typeof c.value === 'boolean') {
    const on = c.op === '!=' ? !c.value : c.value;
    return `${c.input} is ${on ? 'on' : 'off'}`;
  }
  const n = String(c.value);
  switch (c.op) {
    case '>': return `${c.input} is above ${n}`;
    case '>=': return `${c.input} is at least ${n}`;
    case '<': return `${c.input} is below ${n}`;
    case '<=': return `${c.input} is at most ${n}`;
    case '==': return `${c.input} is ${n}`;
    case '!=': return `${c.input} is not ${n}`;
  }
}

/** When an arrow goes, in plain words, for its label: "at the end", "on jump", "when speed is above 0.5", "on jump if grounded is on". */
export function arrowWords(t: Pick<ClipTransition, 'when' | 'trigger' | 'conditions'>): string {
  const checks = (t.conditions ?? []).map(conditionWords);
  if (t.when === 'now') return checks.length ? `when ${checks.join(' and ')}` : 'when (no check yet)';
  const base = t.when === 'end' ? 'at the end' : `on ${t.trigger ?? 'go'}`;
  return checks.length ? `${base} if ${checks.join(' and ')}` : base;
}

/** One check as briefly as it reads on an arrow in the graph: "speed > 0.5", "grounded", "not grounded". */
export function conditionShort(c: FlowCondition): string {
  if (typeof c.value === 'boolean') return (c.op === '!=' ? !c.value : c.value) ? c.input : `not ${c.input}`;
  const sym = { '>': '>', '>=': '\u2265', '<': '<', '<=': '\u2264', '==': '=', '!=': '\u2260' }[c.op];
  return `${c.input} ${sym} ${c.value}`;
}

/** An arrow's label in the graph, short: "at the end", "on jump, grounded", "speed > 0.5". The full words are `arrowWords`. */
export function arrowShort(t: Pick<ClipTransition, 'when' | 'trigger' | 'conditions'>): string {
  const checks = (t.conditions ?? []).map(conditionShort).join(', ');
  if (t.when === 'now') return checks || 'no check yet';
  const base = t.when === 'end' ? 'at the end' : `on ${t.trigger ?? 'go'}`;
  return checks ? `${base}, ${checks}` : base;
}

/** Something about the flow that won't do what it looks like it should, in plain words. Empty = all fine. */
export function flowProblems(doc: Pick<Doc, 'clips' | 'flow'>): string[] {
  const f = cleanFlow(doc);
  const kinds = new Map((f.inputs ?? []).map((i) => [i.name, i.kind]));
  const name = (id: Id) => (id === FLOW_ANY ? 'Any clip' : doc.clips.find((c) => c.id === id)?.name ?? '?');
  const out: string[] = [];
  for (const t of f.transitions) {
    const what = `The arrow from ${name(t.from)} to ${name(t.to)}`;
    if (t.when === 'now' && !t.conditions?.length) out.push(`${what} says "as soon as" but has no check, so it never goes.`);
    for (const c of t.conditions ?? []) {
      const k = kinds.get(c.input);
      if (!k) out.push(`${what} checks "${c.input}", but there is no input with that name, so it never goes.`);
      else if ((k === 'toggle') !== (typeof c.value === 'boolean')) out.push(`${what} checks "${c.input}" against the wrong kind of value, so it never goes.`);
    }
  }
  return [...new Set(out)];
}

/** Which of the newer parts a flow uses (inputs, checks on arrows, "Any clip" arrows, fades), so exports can say what they carry. */
export function flowExtras(doc: Pick<Doc, 'clips' | 'flow'>): { inputs: boolean; conditions: boolean; any: boolean; blend: boolean } {
  const f = cleanFlow(doc);
  return {
    inputs: !!f.inputs?.length,
    conditions: f.transitions.some((t) => !!t.conditions?.length || t.when === 'now'),
    any: f.transitions.some((t) => t.from === FLOW_ANY),
    blend: f.transitions.some((t) => (t.blend ?? 0) > 0),
  };
}

/** The extras listed in words ("inputs, checks on arrows and Any clip arrows"), or '' when the flow uses none. */
export function flowExtrasWords(doc: Pick<Doc, 'clips' | 'flow'>): string {
  const e = flowExtras(doc);
  const parts = [e.inputs && 'inputs', e.conditions && 'checks on arrows', e.any && 'Any clip arrows', e.blend && 'fade times'].filter(Boolean) as string[];
  if (parts.length < 2) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** What an export says about the flow's newer parts, where `target` is where it is going. Empty when it uses none. */
export function flowExportNotes(doc: Pick<Doc, 'clips' | 'flow'>, target: 'godot' | 'interactives' | 'other'): string[] {
  const words = flowExtrasWords(doc);
  if (!words) return [];
  const notes: string[] = [];
  if (target === 'godot') {
    notes.push(`The clip flow's ${words} come along in the flow script. Set an input from your game with set_flow_input("speed", 0.7).`);
    if (flowExtras(doc).blend) notes.push('Fades: Godot sprites cannot mix two clips, so the script fades a copy of the old clip out over the new one. It is a cross fade, and the old clip holds still while it goes.');
  } else if (target === 'interactives') {
    notes.push(`The clip flow's ${words} are written into the package for Interactives to read. Frameling cannot check what your version of Interactives does with them.`);
  } else {
    notes.push(`This clip flow has ${words}. They only go out with a Godot sprite sheet or an Interactives package: this format has no clip flow, so the clips come out without them.`);
  }
  return [...notes, ...flowProblems(doc)];
}
/** Every trigger name used, sorted. */
export function triggerNames(doc: Pick<Doc, 'clips' | 'flow'>): string[] {
  return [...new Set(cleanFlow(doc).transitions.filter((t) => t.when === 'trigger' && t.trigger).map((t) => t.trigger!))].sort();
}

/**
 * The flow by name for exports, or undefined when there is nothing to say (no transitions). `nameOf` gives each
 * clip's name in the export (engines make names unique and drop clips outside the range): undefined leaves it out.
 */
export function flowManifest(doc: Pick<Doc, 'clips' | 'flow'>, nameOf: (c: Clip) => string | undefined = (c) => c.name): FlowManifest | undefined {
  const named = new Map<Id, { clip: Clip; name: string }>();
  for (const c of doc.clips) {
    const name = nameOf(c);
    if (name !== undefined) named.set(c.id, { clip: c, name });
  }
  const f = cleanFlow(doc);
  const transitions = transitionOrder(f.transitions, f.anyFirst).filter((t) => (t.from === FLOW_ANY || named.has(t.from)) && named.has(t.to));
  if (!named.size || !transitions.length) return undefined;
  const start = (f.start && named.get(f.start)) || [...named.values()][0];
  return {
    start: start.name,
    states: [...named.values()].map(({ clip, name }) => ({ name, loop: clip.loop, frames: Math.abs(clip.end - clip.start) + 1, ...stateExtras(clip) })),
    ...(f.inputs?.length ? { inputs: f.inputs.map((i) => ({ name: i.name, kind: i.kind, start: inputStart(i) })) } : {}),
    transitions: transitions.map((t) => ({
      ...(t.from === FLOW_ANY ? { any: true as const } : { from: named.get(t.from)!.name }),
      to: named.get(t.to)!.name,
      on: t.when,
      ...(t.when === 'trigger' ? { trigger: t.trigger || 'go' } : {}),
      ...(t.conditions?.length ? { conditions: t.conditions.map((c) => ({ input: c.input, op: c.op, value: c.value })) } : {}),
      ...((t.blend ?? 0) > 0 ? { blend: t.blend } : {}),
    })),
  };
}

/** A clip's direction, and its repeat count when it plays a set number of times (the flow never needs it for a loop). */
function stateExtras(c: Clip): { direction?: ClipDirection; repeat?: number } {
  const { direction, repeat } = readClipPlay(c);
  return { ...(direction ? { direction } : {}), ...(!c.loop && repeat ? { repeat } : {}) };
}

/** Clip names the way sheet exports make them: trimmed, never empty, unique in clip order. */
export function exportClipNames(clips: Clip[], keep: (c: Clip) => boolean = () => true, countAll = true): Map<Id, string> {
  const out = new Map<Id, string>();
  const used = new Set<string>();
  for (const c of clips) {
    const k = keep(c);
    if (!k && !countAll) continue;
    let s = c.name.trim() || 'clip';
    while (used.has(s)) s += '_';
    used.add(s);
    if (k) out.set(c.id, s);
  }
  return out;
}

// ---------------------------------------------------------------- changes (on a draft)

function flowOf(doc: Doc): ClipFlow {
  return (doc.flow ??= { transitions: [] });
}

export function addTransition(doc: Doc, from: Id, to: Id, when: ClipTransition['when'] = 'end', trigger?: string): Id | undefined {
  if ((from !== FLOW_ANY && !doc.clips.some((c) => c.id === from)) || !doc.clips.some((c) => c.id === to)) return undefined;
  const f = flowOf(doc);
  const same = f.transitions.find((t) => t.from === from && t.to === to && t.when === when && (when !== 'trigger' || t.trigger === trigger));
  if (same) return same.id;
  const id = uid('t');
  f.transitions.push({ id, from, to, when, ...(when === 'trigger' ? { trigger: (trigger ?? 'go').trim() || 'go' } : {}) });
  return id;
}

export function updateTransition(doc: Doc, id: Id, patch: Partial<Omit<ClipTransition, 'id'>>): boolean {
  const t = doc.flow?.transitions.find((x) => x.id === id);
  if (!t) return false;
  Object.assign(t, patch);
  if (t.when !== 'trigger') delete t.trigger;
  else t.trigger = (t.trigger ?? 'go').trim() || 'go';
  if (!t.conditions?.length) delete t.conditions;
  if (t.blend !== undefined) {
    const b = Math.round(Math.min(MAX_FLOW_BLEND, Math.max(0, Number(t.blend) || 0)) * 100) / 100;
    if (b > 0) t.blend = b;
    else delete t.blend;
  }
  return true;
}

export function removeTransition(doc: Doc, id: Id): boolean {
  const f = doc.flow;
  const i = f?.transitions.findIndex((t) => t.id === id) ?? -1;
  if (!f || i < 0) return false;
  f.transitions.splice(i, 1);
  return true;
}

export function setStartClip(doc: Doc, id: Id): void {
  if (doc.clips.some((c) => c.id === id)) flowOf(doc).start = id;
}

export function moveFlowBox(doc: Doc, id: Id, x: number, y: number): void {
  const f = flowOf(doc);
  (f.positions ??= {})[id] = { x: Math.round(x), y: Math.round(y) };
}

/** Boxes laid out in rows when they haven't been placed by hand. */
export function flowLayout(doc: Pick<Doc, 'clips' | 'flow'>, width = 520): Record<Id, { x: number; y: number }> {
  const out: Record<Id, { x: number; y: number }> = {};
  const per = Math.max(1, Math.floor(width / 170));
  doc.clips.forEach((c, i) => {
    out[c.id] = doc.flow?.positions?.[c.id] ?? { x: 20 + (i % per) * 170, y: 20 + Math.floor(i / per) * 90 };
  });
  // The "Any clip" box takes the next place in the grid, until it is dragged somewhere.
  const n = doc.clips.length;
  out[FLOW_ANY] = doc.flow?.positions?.[FLOW_ANY] ?? { x: 20 + (n % per) * 170, y: 20 + Math.floor(n / per) * 90 };
  return out;
}

// ---------------------------------------------------------------- inputs and checks (on a draft)

/** A name no other input has: the wanted one, or with 2, 3... added. */
export function uniqueInputName(inputs: readonly FlowInput[], wanted: string): string {
  const base = wanted.trim().slice(0, 40) || 'input';
  let name = base;
  for (let n = 2; inputs.some((i) => i.name === name); n++) name = `${base} ${n}`;
  return name;
}

export function addInput(doc: Doc, kind: FlowInput['kind'], name?: string): string {
  const f = flowOf(doc);
  const inputs = (f.inputs ??= []);
  const n = uniqueInputName(inputs, name ?? (kind === 'toggle' ? 'grounded' : 'speed'));
  inputs.push({ name: n, kind });
  return n;
}

/** Changes an input. A new name is made unique, and every check that used the old name follows it. Returns the name it ended up with. */
export function editInput(doc: Doc, name: string, patch: { name?: string; kind?: FlowInput['kind']; start?: boolean | number }): string | undefined {
  const f = doc.flow;
  const i = f?.inputs?.find((x) => x.name === name);
  if (!f || !i) return undefined;
  if (patch.kind && patch.kind !== i.kind) {
    // A different kind means the old checks and starting value no longer make sense, so they are reset.
    i.kind = patch.kind;
    delete i.start;
    for (const t of f.transitions) if (t.conditions) t.conditions = t.conditions.map((c) => (c.input === name ? { input: name, ...(patch.kind === 'toggle' ? { op: '==' as const, value: true } : { op: '>' as const, value: 0 }) } : c));
  }
  if ('start' in patch) {
    if (patch.start === undefined || patch.start === (i.kind === 'toggle' ? false : 0)) delete i.start;
    else i.start = patch.start;
  }
  if (patch.name !== undefined && patch.name.trim() !== name) {
    const next = uniqueInputName(f.inputs!.filter((x) => x !== i), patch.name);
    for (const t of f.transitions) for (const c of t.conditions ?? []) if (c.input === name) c.input = next;
    i.name = next;
    return next;
  }
  return i.name;
}

/** Removes an input. Checks that used it stay (and are reported as problems) rather than vanishing. */
export function removeInput(doc: Doc, name: string): void {
  const f = doc.flow;
  if (!f?.inputs) return;
  f.inputs = f.inputs.filter((i) => i.name !== name);
  if (!f.inputs.length) delete f.inputs;
}

/** A first check for an arrow: the first input, "is on" or "is above 0". Undefined when there are no inputs. */
export function newCondition(inputs: readonly FlowInput[] | undefined, used: readonly FlowCondition[] = []): FlowCondition | undefined {
  const i = (inputs ?? []).find((x) => !used.some((c) => c.input === x.name)) ?? inputs?.[0];
  if (!i) return undefined;
  return i.kind === 'toggle' ? { input: i.name, op: '==', value: true } : { input: i.name, op: '>', value: 0 };
}

export function addCondition(doc: Doc, id: Id): boolean {
  const t = doc.flow?.transitions.find((x) => x.id === id);
  const c = newCondition(doc.flow?.inputs, t?.conditions);
  if (!t || !c) return false;
  (t.conditions ??= []).push(c);
  return true;
}

/** Changes one check. Picking a different input resets the operator and value to suit its kind. */
export function editCondition(doc: Doc, id: Id, index: number, patch: Partial<FlowCondition>): boolean {
  const f = doc.flow;
  const t = f?.transitions.find((x) => x.id === id);
  const c = t?.conditions?.[index];
  if (!f || !t || !c) return false;
  if (patch.input !== undefined && patch.input !== c.input) {
    const k = f.inputs?.find((i) => i.name === patch.input)?.kind;
    Object.assign(c, { input: patch.input }, k === 'number' ? { op: '>', value: 0 } : { op: '==', value: true });
    // Anything else asked for in the same change wins over the reset.
    const { input: _same, ...rest } = patch;
    Object.assign(c, rest);
    return true;
  }
  Object.assign(c, patch);
  if (typeof c.value === 'number' && !Number.isFinite(c.value)) c.value = 0;
  return true;
}

export function removeCondition(doc: Doc, id: Id, index: number): boolean {
  const t = doc.flow?.transitions.find((x) => x.id === id);
  if (!t?.conditions?.[index]) return false;
  t.conditions.splice(index, 1);
  if (!t.conditions.length) delete t.conditions;
  return true;
}

/** Which goes first when an Any clip arrow and a clip's own arrow are both ready. Missing = Any clip first. */
export function setAnyFirst(doc: Doc, first: boolean): void {
  const f = flowOf(doc);
  if (first) delete f.anyFirst;
  else f.anyFirst = false;
}
