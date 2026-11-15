// The jar's pure rules: cleaning what viewers wrote, the cap, repeats, picking, and what goes to storage.
import { describe, expect, it } from 'vitest';
import { cleanChatText } from '../../src/audience/cleanText';
import { cleanSign, SIGN_MAX } from '../../src/quillreacts/sign';
import { canAdd, cleanPrompt, DEFAULT_PACE_SECONDS, fromStored, JAR_MAX, pickSlip, PACE_CHOICES, paceLeft, paceMs, promptsFromText, PROMPT_MAX, sameWords, toStored, type Slip } from '../../src/promptjar/logic';
import { turnAway } from '../../src/promptjar/actions';

const slips = (...t: string[]): Slip[] => t.map((text, i) => ({ id: i + 1, text }));

describe('cleaning a prompt (the one shared cleaner)', () => {
  it('keeps plain words, from a string or a { text } body', () => {
    expect(cleanPrompt('a frog in a teacup')).toEqual({ text: 'a frog in a teacup' });
    expect(cleanPrompt({ text: '  a   castle\non a cloud ' })).toEqual({ text: 'a castle on a cloud' });
  });

  it('refuses rubbish: no letters or digits, wrong shapes, nothing at all', () => {
    for (const bad of ['', '   ', '!!!???', '...', '\u{1F600}\u{1F525}', '@someone', 'https://example.com/x', 'www.example.com', null, undefined, 42, [], {}, { text: 7 }, { name: 'x' }]) {
      expect(cleanPrompt(bad), String(bad)).toBeNull();
    }
  });

  it('strips links, @names, emoji, markup, control and text-direction characters', () => {
    expect(cleanPrompt('draw a cat www.spam.com now')).toEqual({ text: 'draw a cat now' });
    expect(cleanPrompt('a dragon @streamer_fan please')).toEqual({ text: 'a dragon please' });
    expect(cleanPrompt('a \u{1F600} frog')).toEqual({ text: 'a frog' });
    expect(cleanPrompt('<img src=x onerror=alert(1)>')!.text).not.toMatch(/[<>=]/);
    expect(cleanPrompt('a‮b⁦c\u0007d​e')).toEqual({ text: 'abcde' });
  });

  it('caps repeats and cuts to the length by whole characters', () => {
    expect(cleanPrompt('aaaaaaaaaaaaaaaa frog')!.text).toBe('aaa frog');
    expect(PROMPT_MAX).toBeLessThanOrEqual(80);
    expect(cleanPrompt('word '.repeat(500))!.text.length).toBeLessThanOrEqual(PROMPT_MAX);
    const wide = cleanPrompt('\u{20BB7}'.repeat(300) + ' end');
    expect(wide === null || Array.from(wide.text).length <= PROMPT_MAX).toBe(true);
  });

  it('is the same cleaner signs use, only cut to a different length', () => {
    const raw = 'a very long idea about a frog who lives in a teacup on top of a mountain of cheese and more';
    expect(cleanSign(raw)).toEqual(cleanChatText(raw, SIGN_MAX));
    expect(cleanPrompt(raw)).toEqual(cleanChatText(raw, PROMPT_MAX));
  });
});

describe('the cap and repeats', () => {
  it('holds up to the cap and turns the next one away', () => {
    const full = slips(...Array.from({ length: JAR_MAX }, (_, i) => `idea ${i}`));
    expect(canAdd(full, 'something new', full.length)).toBe('full');
    expect(canAdd(full.slice(1), 'something new', full.length - 1)).toBe('added');
    expect(JAR_MAX).toBeGreaterThan(0);
  });

  it('spots a repeat whatever the capitals and spacing, including the one in hand', () => {
    expect(sameWords('A Frog  in a teacup', 'a frog in a teacup')).toBe(true);
    expect(sameWords('a frog', 'a toad')).toBe(false);
    expect(canAdd(slips('A frog in a cup'), 'a FROG in  a cup', 1)).toBe('duplicate');
  });
});

describe('picking', () => {
  it('picks by a number from 0 to 1, never out of range, and nothing from an empty jar', () => {
    const s = slips('a', 'b', 'c');
    expect(pickSlip(s, 0)?.text).toBe('a');
    expect(pickSlip(s, 0.5)?.text).toBe('b');
    expect(pickSlip(s, 0.999)?.text).toBe('c');
    expect(pickSlip(s, 1)?.text).toBe('c');
    expect(pickSlip(s, -3)?.text).toBe('a');
    expect(pickSlip([], 0.5)).toBeNull();
  });

  it('splits a pasted list into one prompt a line, dropping blanks and rubbish', () => {
    expect(promptsFromText('a frog\n\n  \n!!!\r\na bear in a boat\nhttps://x.com')).toEqual(['a frog', 'a bear in a boat']);
  });
});

describe('what is stored', () => {
  it('is the words and nothing else', () => {
    expect(toStored(slips('a frog', 'a bear'))).toEqual(['a frog', 'a bear']);
    for (const s of toStored(slips('a frog'))) expect(typeof s).toBe('string');
  });

  it('is cleaned again on the way back, deduplicated and kept to the cap', () => {
    expect(fromStored(['a frog', 'A  FROG', 7, null, '<<<>>>', { text: 'x' }, 'a bear @someone'])).toEqual(['a frog', 'a bear']);
    expect(fromStored('nope')).toEqual([]);
    expect(fromStored(Array.from({ length: 500 }, (_, i) => `idea ${i}`))).toHaveLength(JAR_MAX);
  });
});

// A source guard: the folder only has the jar's own memory and one storage key. No network, no desktop, no logging, no
// document, and no words put into a toast.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
describe('the folder keeps to itself', () => {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/promptjar');
  const files = fs.readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
  it('has no network, desktop, logging, document or store import', () => {
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(text, f).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|console\.|\bdesktop\(|from '\.\.\/io|from '\.\.\/core\/store'|sendBeacon/);
    }
  });
  it('never puts a prompt in a toast', () => {
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const m of text.matchAll(/toast\(([^)]*)\)/g)) expect(m[1], `${f}: ${m[1]}`).not.toMatch(/\btext\b|\bhand\b|\bslips?\b|words/);
    }
  });
});

describe('the pause between prompts', () => {
  it('offers pauses from 1 to 30 seconds, with 3 as the usual', () => {
    expect([...PACE_CHOICES]).toEqual([1, 3, 8, 15, 30]);
    expect(DEFAULT_PACE_SECONDS).toBe(3);
    expect(PACE_CHOICES).toContain(DEFAULT_PACE_SECONDS);
  });

  it('turns an answer into milliseconds, and anything else into the usual pause', () => {
    expect(paceMs('1')).toBe(1000);
    expect(paceMs('30')).toBe(30000);
    for (const odd of [undefined, '', '0', '-5', '2', '999', 'soon', 'NaN']) expect(paceMs(odd), String(odd)).toBe(3000);
  });

  it('says how long is left, and 0 once it is over or when there was no last one', () => {
    expect(paceLeft(10_000, null, 3000)).toBe(0);
    expect(paceLeft(10_000, 9_000, 3000)).toBe(2000);
    expect(paceLeft(12_000, 9_000, 3000)).toBe(0);
    expect(paceLeft(20_000, 9_000, 3000)).toBe(0);
    // A clock that went backwards waits at most the pause.
    expect(paceLeft(5_000, 9_000, 3000)).toBe(3000);
  });

  it('one pause for the whole channel is the same for the 2nd and the 20th person: it only looks at when the last prompt went in', () => {
    expect(paceLeft(1_500, 1_000, 3000)).toBe(2500);
    expect(paceLeft(1_500, 1_000, 8000)).toBe(7500);
  });
});

describe('turning a prompt away', () => {
  const free = () => 'added' as const;
  it('lets one in when the jar has room and the pause is over', () => {
    expect(turnAway('a frog', 10_000, 5_000, 3000, free)).toBeNull();
    expect(turnAway('a frog', 10_000, null, 3000, free)).toBeNull();
  });
  it('says full before it says wait, because waiting will not help', () => {
    expect(turnAway('a frog', 10_000, 9_900, 3000, () => 'full')).toMatchObject({ detail: 'full', reason: 'invalid' });
  });
  it('says how long to wait, as a cooldown', () => {
    expect(turnAway('a frog', 10_000, 9_000, 3000, free)).toMatchObject({ detail: 'channel-wait', reason: 'cooldown', retryInMs: 2000 });
  });
  it('a repeat is not turned away: it is quietly ignored, as before', () => {
    expect(turnAway('a frog', 10_000, null, 3000, () => 'duplicate')).toBeNull();
  });
});
