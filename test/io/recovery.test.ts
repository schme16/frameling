import { describe, expect, it, vi } from 'vitest';
import { dismissPending, recovery, restorePending, whenSaved } from '../../src/io/recovery';

describe('crash recovery card', () => {
  it('says when the copy was made in plain words', () => {
    const now = new Date(2026, 10, 11, 23, 0).getTime();
    expect(whenSaved(new Date(2026, 10, 11, 22, 50).getTime(), now)).toMatch(/^today at /);
    expect(whenSaved(new Date(2026, 10, 10, 9, 5).getTime(), now)).toMatch(/^yesterday at /);
    expect(whenSaved(new Date(2026, 10, 3, 9, 5).getTime(), now)).toMatch(/^on .+ at /);
  });

  it('restores once and forgets it', () => {
    const restore = vi.fn();
    recovery.set({ name: 'Ball', savedAt: 0, restore });
    restorePending();
    restorePending();
    expect(restore).toHaveBeenCalledTimes(1);
    expect(recovery.get()).toBeNull();
  });

  it('Not now forgets it without restoring', () => {
    const restore = vi.fn();
    recovery.set({ name: 'Ball', savedAt: 0, restore });
    dismissPending();
    expect(restore).not.toHaveBeenCalled();
    expect(recovery.get()).toBeNull();
  });
});
