// The open split: where the time inside an open went (src/io/ioTime.ts), the same idea as the save split. These are
// what scripts/perf/sweep.cjs prints, so a field left unwired would quietly read zero and hide the cost it stands for.
// Timings are not asserted as numbers, only that each part was recorded, because a fast machine can do any one of them
// in under the clock's resolution.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TEMPLATES } from '../../src/templates';
import { loadFile, loadFileAsync, loadTuning, saveFile } from '../../src/io/file';
import { ioTime } from '../../src/io/ioTime';
import { setIoPool } from '../../src/io/ioClient';
import { runJobAsync, type IoRequest } from '../../src/io/ioJobs';
import { WorkerPool, type WorkerLike } from '../../src/io/workerPool';

class FakeWorker implements WorkerLike {
  onmessage: ((e: { data: any }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  postMessage(msg: unknown, transfer: Transferable[] = []): void {
    const req = structuredClone(msg, { transfer }) as IoRequest;
    setTimeout(() => void runJobAsync(req).then(({ reply, transfer: back }) => this.onmessage?.({ data: structuredClone(reply, { transfer: back }) })), 0);
  }
  terminate(): void {}
}

const tuning = loadTuning.minDocJson;
beforeEach(() => {
  ioTime.reset();
});
afterEach(() => {
  loadTuning.minDocJson = tuning;
  setIoPool(undefined);
  ioTime.reset();
});

const bytesOf = () => saveFile(TEMPLATES[0].make(), '1.0.0', new Date('2026-01-01T00:00:00Z'));

describe('the open split', () => {
  it('counts the open and records every part of it', () => {
    loadFile(bytesOf());
    expect(ioTime.opens).toBe(1);
    for (const k of ['openScan', 'openJson', 'openUnzip', 'openBuild', 'openHistory'] as const) {
      expect(ioTime[k], k + ' should be a number of ms, not undefined').toBeTypeOf('number');
      expect(ioTime[k], k + ' should never be negative').toBeGreaterThanOrEqual(0);
    }
    expect(ioTime.openHeld).toBeCloseTo(ioTime.openScan + ioTime.openJson + ioTime.openUnzip + ioTime.openBuild + ioTime.openHistory, 6);
  });

  it('reads doc.json on the page when nothing goes to a worker, and waits on none', () => {
    loadFile(bytesOf());
    expect(ioTime.openJsonWait).toBe(0);
    expect(ioTime.openPngWait).toBe(0);
    expect(ioTime.openDocBytes).toBe(0); // only the worker path knows the inflated size
  });

  it('records the wait and the inflated size when doc.json goes to a worker', async () => {
    loadTuning.minDocJson = 0;
    const p = new WorkerPool(() => new FakeWorker(), 2, 50);
    setIoPool(p);
    await loadFileAsync(bytesOf());
    expect(ioTime.opens).toBe(1);
    expect(ioTime.openJsonWait).toBeGreaterThan(0);
    expect(ioTime.openDocBytes).toBeGreaterThan(0);
    expect(ioTime.openDecode).toBeLessThanOrEqual(ioTime.openJson);
    p.release();
  });

  it('adds up across several opens and goes back to nothing on reset', () => {
    const b = bytesOf();
    loadFile(b);
    loadFile(b);
    expect(ioTime.opens).toBe(2);
    ioTime.reset();
    expect(ioTime.opens).toBe(0);
    expect(ioTime.openHeld).toBe(0);
    expect(ioTime.openDocBytes).toBe(0);
  });
});
