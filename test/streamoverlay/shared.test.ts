// What the overlay may carry: the one gate every word and number goes through, before it is served and again before it is drawn.
import { describe, expect, it } from 'vitest';
import { cleanOverlayState, emptyOverlay, liveOverlay, overlayIsEmpty, overlayText, type OverlayState } from '../../src/shared/streamOverlay';
import { privateWordsOf, withoutWords } from '../../src/main/overlayHub';

const NOW = 1_000_000_000_000;
const good = {
  theme: { dark: true, text: '#f4efe6', raised: '#322d43', accent: '#9b7bff', line: '#4a4360' },
  quill: { id: 3, anim: 'cheer', words: 'Chat is cheering for you!', sign: false, until: NOW + 4000 },
  banner: { text: 'Draw with your other hand.', startedAt: NOW, endsAt: NOW + 30_000 },
  countdown: { text: 'Beat the clock', endsAt: NOW + 20_000, over: false, until: NOW + 22_500 },
  chips: [{ label: 'Flipped view', endsAt: NOW + 10_000 }],
  prompt: { id: 9, text: 'a frog in a teacup' },
  vote: { status: 'open', question: 'What next?', options: [{ label: 'Hat', votes: 3 }, { label: 'Cape', votes: 1 }], endsAt: NOW + 60_000, winner: -1 },
};

describe('overlayText', () => {
  it('leaves plain words alone', () => {
    expect(overlayText('Draw the next thing with your eyes closed.')).toBe('Draw the next thing with your eyes closed.');
  });
  it('takes out file paths, whatever the stream-safe switch says', () => {
    for (const t of ['saved to /home/shane/art/secret.frameling today', 'C:\\Users\\Shane\\Pictures\\me.png', '"/home/shane/My Art/x.png" done', '~/art/y.png', 'file:///home/shane/z.png']) {
      const out = overlayText(t);
      expect(out, t).not.toMatch(/shane|Users|home|art\//i);
    }
  });
  it('takes out web addresses, @names, e-mail addresses and keys', () => {
    expect(overlayText('go to https://evil.example/x now')).not.toContain('evil');
    expect(overlayText('see www.example.com/page')).not.toContain('example');
    expect(overlayText('thanks @SomeViewer123 for this')).not.toContain('SomeViewer');
    expect(overlayText('mail me at jo.bloggs@example.org please')).not.toMatch(/bloggs|example/);
    expect(overlayText('key fld_AbCdEfGhIjKlMnOpQrStUvWx')).not.toContain('fld_');
    expect(overlayText('token ov_AbCdEfGhIjKlMnOpQrStUvWxYz012345')).not.toContain('ov_');
    expect(overlayText('x ' + 'a1B2'.repeat(10))).toBe('x');
  });
  it('drops control, zero-width and direction-changing characters, and tidies spaces', () => {
    expect(overlayText('a\u0000b\u200bc\u202ed   e\n\tf')).toBe('abcd e f');
  });
  it('cuts to the length asked for, and says nothing for what is not words', () => {
    expect(overlayText('x'.repeat(500), 10)).toBe('');
    expect(overlayText('word '.repeat(100), 12).length).toBeLessThanOrEqual(12);
    for (const v of [undefined, null, 5, {}, [], true]) expect(overlayText(v)).toBe('');
  });
});

describe('cleanOverlayState', () => {
  it('lets a good state through whole', () => {
    expect(cleanOverlayState(good, NOW)).toEqual(good);
  });
  it('gives nothing for rubbish', () => {
    for (const v of [null, undefined, 'x', 5, [], { quill: 'x' }]) expect(overlayIsEmpty(cleanOverlayState(v, NOW))).toBe(true);
  });
  it('never reads a field it does not know, so nothing can ride along', () => {
    const smuggled = { ...good, path: '/home/shane/x.frameling', author: 'Shane Gadsby', key: 'fld_x', jar: ['secret idea'], slips: [{ text: 'secret' }], quill: { ...good.quill, owner: 'Shane', file: '/home/shane/q' } };
    const out = JSON.stringify(cleanOverlayState(smuggled, NOW));
    expect(out).not.toMatch(/shane|Gadsby|fld_|secret|jar|slips|owner|file|path|author/i);
  });
  it('scrubs the words inside each piece too', () => {
    const dirty = cleanOverlayState({ ...good, quill: { ...good.quill, words: 'see /home/shane/a.png @bob' }, banner: { ...good.banner, text: 'at https://x.example/y' }, prompt: { id: 1, text: 'mail a@b.com' }, vote: { ...good.vote, question: 'C:\\Users\\Shane\\x.png' } }, NOW);
    expect(JSON.stringify(dirty)).not.toMatch(/shane|bob|x\.example|a@b|Users/i);
  });
  it('drops a piece that is wrong, whole, instead of repairing it', () => {
    const s = cleanOverlayState({ ...good, banner: { text: 'x', startedAt: 'now', endsAt: NOW + 5 }, countdown: { text: 'x', endsAt: Infinity, over: false }, vote: { status: 'open', question: 'q', options: [{ label: 'only one', votes: 1 }], endsAt: null } }, NOW);
    expect(s.banner).toBeNull();
    expect(s.countdown).toBeNull();
    expect(s.vote).toBeNull();
  });
  it('drops times that are a day or more away, and colours that are not plain hex', () => {
    expect(cleanOverlayState({ ...good, banner: { ...good.banner, endsAt: NOW + 3 * 24 * 3600 * 1000 } }, NOW).banner).toBeNull();
    expect(cleanOverlayState({ ...good, theme: { ...good.theme, accent: 'url(http://x)' } }, NOW).theme).toBeNull();
  });
  it('holds counts to sane numbers and a winner to a real option', () => {
    const v = cleanOverlayState({ ...good, vote: { ...good.vote, status: 'ended', winner: 7, options: [{ label: 'A', votes: -4 }, { label: 'B', votes: 1e12 }] } }, NOW).vote!;
    expect(v.winner).toBe(-1);
    expect(v.options.map((o) => o.votes)).toEqual([0, 1_000_000]);
  });
  it('turns an anim it does not know into a cheer, and keeps at most three chips', () => {
    const s = cleanOverlayState({ ...good, quill: { ...good.quill, anim: 'rm -rf' }, chips: Array.from({ length: 8 }, () => good.chips[0]) }, NOW);
    expect(s.quill!.anim).toBe('cheer');
    expect(s.chips).toHaveLength(3);
  });
});

describe('liveOverlay and overlayIsEmpty', () => {
  const s = cleanOverlayState(good, NOW);
  it('keeps what is still going', () => {
    expect(overlayIsEmpty(liveOverlay(s, NOW + 1000))).toBe(false);
  });
  it('drops each timed piece when its time is up, and keeps the prompt and vote until told otherwise', () => {
    const later = liveOverlay(s, NOW + 31_000);
    expect(later).toMatchObject({ quill: null, banner: null, countdown: null, chips: [] });
    expect(later.prompt).not.toBeNull();
    expect(later.vote).not.toBeNull();
    expect(overlayIsEmpty({ ...later, prompt: null, vote: null })).toBe(true);
  });
  it('does not count the theme as something happening', () => {
    expect(overlayIsEmpty({ ...emptyOverlay(), theme: s.theme })).toBe(true);
  });
});

describe('words that must never appear, whatever the app says', () => {
  it('takes the computer user name and host name out of every field', () => {
    const words = privateWordsOf('shanegadsby', 'studio-pc.local');
    expect(words).toEqual(['shanegadsby', 'studio-pc']);
    const state: OverlayState = { ...emptyOverlay(), prompt: { id: 1, text: 'Draw ShaneGadsby as a frog' }, banner: { text: 'from studio-pc!', startedAt: NOW, endsAt: NOW + 1000 } };
    expect(JSON.stringify(withoutWords(state, words))).not.toMatch(/shanegadsby|studio-pc/i);
  });
  it('ignores very short names, which are ordinary words', () => {
    expect(privateWordsOf('al', 'pc')).toEqual([]);
  });
});
