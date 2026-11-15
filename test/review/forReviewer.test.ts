import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { REVIEWER_FIELDS, ReviewOut, forReviewer, reviewerLook, reviewerPatches } from '../../src/review/forReviewer';
import type { Look } from '../../src/popout/protocol';

describe('what a reviewer is sent of the drawing', () => {
  it('names every field of the document, so a new one cannot slip through unanswered', () => {
    const full = newDoc();
    for (const k of Object.keys(full)) expect(REVIEWER_FIELDS, `field ${k}`).toHaveProperty(k);
  });
  it('leaves out the sharer\'s own notes, marks, sound, pictures, history and plugin data', () => {
    const doc = { ...newDoc(), notes: [{ id: 'n', x: 0, y: 0, text: 'x' }], marks: [], audio: [], pictures: [], history: { steps: [] }, ext: { a: 1 }, exports: {} } as never as ReturnType<typeof newDoc>;
    const out = forReviewer(doc);
    for (const k of ['notes', 'marks', 'audio', 'pictures', 'history', 'ext', 'exports']) expect(out).not.toHaveProperty(k);
    expect(out.layers).toBe(doc.layers);
    expect(doc.notes).toHaveLength(1);
  });
  it('returns the same object when there is nothing to take out', () => {
    const doc = newDoc();
    for (const k of Object.keys(doc)) if (REVIEWER_FIELDS[k as keyof typeof REVIEWER_FIELDS] === 'withhold') delete (doc as unknown as Record<string, unknown>)[k];
    expect(forReviewer(doc)).toBe(doc);
  });
  it('drops patches on withheld fields, and asks for the whole drawing on a root replace', () => {
    expect(reviewerPatches([{ op: 'add', path: ['notes', 0], value: 1 }, { op: 'replace', path: ['layers', 0, 'name'], value: 'a' }])).toEqual([{ op: 'replace', path: ['layers', 0, 'name'], value: 'a' }]);
    expect(reviewerPatches([{ op: 'replace', path: [], value: {} }])).toBe('whole');
  });
  it('keeps the numbering one after another when a patch disappears', () => {
    const out = new ReviewOut();
    expect(out.map({ t: 'doc', seq: 4, doc: newDoc() })).toMatchObject({ seq: 4 });
    expect(out.map({ t: 'patch', seq: 5, patches: [{ op: 'add', path: ['notes', 0], value: 1 }] })).toBeNull();
    expect(out.map({ t: 'patch', seq: 6, patches: [{ op: 'replace', path: ['name'], value: 'b' }] })).toMatchObject({ seq: 5 });
    expect(out.map({ t: 'patch', seq: 7, patches: [{ op: 'replace', path: [], value: {} }] })).toBeNull();
    expect(out.wantsWhole).toBe(true);
  });
  it('tells a reviewer nothing of the capture settings, the active layer or the sharer\'s marks', () => {
    const look: Look = { name: 'A', frame: 3, playing: false, activeLayerId: 'l1', camera: false, marks: true, theme: { dark: true, bg: '', text: '', muted: '', accent: '', raised: '' }, capture: { bg: '#0f0', hideCursor: true } };
    const out = reviewerLook(look);
    expect(out.activeLayerId).toBeNull();
    expect(out.marks).toBe(false);
    expect(out.capture).toBeUndefined();
    expect(out.frame).toBe(3);
  });
});
