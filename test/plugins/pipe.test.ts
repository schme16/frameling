import { describe, expect, it } from 'vitest';
import { EventPipe } from '../../src/plugins/pipe';

type Ev = { type: 'down' | 'move' | 'up'; n: number };

describe('tool event pipe', () => {
  it('sends one at a time and folds moves that pile up while the plugin is busy', async () => {
    const seen: string[] = [];
    let release: () => void = () => undefined;
    const p = new EventPipe<Ev>(async (e) => {
      seen.push(`${e.type}${e.n}`);
      if (e.n === 0) await new Promise<void>((r) => (release = r));
    });
    p.push({ type: 'down', n: 0 }, undefined);
    for (let i = 1; i <= 50; i++) p.push({ type: 'move', n: i }, undefined);
    p.push({ type: 'up', n: 51 }, undefined);
    expect(p.waiting).toBe(2);
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(['down0', 'move50', 'up51']);
  });

  it('never drops a press or release, and keeps going after a delivery fails', async () => {
    const seen: number[] = [];
    const p = new EventPipe<Ev>(async (e) => {
      seen.push(e.n);
      if (e.n === 1) throw new Error('boom');
    });
    p.push({ type: 'down', n: 1 }, undefined);
    p.push({ type: 'up', n: 2 }, undefined);
    p.push({ type: 'down', n: 3 }, undefined);
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual([1, 2, 3]);
  });
});
