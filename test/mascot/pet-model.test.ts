// Quill the pet: what he remembers, and the promise that he never gets worse off.
import { describe, expect, it } from 'vitest';
import {
  apply,
  dayKey,
  daysBetween,
  FRESH_PET,
  letGo,
  markSeen,
  MAX_COLOURS,
  MAX_THINGS,
  MOOD_WORDS,
  moodNow,
  nextStage,
  NO_NOW,
  stageOf,
  stageProgress,
  STAGES,
  type DayCount,
  type PetEvent,
  type PetState,
  type PetThing,
} from '../../src/ui/mascot/pet/model';

const AT = new Date(2026, 10, 13, 10, 0, 0).getTime();
const day = 86400000;
const thing = (id: string): PetThing => ({ id, name: `Drawing ${id}`, picture: 'data:image/png;base64,x', givenAt: AT });

/** Plays a run of events through, keeping the day's tally like the store does. */
function run(evs: PetEvent[], at = AT, from: PetState = FRESH_PET): PetState {
  let pet = from;
  let count: DayCount = {};
  for (const ev of evs) ({ pet, count } = apply(pet, count, ev, at));
  return pet;
}

describe('what Quill remembers', () => {
  it('starts the day you meet, and counts that day', () => {
    const pet = run([{ kind: 'visited' }]);
    expect(pet.metAt).toBe(AT);
    expect(pet.days).toBe(1);
    expect(pet.lastDay).toBe(dayKey(AT));
    expect(pet.closeness).toBe(3);
  });

  it('counts a day once, however long you stay', () => {
    let pet = run([{ kind: 'visited' }, { kind: 'drew' }, { kind: 'drew' }]);
    expect(pet.days).toBe(1);
    pet = run([{ kind: 'drew' }], AT + 6 * 3600000, pet);
    expect(pet.days).toBe(1);
  });

  it('counts the next day as a new one, and the caps start again', () => {
    let pet = run(Array(60).fill({ kind: 'drew' }));
    const first = pet.closeness;
    expect(first).toBe(40); // the day's drawing is worth 40 at most, not 60
    pet = run(Array(60).fill({ kind: 'drew' }), AT + day, pet);
    expect(pet.days).toBe(2);
    expect(pet.closeness).toBe(first + 40);
  });

  it('keeps the things you give him, newest last, without repeats', () => {
    let pet = run([{ kind: 'gave', thing: thing('a') }, { kind: 'gave', thing: thing('b') }]);
    expect(pet.things.map((t) => t.id)).toEqual(['a', 'b']);
    pet = run([{ kind: 'gave', thing: { ...thing('a'), name: 'Renamed' } }], AT, pet);
    expect(pet.things.map((t) => t.id)).toEqual(['b', 'a']);
    expect(pet.things[1].name).toBe('Renamed');
  });

  it('keeps only so many things and colours, dropping the oldest', () => {
    const pet = run([
      ...Array.from({ length: MAX_THINGS + 5 }, (_, i) => ({ kind: 'gave', thing: thing(`t${i}`) }) as PetEvent),
      ...Array.from({ length: MAX_COLOURS + 4 }, (_, i) => ({ kind: 'fed', colour: `#0000${String(i).padStart(2, '0')}` }) as PetEvent),
    ]);
    expect(pet.things).toHaveLength(MAX_THINGS);
    expect(pet.things[0].id).toBe('t5');
    expect(pet.colours).toHaveLength(MAX_COLOURS);
  });

  it('treats the same colour twice as the same colour, whatever its case', () => {
    const pet = run([{ kind: 'fed', colour: '#FFAA00' }, { kind: 'fed', colour: '#ffaa00' }]);
    expect(pet.colours).toEqual(['#ffaa00']);
  });

  it('makes a fuss of a moment once', () => {
    const once = markSeen(FRESH_PET, 'first-drawing');
    expect(markSeen(once, 'first-drawing')).toBe(once);
    expect(once.seen).toEqual(['first-drawing']);
  });
});

describe('Quill never gets worse off', () => {
  const every: PetEvent[] = [
    { kind: 'drew' },
    { kind: 'played' },
    { kind: 'finished' },
    { kind: 'quest' },
    { kind: 'petted' },
    { kind: 'gave', thing: thing('x') },
    { kind: 'fed', colour: '#ff0000' },
    { kind: 'visited' },
  ];

  it('never lowers closeness, whatever happens and whenever it happens', () => {
    let pet: PetState = FRESH_PET;
    let count: DayCount = {};
    let at = AT;
    for (let i = 0; i < 200; i++) {
      const ev = every[i % every.length];
      // Jump about in time, including long gaps away.
      at += [0, 1000, 60000, day, 30 * day, 400 * day][i % 6];
      const before = pet.closeness;
      ({ pet, count } = apply(pet, count, ev, at));
      expect(pet.closeness).toBeGreaterThanOrEqual(before);
    }
  });

  it('has no mood that is unhappy, however long you have been away', () => {
    for (const daysAwayValue of [0, 1, 7, 30, 365, 10000]) {
      for (const sinceInput of [0, 5000, 30000, 120000, 600000]) {
        const { mood } = moodNow({ ...NO_NOW, daysAway: daysAwayValue, sinceInput });
        expect(Object.keys(MOOD_WORDS)).toContain(mood);
        expect(['asleep', 'sleepy', 'cosy', 'curious', 'happy', 'excited', 'proud']).toContain(mood);
      }
    }
  });

  it('is pleased to see you after a break, not sulky', () => {
    expect(moodNow({ ...NO_NOW, daysAway: 60, sinceInput: 500 })).toEqual({ mood: 'excited', anim: 'wave' });
  });

  it('only ever forgets a thing because you asked', () => {
    const pet = run([{ kind: 'gave', thing: thing('a') }, { kind: 'gave', thing: thing('b') }]);
    expect(letGo(pet, 'a').things.map((t) => t.id)).toEqual(['b']);
    expect(letGo(pet, 'nope').things).toHaveLength(2);
  });
});

describe('how well you know each other', () => {
  it('starts at Just met and climbs through the list', () => {
    expect(stageOf(0).id).toBe('met');
    for (const s of STAGES) expect(stageOf(s.at).id).toBe(s.id);
    expect(stageOf(STAGES[2].at - 1).id).toBe(STAGES[1].id);
    expect(stageOf(999999).id).toBe(STAGES[STAGES.length - 1].id);
  });

  it('says what is next and how far there is to go, and nothing once you are as close as it gets', () => {
    expect(nextStage(0)).toEqual({ stage: STAGES[1], toGo: STAGES[1].at });
    expect(nextStage(STAGES[STAGES.length - 1].at)).toBeNull();
    expect(stageProgress(STAGES[STAGES.length - 1].at)).toBe(1);
    expect(stageProgress(0)).toBe(0);
    expect(stageProgress(STAGES[1].at / 2)).toBeCloseTo(0.5, 5);
  });

  it('keeps its steps in order', () => {
    for (let i = 1; i < STAGES.length; i++) expect(STAGES[i].at).toBeGreaterThan(STAGES[i - 1].at);
  });
});

describe('how he is feeling', () => {
  it('is proud when you finish something, whatever else is going on', () => {
    expect(moodNow({ ...NO_NOW, justFinished: true, sinceInput: 600000 }).mood).toBe('proud');
  });

  it('draws along while you draw, and wonders what you are up to when you stop', () => {
    expect(moodNow({ ...NO_NOW, sinceEdit: 1000 })).toEqual({ mood: 'happy', anim: 'draw' });
    expect(moodNow({ ...NO_NOW, sinceEdit: 30000 }).mood).toBe('curious');
  });

  it('dozes off when nothing happens for a while, and is asleep after a few minutes', () => {
    expect(moodNow({ ...NO_NOW, sinceInput: 90000 }).mood).toBe('sleepy');
    expect(moodNow({ ...NO_NOW, sinceInput: 200000 })).toEqual({ mood: 'asleep', anim: 'sleep' });
  });

  it('has words for every mood', () => {
    const moods = new Set<string>();
    for (const sinceInput of [0, 65000, 200000]) {
      for (const sinceEdit of [1000, 30000, Infinity]) {
        for (const extra of [{}, { playing: true }, { justFinished: true }, { justFussed: true }, { daysAway: 3 }]) {
          moods.add(moodNow({ ...NO_NOW, sinceInput, sinceEdit, ...extra }).mood);
        }
      }
    }
    expect([...moods].sort()).toEqual(Object.keys(MOOD_WORDS).sort());
  });
});

describe('days', () => {
  it('counts whole days between two instants, by the day they fall on', () => {
    expect(daysBetween(0, AT)).toBe(0);
    expect(daysBetween(AT, AT)).toBe(0);
    expect(daysBetween(AT, AT - day)).toBe(0);
    expect(daysBetween(AT, AT + day)).toBe(1);
    expect(daysBetween(AT, AT + 7 * day + 3600000)).toBe(7);
  });

  it('writes a day the way a person would', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 30).getTime())).toBe('2026-01-05');
  });
});
