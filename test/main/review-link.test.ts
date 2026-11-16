// The main process keeps a review link until the drawing window asks about it, and only the window asks.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (e: { sender: unknown }) => unknown>();
vi.mock('electron', () => ({ ipcMain: { handle: (c: string, f: (e: { sender: unknown }) => unknown) => handlers.set(c, f) } }));

import { makeReviewLinks } from '../../src/main/reviewLink';
import { WORDS } from '../../src/share/wordlist';

const code = WORDS.slice(40, 44).join('-');
const link = `frameling://review?code=${code}`;

function fakeWindow(loading = false) {
  const sent: string[] = [];
  const log: string[] = [];
  const wc = { isLoading: () => loading, send: (c: string) => sent.push(c) };
  return {
    sent,
    log,
    w: { isDestroyed: () => false, isMinimized: () => true, restore: () => log.push('restore'), show: () => log.push('show'), focus: () => log.push('focus'), webContents: wc } as never,
    wc,
  };
}

beforeEach(() => handlers.clear());

describe('a review link reaching the main process', () => {
  it('brings the window forward, tells it, and hands the code over once', () => {
    const f = fakeWindow();
    const links = makeReviewLinks({ window: () => f.w });
    expect(links.fromArgs(['/x/frameling', link])).toBe(true);
    expect(f.log).toEqual(['restore', 'show', 'focus']);
    expect(f.sent).toEqual(['review:link']);
    expect(links.take()).toBe(code);
    expect(links.take()).toBeNull();
  });

  it('keeps the code for a window that is still opening, without showing it early', () => {
    const f = fakeWindow(true);
    const links = makeReviewLinks({ window: () => f.w });
    expect(links.fromUrl(link)).toBe(true);
    expect(f.sent).toEqual([]);
    expect(f.log).toEqual([]);
    expect(links.take()).toBe(code);
  });

  it('keeps it when there is no window yet (the Mac hands links over before one exists)', () => {
    const links = makeReviewLinks({ window: () => null });
    expect(links.fromUrl(link)).toBe(true);
    expect(links.take()).toBe(code);
  });

  it('ignores everything that is not a good review link', () => {
    const f = fakeWindow();
    const links = makeReviewLinks({ window: () => f.w });
    expect(links.fromUrl('frameling://open?path=/a.frameling')).toBe(false);
    expect(links.fromUrl('frameling://review?code=one-two')).toBe(false);
    expect(links.fromArgs(['--inspect', '/a.frameling'])).toBe(false);
    expect(links.fromUrl(undefined as unknown as string)).toBe(false);
    expect(f.sent).toEqual([]);
    expect(links.take()).toBeNull();
  });

  it('a second link replaces the first', () => {
    const links = makeReviewLinks({ window: () => null });
    links.fromUrl(link);
    const other = WORDS.slice(50, 54).join('-');
    links.fromUrl(`frameling://review?code=${other}`);
    expect(links.take()).toBe(other);
  });

  it('only the drawing window can ask for it', () => {
    const f = fakeWindow();
    const links = makeReviewLinks({ window: () => f.w });
    links.fromUrl(link);
    const ask = handlers.get('review:takeLink')!;
    expect(ask({ sender: {} })).toBeNull();
    expect(ask({ sender: f.wc })).toBe(code);
  });
});
