import { describe, expect, it, vi } from 'vitest';
import { createStorageKeeper, noticeMemory, NOTICE_KEY, STORAGE_NOTICE, type PersistApi } from '../../src/platform/web/keepStorage';

function setup(storage: PersistApi | undefined, alreadySeen = false) {
  let seen = alreadySeen;
  const tell = vi.fn();
  const keep = createStorageKeeper({ storage, seen: { get: () => seen, set: () => (seen = true) }, tell });
  return { keep, tell, seen: () => seen };
}

describe('asking the browser to keep storage', () => {
  it('asks, and says nothing when it is granted', async () => {
    const persist = vi.fn(async () => true);
    const { keep, tell } = setup({ persisted: async () => false, persist });
    expect(await keep()).toBe('kept');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(tell).not.toHaveBeenCalled();
  });
  it('does not even ask when it is already persistent (an installed app)', async () => {
    const persist = vi.fn(async () => true);
    const { keep, tell } = setup({ persisted: async () => true, persist });
    expect(await keep()).toBe('kept');
    expect(persist).not.toHaveBeenCalled();
    expect(tell).not.toHaveBeenCalled();
  });
  it('tells the person once when it is not granted, and remembers that', async () => {
    const { keep, tell, seen } = setup({ persisted: async () => false, persist: async () => false });
    expect(await keep()).toBe('noticed');
    expect(tell).toHaveBeenCalledTimes(1);
    expect(seen()).toBe(true);
  });
  it('asks only once per visit, however many saves follow', async () => {
    const persist = vi.fn(async () => false);
    const { keep, tell } = setup({ persist });
    await keep();
    expect(await keep()).toBe('again');
    expect(await keep()).toBe('again');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(tell).toHaveBeenCalledTimes(1);
  });
  it('stays quiet on later visits once it has told them', async () => {
    const persist = vi.fn(async () => false);
    const { keep, tell } = setup({ persist }, true);
    expect(await keep()).toBe('quiet');
    expect(persist).toHaveBeenCalledTimes(1); // still asks: the browser may say yes this time
    expect(tell).not.toHaveBeenCalled();
  });
  it('does nothing in a browser with no persistence API', async () => {
    for (const s of [undefined, {}]) {
      const { keep, tell } = setup(s);
      expect(await keep()).toBe('unsupported');
      expect(tell).not.toHaveBeenCalled();
    }
  });
  it('treats an error like a no', async () => {
    const { keep, tell } = setup({ persist: async () => Promise.reject(new Error('nope')) });
    expect(await keep()).toBe('noticed');
    expect(tell).toHaveBeenCalledTimes(1);
  });
});

describe('the notice', () => {
  it('is plain and friendly, with no em dashes', () => {
    expect(STORAGE_NOTICE).toMatch(/week/);
    expect(STORAGE_NOTICE).toMatch(/Save/);
    expect(STORAGE_NOTICE).not.toMatch(/—|–/);
  });
  it('is remembered in localStorage, and for the visit when that is blocked', () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    const a = noticeMemory(store);
    expect(a.get()).toBe(false);
    a.set();
    expect(data.get(NOTICE_KEY)).toBe('1');
    expect(noticeMemory(store).get()).toBe(true);
    const blocked = noticeMemory({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    expect(blocked.get()).toBe(false);
    blocked.set();
    expect(blocked.get()).toBe(true);
    expect(noticeMemory(undefined).get()).toBe(false);
  });
});
