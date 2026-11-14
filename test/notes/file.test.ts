import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { CanvasNote, Doc } from '../../src/core/format';
import { kitchenSinkDoc } from '../../src/export/kitchenSink';
import { loadFile, saveFile } from '../../src/io/file';

const notes: CanvasNote[] = [
  { id: 'a', x: 12.5, y: 40, text: 'the elbow pops here', pin: 'frame', frame: 3, by: 'Sam', at: 1_700_000_000_000 },
  { id: 'b', x: 80, y: 10, text: 'ask about the colour', done: true, replies: [{ id: 'r1', text: 'asked', by: 'Al', at: 1_700_000_100_000 }] },
];

const roundTrip = (d: Doc) => loadFile(saveFile(d, 'test'));
const docJson = (bytes: Uint8Array) => JSON.parse(strFromU8(unzipSync(bytes)['doc.json']));

describe('notes in the file', () => {
  it('are saved and come back exactly', () => {
    const d = newDoc({ width: 64, height: 64 });
    d.length = 8;
    d.notes = notes;
    const back = roundTrip(d);
    expect(back.doc.notes).toEqual(notes);
    expect(roundTrip(back.doc).doc.notes).toEqual(notes);
  });
  it('are left out of the file when there are none', () => {
    const d = newDoc({ width: 64, height: 64 });
    expect('notes' in docJson(saveFile(d, 'test'))).toBe(false);
    expect(roundTrip(d).doc.notes).toBeUndefined();
  });
  it('an older file without them opens as it always did', () => {
    const d = newDoc({ width: 64, height: 64 });
    const files = unzipSync(saveFile(d, 'test'));
    const json = JSON.parse(strFromU8(files['doc.json']));
    delete json.notes;
    files['doc.json'] = strToU8(JSON.stringify(json));
    const back = loadFile(zipSync(files));
    expect(back.doc.notes).toBeUndefined();
    expect(back.doc.width).toBe(64);
  });
  it('damaged ones are dropped and the rest of the file still opens', () => {
    const d = newDoc({ width: 64, height: 64 });
    const files = unzipSync(saveFile(d, 'test'));
    const json = JSON.parse(strFromU8(files['doc.json']));
    json.notes = [{ id: 'ok', x: 1, y: 2, text: 'fine' }, { id: 'bad', text: 'no place' }, 'junk', { id: 'f', x: 0, y: 0, text: 'x', pin: 'frame', frame: 'soon' }];
    files['doc.json'] = strToU8(JSON.stringify(json));
    const back = loadFile(zipSync(files)).doc;
    expect(back.notes!.map((n) => n.id)).toEqual(['ok', 'f']);
    expect(back.notes![1].pin).toBeUndefined();
    json.notes = 'not a list';
    files['doc.json'] = strToU8(JSON.stringify(json));
    expect(loadFile(zipSync(files)).doc.notes).toBeUndefined();
  });
  it('survive with every other feature at once, and change nothing else', () => {
    const plain = kitchenSinkDoc();
    const withNotes = { ...plain, notes };
    const a = roundTrip(plain).doc;
    const b = roundTrip(withNotes).doc;
    expect(b.notes).toEqual(notes);
    const { notes: _gone, ...rest } = b;
    void _gone;
    const ser = (d: unknown) => JSON.stringify(d, (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v));
    expect(ser(rest)).toBe(ser(a));
  });
  it('stay with the file through artboards', () => {
    const d = newDoc({ width: 64, height: 64 });
    d.artboards = [
      { id: 'b1', name: 'One', x: 0, y: 0 },
      { id: 'b2', name: 'Two', x: 100, y: 0, content: { width: 64, height: 64, background: null, length: 1, layers: [], clips: [], markers: [] } },
    ] as never;
    d.activeArtboard = 'b1';
    d.notes = [{ id: 'n', x: 1, y: 1, text: 'on two', board: 'b2' }];
    expect(roundTrip(d).doc.notes).toEqual(d.notes);
  });
});
