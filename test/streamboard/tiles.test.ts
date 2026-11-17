import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QUIET, STOP_COMMAND, TILE_IDS, TILES, tileById, type Situation } from '../../src/streamboard/tiles';

const at = (over: Partial<Situation>): Situation => ({ ...QUIET, ...over });
const SITUATIONS: Situation[] = [
  QUIET,
  at({ vote: 'open', voteTotal: 1 }),
  at({ vote: 'result' }),
  at({ guess: 'open', guessPlayers: 3, hintsLeft: 2 }),
  at({ guess: 'result' }),
  at({ jarCount: 4, jarHand: true }),
  at({ audienceOn: true, drawingAllowed: true, waiting: 5, daresGoing: true, penModOn: true, streamSafe: true, captureOpen: true, asks: true }),
];
const face = (id: string, s: Situation) => tileById(id)!.face(s);

describe('the button set', () => {
  it('has unique ids and a plain name and line for each', () => {
    expect(new Set(TILE_IDS).size).toBe(TILES.length);
    for (const t of TILES) {
      expect(t.name.length).toBeGreaterThan(2);
      expect(t.about.length).toBeGreaterThan(10);
    }
  });
  it('keeps to the house voice: no em dashes', () => {
    for (const t of TILES) for (const s of SITUATIONS) {
      const f = t.face(s);
      for (const text of [t.name, t.about, f.label, f.caption]) expect(text).not.toMatch(/—/);
    }
  });
  it('every command a button can run is a real command id somewhere in the source', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(n) && !p.replace(/\\/g, '/').includes('/streamboard/')) files.push(p);
      }
    };
    walk('src');
    const source = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    const ids = new Set<string>([STOP_COMMAND]);
    for (const t of TILES) for (const s of SITUATIONS) ids.add(t.face(s).command);
    for (const id of ids) expect(source, id).toContain(`id: '${id}'`);
  });
  it('never takes a button anywhere but a command: no face holds a function or a secret', () => {
    for (const t of TILES) for (const s of SITUATIONS) expect(JSON.parse(JSON.stringify(t.face(s)))).toEqual(t.face(s));
  });
});

describe('the buttons that follow the stream', () => {
  it('the vote button starts, ends, then puts the result away', () => {
    expect(face('vote', QUIET)).toMatchObject({ command: 'votes.start', needsWindow: true });
    expect(face('vote', at({ vote: 'open', voteTotal: 14 }))).toMatchObject({ command: 'votes.end', caption: '14 votes in', needsWindow: false });
    expect(face('vote', at({ vote: 'open', voteTotal: 1 })).caption).toBe('1 vote in');
    expect(face('vote', at({ vote: 'result' })).command).toBe('votes.close');
  });
  it('the guessing button starts, reveals, then puts the result away, and never shows the word', () => {
    expect(face('guess', QUIET)).toMatchObject({ command: 'guess.start', needsWindow: true });
    expect(face('guess', at({ guess: 'open', guessPlayers: 0 }))).toMatchObject({ command: 'guess.end', caption: 'Nobody has guessed yet' });
    expect(face('guess', at({ guess: 'open', guessPlayers: 1 })).caption).toBe('1 person guessing');
    expect(face('guess', at({ guess: 'open', guessPlayers: 5 })).caption).toBe('5 people guessing');
    expect(face('guess', at({ guess: 'result' })).command).toBe('guess.close');
  });
  it('the hint button counts what is left only while a round runs', () => {
    expect(face('hint', at({ guess: 'open', hintsLeft: 2 })).caption).toBe('2 left');
    expect(face('hint', QUIET).caption).toBe('');
  });
  it('the jar button says pull another once one is in hand, and counts the jar', () => {
    expect(face('jar', at({ jarCount: 3 }))).toMatchObject({ label: 'Pull a prompt', caption: '3 in the jar' });
    expect(face('jar', at({ jarCount: 3, jarHand: true })).label).toBe('Pull another prompt');
  });
  it('the switches show on or off, and only they do', () => {
    for (const id of ['audience', 'interrupt', 'safe', 'capture']) {
      expect(face(id, QUIET).on, id).toBe(false);
      expect(face(id, at({ audienceOn: true, drawingAllowed: true, streamSafe: true, captureOpen: true })).on, id).toBe(true);
    }
    for (const t of TILES) if (t.tone === 'action') expect(t.face(QUIET).on, t.id).toBeNull();
  });
  it('the audience button says the first-time question will be asked, only when turning on', () => {
    expect(face('audience', at({ asks: true })).asks).toBe(true);
    expect(face('audience', at({ asks: true, audienceOn: true })).asks).toBe(false);
    expect(face('audience', QUIET).asks).toBe(false);
  });
  it('the queue button says how many are waiting', () => {
    expect(face('queue', at({ waiting: 4 })).caption).toBe('4 waiting');
    expect(face('queue', QUIET).caption).toBe('Nothing waiting');
  });
  it('only the two setup buttons ask to bring the drawing window forward', () => {
    const needing = TILES.filter((t) => SITUATIONS.some((s) => t.face(s).needsWindow)).map((t) => t.id);
    expect(needing.sort()).toEqual(['guess', 'vote']);
  });
});
