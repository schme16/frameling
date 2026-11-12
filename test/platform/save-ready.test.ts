import { describe, expect, it } from 'vitest';
import { createSaveOffers, FRESH_CLICK_MS, isSafariLike, needsFreshClick, readyMessage } from '../../src/platform/saveReady';

const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IOS_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1';
const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const EDGE = `${CHROME} Edg/124.0`;
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0';

describe('which browsers hold a late download back', () => {
  it('Safari on Mac and iOS (including iOS Chrome, which is WebKit) do', () => {
    for (const ua of [SAFARI, IPHONE, IOS_CHROME]) expect(isSafariLike(ua)).toBe(true);
  });
  it('Chrome, Edge, Android and Firefox do not', () => {
    for (const ua of [CHROME, EDGE, ANDROID, FIREFOX, '']) expect(isSafariLike(ua)).toBe(false);
  });
});

describe('needing a fresh click', () => {
  it('only in Safari, and only when the last click was more than a second ago', () => {
    expect(needsFreshClick(true, 50)).toBe(false);
    expect(needsFreshClick(true, FRESH_CLICK_MS)).toBe(false);
    expect(needsFreshClick(true, FRESH_CLICK_MS + 1)).toBe(true);
    expect(needsFreshClick(true, 60_000)).toBe(true);
    expect(needsFreshClick(false, 60_000)).toBe(false);
    expect(needsFreshClick(false, Infinity)).toBe(false);
  });
  it('treats "never clicked" as too long ago', () => {
    expect(needsFreshClick(true, Infinity)).toBe(true);
    expect(needsFreshClick(true, NaN)).toBe(true);
  });
});

describe('the ready message', () => {
  it('names one file, counts several, and uses no em dashes', () => {
    expect(readyMessage(['walk.gif'])).toBe('Your file "walk.gif" is ready. Press Save to keep it.');
    expect(readyMessage(['a.png', 'b.png', 'c.png'])).toBe('Your 3 files are ready. Press Save to keep them.');
    expect(readyMessage(['a'])).not.toMatch(/—|–/);
  });
});

describe('waiting files', () => {
  const make = () => {
    let nextId = 1;
    const saved: string[] = [];
    const shown: { id: number; message: string; onSave: () => void }[] = [];
    const hidden: number[] = [];
    const offers = createSaveOffers({
      save: (name) => void saved.push(name),
      show: (message, onSave) => (shown.push({ id: nextId, message, onSave }), nextId++),
      hide: (id) => void hidden.push(id),
    });
    return { offers, saved, shown, hidden };
  };
  it('shows one message and saves nothing until Save is pressed', () => {
    const { offers, saved, shown } = make();
    offers.offer('a.gif', new Uint8Array(1));
    expect(shown).toHaveLength(1);
    expect(saved).toEqual([]);
    expect(offers.pending()).toBe(1);
    shown[0].onSave();
    expect(saved).toEqual(['a.gif']);
    expect(offers.pending()).toBe(0);
  });
  it('a second file replaces the message so one press saves both', () => {
    const { offers, saved, shown, hidden } = make();
    offers.offer('a.png', new Uint8Array(1));
    offers.offer('b.png', new Uint8Array(1));
    expect(hidden).toEqual([1]);
    expect(shown[1].message).toMatch(/2 files/);
    shown[1].onSave();
    expect(saved).toEqual(['a.png', 'b.png']);
  });
  it('saving twice does not download twice, and the command path reports how many there were', () => {
    const { offers, saved } = make();
    offers.offer('a.png', new Uint8Array(1));
    expect(offers.saveAll()).toBe(1);
    expect(offers.saveAll()).toBe(0);
    expect(saved).toEqual(['a.png']);
  });
  it('starts a fresh message for files that finish after a save', () => {
    const { offers, shown, saved } = make();
    offers.offer('a.png', new Uint8Array(1));
    shown[0].onSave();
    offers.offer('b.png', new Uint8Array(1));
    expect(shown).toHaveLength(2);
    expect(shown[1].message).toMatch(/"b.png"/);
    shown[1].onSave();
    expect(saved).toEqual(['a.png', 'b.png']);
  });
});
