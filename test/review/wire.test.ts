import { describe, expect, it } from 'vitest';
import { MAX_TEXT } from '../../src/notes/model';
import { MAX_REVIEWERS, POINTER_COLOURS, readFromReviewer, isToReviewer } from '../../src/review/wire';

const now = 1_700_000_000_000;

describe('reading what a reviewer sends', () => {
  it('has a colour for each of the four seats', () => {
    expect(MAX_REVIEWERS).toBe(4);
    expect(new Set(POINTER_COLOURS).size).toBe(4);
  });
  it('accepts only the closed list', () => {
    for (const t of ['patch', 'doc', 'save', 'open', 'command', 'update', 'undo', 'load']) expect(readFromReviewer({ t, patches: [], doc: {} }, now)).toBeNull();
    expect(readFromReviewer(null, now)).toBeNull();
    expect(readFromReviewer('hello', now)).toBeNull();
    expect(readFromReviewer({ t: 'hello' }, now)).toEqual({ t: 'hello' });
  });
  it('cleans a name, and falls back when nothing is left', () => {
    expect(readFromReviewer({ t: 'join', name: '  Sam‮ <script> https://x.com ', gid: 'abc' }, now)).toMatchObject({ t: 'join', name: expect.stringMatching(/^Sam/) });
    expect(readFromReviewer({ t: 'join', name: '​​', gid: 'abc' }, now)).toMatchObject({ name: 'Reviewer' });
    expect(readFromReviewer({ t: 'join', name: 'Sam', gid: '../../etc' }, now)).toBeNull();
    const long = readFromReviewer({ t: 'join', name: 'x'.repeat(500) + ' y', gid: 'g' }, now) as { name: string };
    expect(long.name.length).toBeLessThanOrEqual(24);
  });
  it('cleans a note, keeps links and emoji, and caps its length and its numbers', () => {
    const n = readFromReviewer({ t: 'note', id: 'a1', x: 10, y: 20, text: 'see https://example.com 👍‮ fine\u0000', frame: 3.4, sig: 's', extra: 'dropped', by: 'Mallory', at: 1 }, now) as Record<string, unknown>;
    expect(n.text).toBe('see https://example.com 👍 fine');
    expect(n.frame).toBe(3);
    expect(n.at).toBe(now);
    expect(n).not.toHaveProperty('extra');
    expect(n).not.toHaveProperty('by');
    const big = readFromReviewer({ t: 'note', id: 'a1', x: 0, y: 0, text: 'word '.repeat(5000) }, now) as { text: string };
    expect(Array.from(big.text).length).toBeLessThanOrEqual(MAX_TEXT);
    expect(readFromReviewer({ t: 'note', id: 'a1', x: 1e12, y: 0, text: 'hi' }, now)).toBeNull();
    expect(readFromReviewer({ t: 'note', id: 'a1', x: NaN, y: 0, text: 'hi' }, now)).toBeNull();
    expect(readFromReviewer({ t: 'note', id: 'a1', x: 0, y: 0, text: '   ' }, now)).toBeNull();
    expect(readFromReviewer({ t: 'note', id: 'bad id!', x: 0, y: 0, text: 'hi' }, now)).toBeNull();
  });
  it('reads marks through the file reader, with its caps, and never takes a name, a layer or a time from the peer', () => {
    const m = readFromReviewer({ t: 'mark', mark: { id: 'm1', kind: 'arrow', pts: [0, 0, 10, 10], by: 'Mallory', at: 5, layer: 'L', pin: 'layer', board: 'b' } }, now) as unknown as { mark: Record<string, unknown> };
    expect(m.mark).toEqual({ id: 'm1', kind: 'arrow', pts: [0, 0, 10, 10] });
    expect(readFromReviewer({ t: 'mark', mark: { id: 'm1', kind: 'scribble', pts: Array.from({ length: 9000 }, (_, i) => i) } }, now)).toBeNull();
    expect(readFromReviewer({ t: 'mark', mark: { id: 'm2', kind: 'text', pts: [1, 1], text: '‮hello\u0000' } }, now)).toMatchObject({ mark: { text: 'hello' } });
    expect(readFromReviewer({ t: 'mark', mark: { id: 'm3', kind: 'nope', pts: [1, 1] } }, now)).toBeNull();
    expect(readFromReviewer({ t: 'mark', mark: { id: 'm1', kind: 'arrow', pts: [0, 0, Infinity, 1] } }, now)).toBeNull();
  });
  it('reads a pointer, answers and ticks', () => {
    expect(readFromReviewer({ t: 'point', n: 3, x: 1, y: 2, off: true }, now)).toEqual({ t: 'point', n: 3, x: 1, y: 2, off: true });
    expect(readFromReviewer({ t: 'point', n: 3, x: 'a', y: 2 }, now)).toBeNull();
    expect(readFromReviewer({ t: 'reply', id: 'r1', to: 'a1', text: 'ok' }, now)).toEqual({ t: 'reply', id: 'r1', to: 'a1', text: 'ok', at: now });
    expect(readFromReviewer({ t: 'tick', id: 't1', to: 'a1', done: true }, now)).toEqual({ t: 'tick', id: 't1', to: 'a1', done: true });
    expect(readFromReviewer({ t: 'tick', id: 't1', to: 'a1', done: 'yes' }, now)).toBeNull();
  });
  it('knows the sharer\'s messages by their closed list too', () => {
    expect(isToReviewer({ t: 'patch' })).toBe(true);
    expect(isToReviewer({ t: 'shell' })).toBe(false);
  });
});
