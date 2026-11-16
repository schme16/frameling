import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { Doc, ReferencePicture } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import { picturesInUse, readLayerPicture } from '../../src/io/pictures-file';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3];
const JPG = [0xff, 0xd8, 0xff, 0xe0, 9, 8];
const pic = (id: string, bytes: number[], mime = 'image/png'): ReferencePicture => ({ id, name: `${id}.png`, data: new Uint8Array(bytes), mime, width: 40, height: 30 });

function docWithPictures(): Doc {
  const doc = newDoc({ name: 'Traced' });
  doc.pictures = [pic('p1', PNG), pic('p/2', JPG, 'image/jpeg'), pic('unused', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7])];
  const ref = { ...newVectorLayer('Photo'), reference: true, opacity: 0.6, picture: { x: 320, y: 180, scale: 0.5, turn: 12.5, shots: [{ picture: 'p1', start: 0, length: 4 }, { picture: 'p/2', start: 6 }] } };
  doc.layers.unshift(ref);
  return doc;
}

describe('reference pictures in the file', () => {
  it('keep the bytes in pictures/ entries and name them in doc.json, leaving out any no layer shows', () => {
    const zip = unzipSync(saveFile(docWithPictures()));
    expect(Object.keys(zip).filter((n) => n.startsWith('pictures/')).sort()).toEqual(['pictures/p1.png', 'pictures/p_2.jpg']);
    const raw = JSON.parse(new TextDecoder().decode(zip['doc.json']));
    expect(raw.pictures.map((p: { data: string }) => p.data)).toEqual(['pictures/p1.png', 'pictures/p_2.jpg']);
    expect(JSON.stringify(raw)).not.toContain('"0":137');
  });

  it('round trips the bytes, the placement and which picture shows on which frames', () => {
    const { doc, warnings } = loadFile(saveFile(docWithPictures()));
    expect(warnings).toEqual([]);
    expect(doc.pictures!.map((p) => p.id)).toEqual(['p1', 'p/2']);
    expect([...doc.pictures![0].data]).toEqual(PNG);
    expect(doc.pictures![1]).toMatchObject({ mime: 'image/jpeg', width: 40, height: 30, name: 'p/2.png' });
    const layer = doc.layers[0];
    expect(layer).toMatchObject({ name: 'Photo', reference: true, opacity: 0.6 });
    expect(layer.picture).toEqual({ x: 320, y: 180, scale: 0.5, turn: 12.5, shots: [{ picture: 'p1', start: 0, length: 4 }, { picture: 'p/2', start: 6 }] });
  });

  it('leave the field out entirely when there is none, so old files open as before', () => {
    const doc = newDoc({ name: 'Plain' });
    const zip = unzipSync(saveFile(doc));
    expect(Object.keys(zip).some((n) => n.startsWith('pictures/'))).toBe(false);
    expect(JSON.parse(new TextDecoder().decode(zip['doc.json']))).not.toHaveProperty('pictures');
    const back = loadFile(saveFile(doc)).doc;
    expect(back.pictures).toBeUndefined();
    expect(back.layers[0].picture).toBeUndefined();
  });

  it('say so when a picture is missing, and the layer loses that shot rather than the file failing', () => {
    const z = unzipSync(saveFile(docWithPictures()));
    delete z['pictures/p1.png'];
    const { doc, warnings } = loadFile(zipSync(z));
    expect(warnings.join(' ')).toMatch(/reference picture "p1.png" is missing/);
    expect(doc.layers[0].picture?.shots).toEqual([{ picture: 'p/2', start: 6 }]);
  });

  it('finds the pictures in use wherever the layers sit', () => {
    const doc = docWithPictures();
    doc.symbols = { s1: { id: 's1', name: 'S', length: 1, layers: [{ ...newVectorLayer('In symbol'), picture: { x: 0, y: 0, scale: 1, shots: [{ picture: 'unused', start: 0 }] } }] } } as unknown as Doc['symbols'];
    expect([...picturesInUse(doc)].sort()).toEqual(['p/2', 'p1', 'unused']);
  });

  it('read a layer picture defensively', () => {
    const ids = new Set(['a', 'b']);
    expect(readLayerPicture(undefined, ids)).toEqual({});
    expect(readLayerPicture({ x: 1, y: 2, scale: 'big', shots: [{ picture: 'zzz', start: 0 }] }, ids)).toEqual({});
    const r = readLayerPicture({ x: 'a', y: 2, scale: -4, turn: 370, shots: [{ picture: 'b', start: 5.4 }, { picture: 'a', start: -3, length: 0 }, { picture: 'a', start: 5 }, null] }, ids).picture!;
    expect(r).toMatchObject({ x: 0, y: 2, scale: 1, turn: 10 });
    expect(r.shots).toEqual([{ picture: 'a', start: 0 }, { picture: 'b', start: 5 }]);
  });
});
