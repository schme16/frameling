// @vitest-environment jsdom
// Open recent with pictures: the rows appear at once, each picture fills in as it is read, a drawing with none keeps
// the folder icon in the same box, and a file that has gone says so and can be removed.
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRecentDialog } from '../../src/io/RecentDialog';
import type { RecentFile, RecentPreview } from '../../src/preload/api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const files: RecentFile[] = [
  { path: '/art/ball.frameling', name: 'ball', openedAt: Date.now() },
  { path: '/art/old.frameling', name: 'old', openedAt: Date.now() - 86400000 * 3 },
  { path: '/gone/lost.frameling', name: 'lost', openedAt: Date.now() - 86400000 * 5, missing: true },
];

let resolvers: Record<string, (p: RecentPreview) => void> = {};
let removed: string[] = [];
let asked: string[] = [];
let close: () => void = () => {};

beforeEach(() => {
  resolvers = {};
  removed = [];
  asked = [];
  (window as unknown as { frameling: unknown }).frameling = {
    versions: { app: 'test', electron: '', chrome: '' },
    files: {},
    recent: {
      list: async () => files,
      remove: async (p: string) => void removed.push(p),
      clear: async () => undefined,
      add: async () => undefined,
      preview: (p: string) => {
        asked.push(p);
        return new Promise<RecentPreview>((res) => (resolvers[p] = res));
      },
    },
  };
});
afterEach(() => act(async () => close()));

const rows = () => [...document.querySelectorAll<HTMLLIElement>('.io-recent li')];

async function show() {
  await act(async () => void (close = openRecentDialogClose()));
  await act(async () => undefined);
}
const openRecentDialogClose = () => {
  openRecentDialog();
  return () => document.querySelector<HTMLElement>('.io-backdrop')?.remove();
};

describe('Open recent', () => {
  it('shows every row at once, with the picture box already there, before any picture is read', async () => {
    await show();
    expect(rows().map((r) => r.querySelector('b')!.textContent)).toEqual(['ball', 'old', 'lost']);
    for (const r of rows()) expect(r.querySelector('.io-pic'), 'the box is there from the start').not.toBeNull();
    expect(document.querySelectorAll('.io-pic img').length).toBe(0);
  });

  it('fills each picture in as it is read, and a drawing with none keeps the icon in the same box', async () => {
    await show();
    await act(async () => resolvers['/art/ball.frameling']({ state: 'picture', url: 'data:image/png;base64,AAAA' }));
    expect(rows()[0].querySelector('.io-pic img')!.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    // The second is asked for only after the first came in, so the list never waits on the slowest file.
    await act(async () => resolvers['/art/old.frameling']({ state: 'none' }));
    expect(rows()[1].querySelector('.io-pic img')).toBeNull();
    expect(rows()[1].querySelector('.io-pic svg')).not.toBeNull();
    expect(rows()[0].querySelector('.io-pic')!.getAttribute('style')).toBe(rows()[1].querySelector('.io-pic')!.getAttribute('style'));
  });

  it('a file that has gone is not asked about, says so, cannot be opened, and can be removed', async () => {
    await show();
    await act(async () => resolvers['/art/ball.frameling']({ state: 'none' }));
    await act(async () => resolvers['/art/old.frameling']({ state: 'none' }));
    expect(asked).not.toContain('/gone/lost.frameling');
    const lost = rows()[2];
    expect(lost.textContent).toContain("Can't find this file");
    expect((lost.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => void lost.querySelector<HTMLButtonElement>('.io-recent-remove')!.click());
    expect(removed).toEqual(['/gone/lost.frameling']);
    expect(rows().length).toBe(2);
  });

  it('the first row that can be opened has the focus', async () => {
    await show();
    expect(rows()[0].querySelector('button')!.hasAttribute('data-autofocus')).toBe(true);
  });
});
