import { strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { Clip, Doc } from '../../src/core/format';
import { newDoc } from '../../src/core/doc';
import { addTransition, cleanFlow, flowManifest, nextClip, removeTransition, setStartClip, startClip, triggerNames, updateTransition } from '../../src/core/flow';
import { buildSheetFiles } from '../../src/export/engines';
import { buildPlayable } from '../../src/export/playable';
import { DEFAULT_SHEET } from '../../src/export/types';
import type { RawImage } from '../../src/io/png';

const solid = (w: number, h: number, v: number): RawImage => {
  const p = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) p.set([v, v, v, 255], i * 4);
  return { width: w, height: h, pixels: p };
};

function flowDoc(): Doc {
  const doc = newDoc({ name: 'Hero', width: 8, height: 8, length: 6, fps: 10 });
  const clips: Clip[] = [
    { id: 'i', name: 'idle', start: 0, end: 1, loop: true },
    { id: 'j', name: 'jump', start: 2, end: 3, loop: false },
    { id: 'l', name: 'land', start: 4, end: 5, loop: false },
  ];
  doc.clips = clips;
  addTransition(doc, 'i', 'j', 'trigger', 'jump');
  addTransition(doc, 'j', 'l', 'end');
  addTransition(doc, 'l', 'i', 'end');
  return doc;
}

describe('clip flow', () => {
  it('follows triggers and clip ends', () => {
    const doc = flowDoc();
    expect(startClip(doc)?.name).toBe('idle');
    expect(nextClip(doc, 'i')).toBeUndefined();
    expect(nextClip(doc, 'i', 'jump')?.name).toBe('jump');
    expect(nextClip(doc, 'j')?.name).toBe('land');
    expect(triggerNames(doc)).toEqual(['jump']);
    setStartClip(doc, 'l');
    expect(startClip(doc)?.name).toBe('land');
  });

  it('adds each transition once, edits and removes them', () => {
    const doc = flowDoc();
    const n = doc.flow!.transitions.length;
    addTransition(doc, 'i', 'j', 'trigger', 'jump');
    expect(doc.flow!.transitions).toHaveLength(n);
    const id = doc.flow!.transitions[0].id;
    updateTransition(doc, id, { when: 'end' });
    expect(doc.flow!.transitions[0].trigger).toBeUndefined();
    removeTransition(doc, id);
    expect(doc.flow!.transitions).toHaveLength(n - 1);
  });

  it('forgets transitions to deleted clips', () => {
    const doc = flowDoc();
    doc.clips = doc.clips.filter((c) => c.id !== 'l');
    expect(cleanFlow(doc).transitions.map((t) => [t.from, t.to])).toEqual([['i', 'j']]);
  });

  it('writes names for exports', () => {
    expect(flowManifest(flowDoc())).toEqual({
      start: 'idle',
      states: [
        { name: 'idle', loop: true, frames: 2 },
        { name: 'jump', loop: false, frames: 2 },
        { name: 'land', loop: false, frames: 2 },
      ],
      transitions: [
        { from: 'idle', to: 'jump', on: 'trigger', trigger: 'jump' },
        { from: 'jump', to: 'land', on: 'end' },
        { from: 'land', to: 'idle', on: 'end' },
      ],
    });
    const plain = newDoc();
    expect(flowManifest(plain)).toBeUndefined();
  });

  it('rides along in the Interactives package manifest', () => {
    const doc = flowDoc();
    const frames = Array.from({ length: 6 }, (_, i) => solid(8, 8, i * 10));
    const { manifest } = buildPlayable({ doc, frames, range: { start: 0, end: 5 }, scale: 1, pixelArt: true, background: null, maxSide: 4096 });
    expect(manifest.flow?.start).toBe('idle');
    expect(manifest.flow?.transitions).toHaveLength(3);
    // Only part of the range: transitions to clips outside it go.
    const part = buildPlayable({ doc, frames: frames.slice(0, 4), range: { start: 0, end: 3 }, scale: 1, pixelArt: true, background: null, maxSide: 4096 });
    expect(part.manifest.flow?.transitions).toEqual([{ from: 'idle', to: 'jump', on: 'trigger', trigger: 'jump' }]);
    // No flow, no field.
    const none = buildPlayable({ doc: { ...doc, flow: undefined }, frames, range: { start: 0, end: 5 }, scale: 1, pixelArt: true, background: null, maxSide: 4096 });
    expect('flow' in none.manifest).toBe(false);
  });

  it('Godot export writes the flow JSON and a script that plays it', () => {
    const doc = flowDoc();
    const frames = Array.from({ length: 6 }, (_, i) => solid(8, 8, i * 10));
    const out = buildSheetFiles({ doc, sheet: { ...DEFAULT_SHEET, engine: 'godot' }, frames, range: { start: 0, end: 5 }, whole: true, clipId: null, scale: 1, name: 'Hero', pixelArt: true, maxSide: 8192 });
    const names = out.files.map((f) => f.name);
    const json = out.files.find((f) => f.name.endsWith('-flow.json'));
    const gd = out.files.find((f) => f.name.endsWith('_flow.gd'));
    expect(json, names.join(', ')).toBeTruthy();
    expect(JSON.parse(strFromU8(json!.bytes)).start).toBe('idle');
    const script = strFromU8(gd!.bytes);
    expect(script).toContain('extends AnimatedSprite2D');
    expect(script).toContain('func fire(trigger: String) -> bool:');
    expect(script).toContain('"trigger": "jump"');
  });
});
