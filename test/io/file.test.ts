import { FORMAT_VERSION } from '../../src/core/format';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing, newPixelLayer, newVectorDrawing } from '../../src/core/doc';
import type { Doc } from '../../src/core/format';
import { FileProblem, loadFile, saveFile } from '../../src/io/file';

function sampleDoc(): Doc {
  const doc = newDoc({ name: 'Round trip', width: 64, height: 48, fps: 8, length: 6, background: null });
  const vector = newVectorDrawing();
  vector.shapes.push(
    {
      id: 's1',
      type: 'stroke',
      points: [{ x: 1, y: 2, p: 0.5 }, { x: 10, y: 12, p: 0.7 }],
      brush: { size: 6, thinning: 0.6, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 2, capStart: true, capEnd: false },
      color: '#ff0000',
      opacity: 0.8,
    },
    {
      id: 's2',
      type: 'path',
      paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 5, y: 0, c1: { x: 1, y: -2 }, c2: { x: 4, y: -2 } }, { x: 5, y: 5 }] }],
      fill: '#00ff00',
      stroke: { color: '#000000', width: 2, join: 'round', cap: 'butt' },
      opacity: 1,
    },
  );
  doc.drawings[vector.id] = vector;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 3, drawingId: vector.id });

  const layer = newPixelLayer('Pixels', 8);
  const px = newPixelDrawing(8, 6);
  for (let i = 0; i < px.pixels.length; i++) px.pixels[i] = (i * 37) & 255;
  doc.drawings[px.id] = px;
  layer.cels.push({ id: 'c2', start: 2, length: 4, drawingId: px.id });
  layer.opacity = 0.5;
  doc.layers.push(layer);
  doc.clips.push({ id: 'k1', name: 'idle', start: 0, end: 2, loop: true });
  doc.markers.push({ id: 'm1', name: 'hit', frame: 3 });
  return doc;
}

describe('.frameling file', () => {
  it('keeps the part of the easing curve a cut tween plays, and ignores a nonsense one', () => {
    const doc = sampleDoc();
    doc.layers[0].cels[0].tween = { ease: 'easeInOut', slice: [0.25, 0.5] };
    const back = loadFile(saveFile(doc, '1.2.3')).doc;
    expect(back.layers[0].cels[0].tween).toEqual({ ease: 'easeInOut', slice: [0.25, 0.5] });
    doc.layers[0].cels[0].tween = { ease: 'easeInOut', slice: [0.9, 0.2] };
    expect(loadFile(saveFile(doc, '1.2.3')).doc.layers[0].cels[0].tween).toEqual({ ease: 'easeInOut' });
  });

  it('saves and loads back to an identical document', () => {
    const doc = sampleDoc();
    const { doc: back, warnings } = loadFile(saveFile(doc, '1.2.3'));
    expect(warnings).toEqual([]);
    expect(back).toEqual(doc);
  });

  it('is a zip with a manifest, doc.json and one png per pixel drawing', () => {
    const doc = sampleDoc();
    const bytes = saveFile(doc, '9.9.9', new Date('2026-01-02T03:04:05Z'));
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    const loaded = loadFile(bytes);
    expect(loaded.manifest).toMatchObject({ format: 'frameling', version: FORMAT_VERSION, app: '9.9.9', created: '2026-01-02T03:04:05.000Z', name: 'Round trip' });
    const pixelId = Object.values(doc.drawings).find((d) => d.kind === 'pixel')!.id;
    // The pixels live as a png, named in doc.json.
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).toContain(`pixels/${pixelId}.png`);
  });

  it('gives a friendly error for things that are not Frameling files', () => {
    const cases: Uint8Array[] = [
      new Uint8Array([1, 2, 3, 4]),
      zipSync({ 'hello.txt': strToU8('hi') }),
      zipSync({ 'manifest.json': strToU8('{"format":"other","version":1}'), 'doc.json': strToU8('{}') }),
    ];
    for (const c of cases) {
      expect(() => loadFile(c)).toThrow(FileProblem);
      try {
        loadFile(c);
      } catch (e) {
        expect((e as Error).message).toMatch(/Frameling file/);
      }
    }
  });

  it('says so when the file is from a newer Frameling', () => {
    const bytes = zipSync({ 'manifest.json': strToU8('{"format":"frameling","version":99}'), 'doc.json': strToU8('{"format":"frameling"}') });
    expect(() => loadFile(bytes)).toThrow(/newer Frameling/);
  });

  it('says so when the document inside is broken', () => {
    const bytes = zipSync({ 'manifest.json': strToU8('{"format":"frameling","version":1}'), 'doc.json': strToU8('{nope') });
    expect(() => loadFile(bytes)).toThrow(/damaged/);
    // A pixel drawing whose png is missing from the zip.
    const stripped = zipSync({ 'manifest.json': strToU8('{"format":"frameling","version":1}'), 'doc.json': strToU8(JSON.stringify({ ...sampleDoc(), drawings: { p: { id: 'p', kind: 'pixel', width: 1, height: 1, pixels: 'pixels/p.png' } } })) });
    expect(() => loadFile(stripped)).toThrow(/damaged/);
  });

  it('repairs small problems and reports them', () => {
    const doc = sampleDoc();
    doc.layers[0].cels.push({ id: 'ghost', start: 5, length: 1, drawingId: 'nope' });
    const { doc: back, warnings } = loadFile(saveFile(doc));
    expect(back.layers[0].cels.map((c) => c.id)).toEqual(['c1']);
    expect(warnings.length).toBe(1);
  });
});
