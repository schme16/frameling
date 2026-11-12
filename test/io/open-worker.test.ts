// Opening a big vector document: its JSON is unzipped and parsed on a worker and handed across. The document that comes
// out must be the same as the plain synchronous open gives, for every template and shipped file, and damaged files must
// be reported in the same words. The worker is faked (it copies messages the way a real one does).
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { TEMPLATES } from '../../src/templates';
import { FileProblem, loadFile, loadFileAsync, loadTuning, saveFile } from '../../src/io/file';
import { setIoPool } from '../../src/io/ioClient';
import { runJob, type IoRequest } from '../../src/io/ioJobs';
import { WorkerPool, type WorkerLike } from '../../src/io/workerPool';
import { stressVectorDoc } from '../helpers/stressVector';

class FakeWorker implements WorkerLike {
  onmessage: ((e: { data: any }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(private mode: 'ok' | 'error' = 'ok', private seen: IoRequest[] = []) {}
  postMessage(msg: unknown, transfer: Transferable[] = []): void {
    const req = structuredClone(msg, { transfer }) as IoRequest;
    this.seen.push(req);
    setTimeout(() => {
      if (this.mode === 'error') return void this.onerror?.(new Error('boom'));
      const { reply, transfer: back } = runJob(req);
      this.onmessage?.({ data: structuredClone(reply, { transfer: back }) });
    }, 0);
  }
  terminate(): void {}
}

function pool(mode: 'ok' | 'error' = 'ok') {
  const seen: IoRequest[] = [];
  return { p: new WorkerPool(() => new FakeWorker(mode, seen), 2, 50), seen };
}

const tuning = loadTuning.minDocJson;
beforeEach(() => {
  loadTuning.minDocJson = 0;
});
afterEach(() => {
  loadTuning.minDocJson = tuning;
  setIoPool(undefined);
});

async function same(bytes: Uint8Array, label: string) {
  const { p, seen } = pool();
  setIoPool(p);
  const a = await loadFileAsync(bytes);
  const b = loadFile(bytes);
  expect(seen.some((r) => r.kind === 'doc'), label + ' went to a worker').toBe(true);
  expect(a.manifest, label).toEqual(b.manifest);
  expect(a.warnings, label).toEqual(b.warnings);
  expect(a.doc, label).toEqual(b.doc);
  p.release();
}

describe('opening a file with its JSON read on a worker', () => {
  it('gives the same document as the plain open for every template', async () => {
    for (const t of TEMPLATES) await same(saveFile(t.make(), '1.0.0', new Date('2026-01-01T00:00:00Z')), t.id);
  });
  it('gives the same document for the shipped .frameling files', async () => {
    const dir = 'brand/mascot';
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.frameling'))) await same(new Uint8Array(readFileSync(`${dir}/${f}`)), f);
  });
  it('gives the same document for the 40 layer stress document, sent by size alone', async () => {
    loadTuning.minDocJson = tuning;
    const bytes = saveFile(stressVectorDoc(), '1.0.0', new Date('2026-01-01T00:00:00Z'));
    await same(bytes, 'stress-vector');
  }, 60_000);
  it('keeps small documents on the page', async () => {
    loadTuning.minDocJson = tuning;
    const { p, seen } = pool();
    setIoPool(p);
    await loadFileAsync(saveFile(TEMPLATES[0].make()));
    expect(seen.length).toBe(0);
  });
  it('still opens when the worker fails', async () => {
    const bytes = saveFile(TEMPLATES[0].make());
    setIoPool(pool('error').p);
    expect((await loadFileAsync(bytes)).doc).toEqual(loadFile(bytes).doc);
  });
  it('still opens with no workers at all', async () => {
    const bytes = saveFile(TEMPLATES[0].make());
    setIoPool(null);
    expect((await loadFileAsync(bytes)).doc).toEqual(loadFile(bytes).doc);
  });

  it('reports a damaged or foreign file in the same words as the plain open', async () => {
    const manifest = (v: unknown) => strToU8(JSON.stringify(v));
    const cases: Record<string, Uint8Array> = {
      'not a zip': new Uint8Array([1, 2, 3, 4]),
      'no doc': zipSync({ 'hello.txt': strToU8('hi') }),
      'manifest only': zipSync({ 'manifest.json': manifest({ format: 'frameling', version: 1 }) }),
      'other format': zipSync({ 'manifest.json': manifest({ format: 'other', version: 1 }), 'doc.json': strToU8('{}') }),
      'newer': zipSync({ 'manifest.json': manifest({ format: 'frameling', version: 99 }), 'doc.json': strToU8('{"format":"frameling"}') }),
      'broken json': zipSync({ 'manifest.json': manifest({ format: 'frameling', version: 1 }), 'doc.json': strToU8('{nope') }),
      'broken manifest': zipSync({ 'manifest.json': strToU8('{nope'), 'doc.json': strToU8('{}') }),
      'doc is an array': zipSync({ 'manifest.json': manifest({ format: 'frameling', version: 1 }), 'doc.json': strToU8('[]') }),
      'bad version': zipSync({ 'manifest.json': manifest({ format: 'frameling', version: 'x' }), 'doc.json': strToU8('{}') }),
      'no layers': zipSync({ 'manifest.json': manifest({ format: 'frameling', version: 3 }), 'doc.json': strToU8('{"format":"frameling","width":10,"height":10,"fps":8}') }),
    };
    for (const [label, bytes] of Object.entries(cases)) {
      let plain = '';
      try {
        loadFile(bytes);
      } catch (e) {
        expect(e, label).toBeInstanceOf(FileProblem);
        plain = (e as Error).message;
      }
      expect(plain, label).not.toBe('');
      setIoPool(pool().p);
      const err = await loadFileAsync(bytes).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err, label).toBeInstanceOf(FileProblem);
      expect((err as Error).message, label).toBe(plain);
    }
  });
});
