// A drawing's name (`Cel.name`): optional, never written empty, tidied on read, and an old file or an older Frameling
// is untouched by it.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { cleanCelName, CEL_NAME_MAX, celNameField } from '../../src/core/celName';
import { FORMAT_VERSION } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import { artboardsOf, contentOf } from '../../src/artboards/model';
import { docWith } from '../timeline/helpers';

const read = (rel: string) => new Uint8Array(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', rel)));
const docJson = (bytes: Uint8Array) => JSON.parse(strFromU8(unzipSync(bytes)['doc.json']));
const withDocJson = (bytes: Uint8Array, edit: (d: any) => void) => {
  const z = unzipSync(bytes);
  const d = JSON.parse(strFromU8(z['doc.json']));
  edit(d);
  z['doc.json'] = strToU8(JSON.stringify(d));
  return zipSync(z);
};

describe('tidying a drawing name', () => {
  it('trims, folds runs of spaces and cuts to length', () => {
    expect(cleanCelName('  eyes   sad ')).toBe('eyes sad');
    expect(cleanCelName('a'.repeat(200))).toHaveLength(CEL_NAME_MAX);
  });
  it('treats empty, blank and non-text as no name', () => {
    for (const v of ['', '   ', undefined, null, 7, {}, ['x']]) expect(cleanCelName(v)).toBeUndefined();
    expect(celNameField('')).toEqual({});
    expect(celNameField('arm up')).toEqual({ name: 'arm up' });
  });
});

describe('a named drawing in a file', () => {
  it('survives saving and opening', () => {
    const doc = docWith([[0, 2], [2, 3]], 8);
    doc.layers[0].cels[1].name = 'eyes sad';
    const back = loadFile(saveFile(doc, '1.0.0')).doc;
    expect(back.layers[0].cels[1].name).toBe('eyes sad');
    expect(back.layers[0].cels[0].name).toBeUndefined();
  });

  it('is never written when there is none, so a file with no names is the file it was', () => {
    const doc = docWith([[0, 2], [2, 3]], 8);
    const cels = docJson(saveFile(doc, '1.0.0')).layers[0].cels;
    for (const c of cels) expect('name' in c).toBe(false);
  });

  it('keeps the format version, and adds nothing but `name` to a cel, so an older Frameling reads it as before', () => {
    expect(FORMAT_VERSION).toBe(3);
    const doc = docWith([[0, 2]], 4);
    doc.layers[0].cels[0].name = 'arm up';
    const bytes = saveFile(doc, '1.0.0');
    const d = docJson(bytes);
    expect(d.version).toBe(3);
    // The older reader builds a cel from id, start, length, drawingId, tween and autoHold, and drops the rest.
    const known = new Set(['id', 'start', 'length', 'drawingId', 'tween', 'autoHold', 'name']);
    expect(Object.keys(d.layers[0].cels[0]).filter((k) => !known.has(k))).toEqual([]);
    const stripped = loadFile(withDocJson(bytes, (x) => x.layers[0].cels.forEach((c: any) => delete c.name))).doc;
    expect(stripped.layers[0].cels[0]).toMatchObject({ start: 0, length: 2 });
    expect(stripped.layers[0].cels[0].name).toBeUndefined();
  });

  it('is tidied on the way in, and a bad one is dropped without a warning', () => {
    const bytes = saveFile(docWith([[0, 1], [1, 1], [2, 1]], 4), '1.0.0');
    const { doc, warnings } = loadFile(
      withDocJson(bytes, (d) => {
        const c = d.layers[0].cels;
        c[0].name = '  pose   one ';
        c[1].name = 42;
        c[2].name = '   ';
      }),
    );
    expect(doc.layers[0].cels.map((c) => c.name)).toEqual(['pose one', undefined, undefined]);
    expect(warnings).toEqual([]);
  });

  it("opens Quill's own file unchanged (no names in it) and keeps names put on an artboard's cels", () => {
    const quill = loadFile(read('brand/mascot/mascot.frameling'));
    expect(quill.warnings).toEqual([]);
    const boards = artboardsOf(quill.doc);
    const wave = contentOf(quill.doc, boards.find((a) => a.name === 'wave')!.id)!;
    const cels = Object.values(wave.cels ?? {}).flat();
    expect(cels.length).toBeGreaterThan(10);
    expect(cels.some((c) => c.name)).toBe(false);
    cels[0].name = 'first pose';
    const back = loadFile(saveFile(quill.doc, '1.0.0')).doc;
    const again = contentOf(back, artboardsOf(back).find((a) => a.name === 'wave')!.id)!;
    expect(Object.values(again.cels ?? {}).flat().filter((c) => c.name).map((c) => c.name)).toEqual(['first pose']);
  });
});
