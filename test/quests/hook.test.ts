import { describe, expect, it, vi } from 'vitest';
import { watchCommands } from '../../src/quests/hook';
import type { Command } from '../../src/core/registry';

const cmd = (id: string, run: Command['run']): Command => ({ id, label: id, category: 'Test', run });

describe('watchCommands', () => {
  it('reports a command after it runs, and still runs it', () => {
    const body = vi.fn();
    const a = cmd('t.a', body);
    const seen: string[] = [];
    const w = watchCommands((id) => seen.push(id), () => [a]);
    a.run();
    expect(body).toHaveBeenCalledOnce();
    expect(seen).toEqual(['t.a']);
    w.stop();
  });

  it('hands back what the command returned, so callers can still wait on it', async () => {
    const a = cmd('t.async', () => Promise.resolve());
    const seen: string[] = [];
    watchCommands((id) => seen.push(id), () => [a]);
    const r = a.run();
    expect(r).toBeInstanceOf(Promise);
    expect(seen).toEqual([]);
    await r;
    expect(seen).toEqual(['t.async']);
  });

  it('does not report a command that threw, and lets the error through', () => {
    const a = cmd('t.bad', () => {
      throw new Error('nope');
    });
    const seen: string[] = [];
    watchCommands((id) => seen.push(id), () => [a]);
    expect(() => a.run()).toThrow('nope');
    expect(seen).toEqual([]);
  });

  it('does not let a failing listener break the command', () => {
    const a = cmd('t.ok', () => {});
    watchCommands(() => {
      throw new Error('listener');
    }, () => [a]);
    expect(() => a.run()).not.toThrow();
  });

  it('puts the originals back on stop, and never wraps twice', () => {
    const orig = () => {};
    const a = cmd('t.orig', orig);
    const seen: string[] = [];
    const w = watchCommands((id) => seen.push(id), () => [a]);
    w.refresh();
    w.refresh();
    a.run();
    expect(seen).toEqual(['t.orig']);
    w.stop();
    expect(a.run).toBe(orig);
    a.run();
    expect(seen).toEqual(['t.orig']);
  });

  it('picks up commands registered later on refresh', () => {
    const list: Command[] = [];
    const seen: string[] = [];
    const w = watchCommands((id) => seen.push(id), () => list);
    const late = cmd('t.late', () => {});
    list.push(late);
    late.run();
    expect(seen).toEqual([]);
    w.refresh();
    late.run();
    expect(seen).toEqual(['t.late']);
  });

  it('leaves a command alone on stop if someone else replaced its run in the meantime', () => {
    const a = cmd('t.swap', () => {});
    const w = watchCommands(() => {}, () => [a]);
    const theirs = () => {};
    a.run = theirs;
    w.stop();
    expect(a.run).toBe(theirs);
  });
});
