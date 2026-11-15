import { describe, expect, it } from 'vitest';
import { createPanicKey, PANIC_ACCELERATOR } from '../../src/main/panicKey';

function setup(accept = true) {
  const registered = new Map<string, () => void>();
  let sent = 0;
  const key = createPanicKey({
    register: (a, fn) => {
      if (!accept) return false;
      registered.set(a, fn);
      return true;
    },
    unregister: (a) => void registered.delete(a),
    send: () => void sent++,
  });
  return { key, registered, sent: () => sent };
}

describe('the audience Stop key from any window', () => {
  it('listens only while asked to, and tells the page when pressed', () => {
    const s = setup();
    expect(s.key.set(true)).toBe(true);
    s.registered.get(PANIC_ACCELERATOR)!();
    expect(s.sent()).toBe(1);
    expect(s.key.set(false)).toBe(false);
    expect(s.registered.size).toBe(0);
  });
  it('says no, quietly, when the desktop will not let it listen', () => {
    const s = setup(false);
    expect(s.key.set(true)).toBe(false);
    expect(s.key.active).toBe(false);
    expect(() => s.key.set(false)).not.toThrow();
  });
  it('does not register twice', () => {
    let n = 0;
    const key = createPanicKey({ register: () => (n++, true), unregister: () => undefined, send: () => undefined });
    key.set(true);
    key.set(true);
    expect(n).toBe(1);
  });
  it('survives a desktop that throws', () => {
    const key = createPanicKey({ register: () => { throw new Error('no'); }, unregister: () => { throw new Error('no'); }, send: () => undefined });
    expect(key.set(true)).toBe(false);
    const ok = createPanicKey({ register: () => true, unregister: () => { throw new Error('no'); }, send: () => undefined });
    ok.set(true);
    expect(() => ok.set(false)).not.toThrow();
    expect(ok.active).toBe(false);
  });
});
