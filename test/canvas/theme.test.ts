// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { cssVar, flushTheme, subscribeTheme } from '../../src/canvas/theme';

const settle = () => new Promise((r) => setTimeout(r));

describe('canvas theme tokens', () => {
  it('tell subscribers when the theme or look changes, with the cache already cleared', async () => {
    const root = document.documentElement;
    root.style.setProperty('--faint', '#111111');
    expect(cssVar('--faint')).toBe('#111111');
    const seen: string[] = [];
    const off = subscribeTheme(() => seen.push(cssVar('--faint')));
    root.style.setProperty('--faint', '#222222');
    await settle();
    expect(seen).toEqual(['#222222']);
    // applyPrefs rewrites data-look every time, even unchanged, and that counts.
    root.dataset.look = 'cosy';
    await settle();
    expect(seen.length).toBe(2);
    off();
    root.dataset.theme = 'dark';
    await settle();
    expect(seen.length).toBe(2);
  });

  it('flushTheme makes a token written a moment ago readable at once', () => {
    const root = document.documentElement;
    root.style.setProperty('--flush', '#aaaaaa');
    expect(cssVar('--flush')).toBe('#aaaaaa');
    root.style.setProperty('--flush', '#bbbbbb');
    flushTheme();
    expect(cssVar('--flush')).toBe('#bbbbbb');
  });

  it('can be unsubscribed without breaking the others', async () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeTheme(a);
    const offB = subscribeTheme(b);
    offA();
    document.documentElement.dataset.theme = 'light';
    await settle();
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    offB();
  });

  it('reads a token once, then serves it from the cache until the theme changes', async () => {
    const root = document.documentElement;
    root.style.setProperty('--once', '#101010');
    const spy = vi.spyOn(window, 'getComputedStyle');
    expect(cssVar('--once')).toBe('#101010');
    expect(cssVar('--once')).toBe('#101010');
    expect(cssVar('--once')).toBe('#101010');
    expect(spy).toHaveBeenCalledTimes(1);
    // A theme pick (data-theme) and a live edit of a token (style) both clear it.
    root.dataset.theme = 'light';
    await settle();
    expect(cssVar('--once')).toBe('#101010');
    expect(spy).toHaveBeenCalledTimes(2);
    root.style.setProperty('--once', '#202020');
    await settle();
    expect(cssVar('--once')).toBe('#202020');
    expect(spy).toHaveBeenCalledTimes(3);
    spy.mockRestore();
  });

  it('gives each caller its own fallback for a token that is not set, and picks it up once it is', () => {
    const root = document.documentElement;
    root.style.removeProperty('--late');
    expect(cssVar('--late', '#111111')).toBe('#111111');
    expect(cssVar('--late', '#222222')).toBe('#222222');
    // The stylesheet arriving after the first read must not leave the fallback stuck.
    root.style.setProperty('--late', '#333333');
    expect(cssVar('--late', '#111111')).toBe('#333333');
  });
});
