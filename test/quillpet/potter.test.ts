// How Quill potters round his room, and above all that it doesn't read as a loop. The generator is seeded, so these
// are the same runs every time: if someone tunes the weights and a run starts to repeat, a number here says so.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLIPS, EXTRA_CLIPS, poseAt, resolveAnim } from '../../src/ui/mascot/timing';
import { DOINGS, MEMORY, pickNext, SPOT_X, seeded, startPotter, stepPotter, TRAVEL_MS, weights, type Doing, type Move, type PotterCtx } from '../../src/quillpet/potter';
import { FAKE_SHEET } from '../fixtures/quill-sheet';

const CALM: PotterCtx = { hasColours: true, sinceInput: 20_000 };

/** Ticks a second at a time for `seconds`, and gives back every move he made (the first one included). */
function simulate(seed: number, seconds: number, ctx: PotterCtx = CALM): { move: Move; at: number }[] {
  const rng = seeded(seed);
  let p = startPotter();
  const out = [{ move: p.move, at: 0 }];
  for (let t = 1; t <= seconds; t++) {
    const next = stepPotter(p, 1000, ctx, rng);
    if (next.move !== p.move) out.push({ move: next.move, at: t });
    p = next;
  }
  return out;
}

/** The first place a pattern of one to four moves repeats three times over in a row, or null. */
function repeatedPattern(seq: Doing[]): { k: number; from: number } | null {
  for (let k = 1; k <= 4; k++) {
    for (let i = 0; i + 3 * k <= seq.length; i++) {
      let same = 0;
      for (let j = 0; j < 2 * k; j++) if (seq[i + j] === seq[i + j + k]) same++;
      if (same === 2 * k) return { k, from: i };
    }
  }
  return null;
}

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const TEN_MINUTES = 600;

describe('what he fancies', () => {
  it('never picks what he just did, and fancies the things he did lately less', () => {
    const w = weights(['draw', 'wander', 'wander'], CALM);
    expect(w.wander).toBeUndefined();
    expect(w.draw!).toBeLessThan(weights([], CALM).draw!);
    expect(w.window).toBe(weights([], CALM).window);
  });

  it('only eats and admires pencils when he has tasted some colours', () => {
    const none = weights([], { hasColours: false, sinceInput: 0 });
    expect(none.eat).toBeUndefined();
    expect(none.admire).toBeUndefined();
    expect(Object.keys(none).length).toBeGreaterThanOrEqual(5);
    for (const seed of SEEDS) for (const { move } of simulate(seed, 300, { hasColours: false, sinceInput: 0 })) expect(['eat', 'admire']).not.toContain(move.doing);
  });

  it('fancies a nap more the quieter it has been, but never only a nap', () => {
    const busy = weights([], { hasColours: true, sinceInput: 2_000 }).nap!;
    const quiet = weights([], { hasColours: true, sinceInput: 45_000 }).nap!;
    expect(quiet).toBeGreaterThan(busy * 4);
    let naps = 0;
    let all = 0;
    for (const seed of SEEDS) {
      for (const { move } of simulate(seed, TEN_MINUTES, { hasColours: true, sinceInput: 30 * 24 * 3600 * 1000 })) {
        all++;
        if (move.doing === 'nap') naps++;
      }
    }
    expect(naps / all).toBeLessThan(0.3);
  });
});

describe('the clock', () => {
  it('stays on one thing until its time is up, then moves on', () => {
    const rng = seeded(3);
    let p = startPotter();
    const first = p.move;
    for (let i = 0; i < 4; i++) {
      p = stepPotter(p, 1000, CALM, rng);
      expect(p.move).toBe(first);
    }
    p = stepPotter(p, 1000, CALM, rng);
    expect(p.move).not.toBe(first);
  });

  it('keeps only a short memory, so nothing builds up however long it runs', () => {
    const rng = seeded(9);
    let p = startPotter();
    for (let i = 0; i < 5000; i++) p = stepPotter(p, 1000, CALM, rng);
    expect(p.history.length).toBeLessThanOrEqual(MEMORY);
  });

  it('every move lasts a whole number of seconds', () => {
    for (const seed of SEEDS) for (const { move } of simulate(seed, 200)) expect(move.ms % 1000).toBe(0);
  });

  it('a long time away changes nothing: the next tick is one second, not a catch-up', () => {
    const p = startPotter();
    const next = stepPotter(p, 1000, { hasColours: true, sinceInput: 90 * 24 * 3600 * 1000 }, seeded(1));
    expect(next.left).toBe(p.left - 1000);
    expect(next.move).toBe(p.move);
  });
});

describe('where he goes', () => {
  it('draws at his desk, eats at his bowl, sleeps on his cushion and looks out of the window', () => {
    const spots: Partial<Record<Doing, string>> = {};
    for (const seed of SEEDS) for (const { move } of simulate(seed, TEN_MINUTES)) if (['draw', 'eat', 'nap', 'window'].includes(move.doing)) spots[move.doing] = move.spot;
    expect(spots).toEqual({ draw: 'desk', eat: 'bowl', nap: 'bed', window: 'window' });
  });

  it('hops to get anywhere, and a wander always goes somewhere new', () => {
    for (const seed of SEEDS) {
      let at = startPotter().move.spot;
      for (const { move } of simulate(seed, TEN_MINUTES).slice(1)) {
        if (move.spot !== at) expect(move.beats[0]).toEqual({ anim: 'hop', hold: TRAVEL_MS });
        else expect(move.beats[0].anim === 'hop' && move.beats[0].hold === TRAVEL_MS).toBe(false);
        if (move.doing === 'wander') expect(move.spot).not.toBe(at);
        at = move.spot;
      }
    }
  });

  it('keeps every spot inside the room', () => {
    for (const x of Object.values(SPOT_X)) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('it does not read as a loop', () => {
  const runs = SEEDS.map((seed) => simulate(seed, TEN_MINUTES));

  it('never does the same thing twice running', () => {
    for (const run of runs) for (let i = 1; i < run.length; i++) expect(run[i].move.doing).not.toBe(run[i - 1].move.doing);
  });

  it('never repeats a pattern of one to four moves three times over', () => {
    for (const run of runs) expect(repeatedPattern(run.map((r) => r.move.doing))).toBeNull();
  });

  it('would notice a plain four-move loop, so the check above means something', () => {
    const loop: Doing[] = ['wander', 'draw', 'window', 'nap', 'wander', 'draw', 'window', 'nap', 'wander', 'draw', 'window', 'nap'];
    expect(repeatedPattern(loop)).toEqual({ k: 4, from: 0 });
    expect(repeatedPattern(['draw', 'rest', 'draw', 'rest', 'draw', 'rest'])).toEqual({ k: 2, from: 0 });
    expect(repeatedPattern(['draw', 'rest', 'draw', 'window', 'draw', 'rest', 'eat'])).toBeNull();
  });

  it('shows about six different things in a minute, never fewer than two, and nearly all of them in ten', () => {
    // A minute with a long nap and a long drawing in it can hold only two; that is a quiet minute, not a loop.
    const counts: number[] = [];
    for (const run of runs) {
      for (let from = 0; from + 60 <= TEN_MINUTES; from += 15) {
        // What's on show during the minute: the move already under way at its start, and every one that starts in it.
        const during = run.filter((r, i) => r.at < from + 60 && (run[i + 1]?.at ?? Infinity) > from).map((r) => r.move.doing);
        counts.push(new Set(during).size);
      }
      expect(new Set(run.map((r) => r.move.doing)).size).toBeGreaterThanOrEqual(7);
    }
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(2);
    expect(counts.filter((n) => n >= 3).length / counts.length).toBeGreaterThan(0.99);
    expect(counts.reduce((a, b) => a + b) / counts.length).toBeGreaterThan(5);
  });

  it('is not the same few sequences: nearly every run of three moves is new', () => {
    let seen = 0;
    let fresh = 0;
    for (const run of runs) {
      const trigrams = new Set<string>();
      const seq = run.map((r) => `${r.move.doing}@${r.move.spot}`);
      for (let i = 0; i + 3 <= seq.length; i++) {
        seen++;
        const t = seq.slice(i, i + 3).join('>');
        if (!trigrams.has(t)) fresh++;
        trigrams.add(t);
      }
    }
    expect(fresh / seen).toBeGreaterThan(0.9);
  });

  it('takes different lengths of time over the same thing', () => {
    for (const doing of ['draw', 'window', 'nap', 'wander'] as Doing[]) {
      const lengths = new Set(runs.flatMap((run) => run.filter((r) => r.move.doing === doing).map((r) => r.move.ms)));
      expect(lengths.size, doing).toBeGreaterThanOrEqual(4);
    }
  });

  it('does the same thing in more than one way', () => {
    const ways = (doing: Doing) => new Set(runs.flatMap((run) => run.filter((r) => r.move.doing === doing).map((r) => JSON.stringify(r.move.beats.map((b) => b.anim)))));
    expect(ways('window').size).toBeGreaterThanOrEqual(3);
    expect(ways('wander').size).toBeGreaterThanOrEqual(2);
    const naps = new Set(runs.flatMap((run) => run.filter((r) => r.move.doing === 'nap').map((r) => r.move.beats[r.move.beats.length - 1].anim)));
    expect(naps).toEqual(new Set(['sleep', 'deep-sleep']));
    const words = new Set(runs.flatMap((run) => run.map((r) => r.move.words)));
    expect(words.size).toBeGreaterThanOrEqual(12);
  });

  it('uses all five new clips, and every one of the doings he can do with no toy turns up', () => {
    const anims = new Set(runs.flatMap((run) => run.flatMap((r) => r.move.beats.map((b) => b.anim))));
    for (const c of EXTRA_CLIPS) expect(anims.has(c), c).toBe(true);
    expect(new Set(runs.flatMap((run) => run.map((r) => r.move.doing)))).toEqual(new Set(DOINGS.filter((d) => d !== 'play')));
  });
});

describe('playing with a toy of yours', () => {
  const WITH_TOY: PotterCtx = { ...CALM, hasToy: true };

  it('never plays when there is no toy, so there is nothing to play with', () => {
    expect(Object.keys(weights([], CALM))).not.toContain('play');
    expect(Object.keys(weights([], { ...CALM, hasToy: false }))).not.toContain('play');
    for (const seed of SEEDS) for (const { move } of simulate(seed, TEN_MINUTES)) expect(move.doing).not.toBe('play');
  });

  it('plays now and then when there is one, in the middle of the room where the toy lies, and every doing turns up', () => {
    const all = SEEDS.flatMap((seed) => simulate(seed, TEN_MINUTES, WITH_TOY));
    const plays = all.filter((r) => r.move.doing === 'play');
    expect(plays.length).toBeGreaterThan(0);
    for (const { move } of plays) expect(move.spot).toBe('middle');
    // Now and then, not all the time.
    expect(plays.length / all.length).toBeLessThan(0.3);
    expect(new Set(all.map((r) => r.move.doing))).toEqual(new Set(DOINGS));
  });

  it('is never twice in a row, like everything else he does', () => {
    for (const seed of SEEDS) {
      const run = simulate(seed, TEN_MINUTES, WITH_TOY);
      for (let i = 1; i < run.length; i++) expect(run[i].move.doing).not.toBe(run[i - 1].move.doing);
    }
  });
});

describe('what he plays', () => {
  it('only asks for clips that exist, and every one plays on a mascot that has drawn none of the extras', () => {
    const known = new Set<string>([...CLIPS, ...EXTRA_CLIPS]);
    for (const run of runs()) {
      for (const { move } of run) {
        for (const b of move.beats) {
          expect(known.has(b.anim)).toBe(true);
          expect(FAKE_SHEET.anims[resolveAnim(FAKE_SHEET, b.anim)]).toBeTruthy();
        }
        // And the whole script can be posed without a hitch.
        expect(poseAt(FAKE_SHEET, move.beats, 5_000).frame).toBeTruthy();
      }
    }
  });

  it('a clip a mascot has not drawn plays as its nearest ordinary one', () => {
    expect(resolveAnim(FAKE_SHEET, 'eat')).toBe('talk');
    expect(resolveAnim(FAKE_SHEET, 'deep-sleep')).toBe('sleep');
    expect(resolveAnim(FAKE_SHEET, 'hop')).toBe('cheer');
    expect(resolveAnim(FAKE_SHEET, 'holding')).toBe('draw');
    expect(resolveAnim(FAKE_SHEET, 'nuzzle')).toBe('idle');
  });
});

function runs() {
  return SEEDS.slice(0, 10).map((seed) => simulate(seed, TEN_MINUTES));
}

describe('pickNext', () => {
  it('always gives a move he can do from wherever he is', () => {
    const rng = seeded(77);
    for (let i = 0; i < 500; i++) {
      const from = (['bed', 'window', 'middle', 'desk', 'bowl'] as const)[i % 5];
      const m = pickNext(['rest'], from, CALM, rng);
      expect(m.beats.length).toBeGreaterThan(0);
      expect(m.ms).toBeGreaterThan(0);
    }
  });
});

describe('nothing gets worse for being left', () => {
  const read = (f: string) => readFileSync(join(__dirname, '..', '..', 'src', 'quillpet', f), 'utf8');

  it('pottering remembers nothing, shows nothing and tells nobody: no saved state, no toast, no notification, no clock of days', () => {
    for (const f of ['potter.ts', 'usePotter.ts']) {
      const src = read(f);
      expect(src, f).not.toMatch(/localStorage|petStore|tellQuill|toast\(|Notification|Date\.now|daysAway|closeness|streak/);
    }
  });

  it('his words about what he is doing are never about being left, missed or neglected', () => {
    const words = new Set(runs().flatMap((run) => run.map((r) => r.move.words.toLowerCase())));
    for (const w of words) expect(w).not.toMatch(/hungry|lonely|miss|sad|alone|waiting|neglect|where were you|again/);
  });
});
