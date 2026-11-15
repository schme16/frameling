// What he got up to while you were out, and what he remembers. These tests are about the promise, not the code:
// coming back is only ever good news, and nothing here can be read as how long you were gone.
import { describe, expect, it } from 'vitest';
import { ABSENCE_WORDS } from './absence-words';
import data from '../../src/ui/mascot/lines.json';
import { FRESH_PET, type PetState, type PetThing } from '../../src/quillpet/model';
import { readPet, PET_KEY } from '../../src/quillpet/store';
import { seeded } from '../../src/quillpet/potter';
import {
  comeBack,
  doodleUrl,
  howMany,
  latelyShowing,
  markLatelySeen,
  MOST_THINGS,
  RARE_AFTER,
  readLately,
  SLEPT_PLACE,
  sleptWords,
  TOY_PLACE,
  WAYS,
  whatHeDid,
  whenGiven,
  type HappeningKind,
} from '../../src/quillpet/whileAway';

const THING = (id: string, givenAt: number): PetThing => ({ id, name: `Drawing ${id}`, picture: 'data:image/png;base64,AA', givenAt });
const DAY = 86400000;
const AT = new Date(2026, 10, 15, 12).getTime();

const EMPTY: PetState = { ...FRESH_PET, metAt: AT - 100 * DAY, lastDay: '2026-11-01' };
const WITH_THINGS: PetState = { ...EMPTY, things: [THING('a', AT - 40 * DAY), THING('b', AT - 5 * DAY)] };
const WITH_ALL: PetState = { ...WITH_THINGS, colours: ['#ff0000', '#00aa44', '#3366ff'] };
const PETS = [EMPTY, WITH_THINGS, WITH_ALL];
const GAPS = [1, 2, 3, 5, 9, 10, 20, 21, 30, 90, 365, 4000];

/** Every kind of thing he can do. Each is a nice one: there is no sad member of this list, so none can be picked. */
const NICE: HappeningKind[] = ['drew', 'moved', 'slept', 'watched', 'sorted', 'found', 'remembered'];

describe('how much he had time for', () => {
  it('only ever goes up with a longer break, and tops out', () => {
    let last = 0;
    for (let d = 0; d <= 5000; d++) {
      const n = howMany(d);
      expect(n).toBeGreaterThanOrEqual(last);
      expect(n).toBeLessThanOrEqual(MOST_THINGS);
      last = n;
    }
    expect(howMany(0)).toBe(0);
    expect(howMany(1)).toBe(1);
    expect(howMany(RARE_AFTER)).toBe(MOST_THINGS);
    expect(howMany(NaN)).toBe(0);
    expect(howMany(-3)).toBe(0);
  });

  it('gives a longer break more to come back to, never less, for any Quill and any luck', () => {
    for (const pet of PETS) {
      for (let seed = 1; seed <= 60; seed++) {
        let last = 0;
        for (const gap of GAPS) {
          const did = whatHeDid(pet, gap, seeded(seed));
          expect(did.length, `gap ${gap}`).toBeGreaterThanOrEqual(last);
          expect(did.length).toBe(howMany(gap));
          last = did.length;
        }
      }
    }
  });

  it('a brand new Quill has as much to show as one with a full shelf', () => {
    for (const gap of GAPS) expect(whatHeDid(EMPTY, gap, seeded(3)).length).toBe(whatHeDid(WITH_ALL, gap, seeded(3)).length);
  });

  it('every thing is a nice one, never repeats, and only uses what he actually has', () => {
    for (const pet of PETS) {
      for (let seed = 1; seed <= 100; seed++) {
        for (const gap of GAPS) {
          const did = whatHeDid(pet, gap, seeded(seed));
          const kinds = did.map((h) => h.kind);
          expect(new Set(kinds).size).toBe(kinds.length);
          for (const h of did) {
            expect(NICE).toContain(h.kind);
            expect(h.v).toBeGreaterThanOrEqual(0);
            expect(h.v).toBeLessThan(WAYS[h.kind]);
            if (h.kind === 'moved' || h.kind === 'remembered') expect(pet.things.map((t) => t.id)).toContain(h.thingId);
            if (h.kind === 'sorted') expect(pet.colours.length).toBeGreaterThan(1);
            if (h.kind === 'slept') expect(h.spot).not.toBe('bed');
          }
        }
      }
    }
  });

  it('the rare find is only for the long breaks, and a long break always has it', () => {
    for (let seed = 1; seed <= 40; seed++) {
      expect(whatHeDid(WITH_ALL, RARE_AFTER - 1, seeded(seed)).some((h) => h.kind === 'found')).toBe(false);
      expect(whatHeDid(WITH_ALL, RARE_AFTER, seeded(seed)).some((h) => h.kind === 'found')).toBe(true);
      expect(whatHeDid(EMPTY, 365, seeded(seed)).some((h) => h.kind === 'found')).toBe(true);
    }
  });

  it('the same day brings nothing, because nothing needs saying', () => {
    expect(whatHeDid(WITH_ALL, 0, seeded(1))).toEqual([]);
    expect(comeBack(WITH_ALL, 0, '2026-11-15', seeded(1))).toBe(WITH_ALL);
  });
});

describe('nothing that is kept can count the days', () => {
  const TOP_KEYS = new Set(['metAt', 'closeness', 'days', 'lastDay', 'things', 'colours', 'seen', 'presents', 'lastPresentAt', 'lately']);
  const HAPPENING_KEYS = new Set(['kind', 'v', 'seed', 'colours', 'thingId', 'name', 'to', 'spot', 'givenAt']);

  it('what is saved has the same shape after a day or a year, and only ever says what he did', () => {
    for (const gap of [1, 2, 9, 30, 365, 3650]) {
      const next = comeBack(WITH_ALL, gap, '2026-11-15', seeded(11));
      for (const k of Object.keys(next)) expect(TOP_KEYS.has(k), `top-level ${k}`).toBe(true);
      expect(Object.keys(next.lately!).sort()).toEqual(['day', 'did']);
      for (const h of next.lately!.did) for (const k of Object.keys(h)) expect(HAPPENING_KEYS.has(k), `${h.kind}.${k}`).toBe(true);
    }
  });

  it('the length of the break is not recoverable from what is saved', () => {
    // The same luck with a different break: the only difference is how many nice things, never a number that says why.
    for (const gap of [9, 123, 365, 4321]) {
      const json = JSON.stringify(comeBack(WITH_ALL, gap, '2026-11-15', seeded(5)).lately);
      expect(json).not.toMatch(/gap|away|gone|since|missed|ago|absen|elapsed/i);
      expect(JSON.parse(json).did.every((h: Record<string, unknown>) => Object.values(h).every((x) => x !== gap))).toBe(true);
    }
    expect(JSON.stringify(readPet({ getItem: () => JSON.stringify(comeBack(WITH_ALL, 400, '2026-11-15', seeded(5))) }))).not.toMatch(/gap|away|elapsed/i);
  });

  it('a return is made once a day: opening the app again changes nothing', () => {
    const once = comeBack(WITH_ALL, 40, '2026-11-15', seeded(2));
    expect(once.lately).toBeTruthy();
    expect(comeBack(once, 40, '2026-11-15', seeded(99))).toBe(once);
  });

  it('is the same every time for the same luck', () => {
    expect(whatHeDid(WITH_ALL, 100, seeded(8))).toEqual(whatHeDid(WITH_ALL, 100, seeded(8)));
  });

  it('the news stays while it is new, and goes once it has been seen and the day has moved on, never because of its age', () => {
    const p = comeBack(WITH_ALL, 12, '2026-11-15', seeded(2));
    expect(latelyShowing(p, '2026-11-15')).toBeTruthy();
    expect(latelyShowing(p, '2026-11-20')).toBeTruthy(); // not looked at yet: still news, however many days later
    const seen = markLatelySeen(p);
    expect(latelyShowing(seen, '2026-11-15')).toBeTruthy(); // still today
    expect(latelyShowing(seen, '2026-11-16')).toBeUndefined();
    expect(markLatelySeen(seen)).toBe(seen);
    expect(latelyShowing(FRESH_PET, '2026-11-15')).toBeUndefined();
  });

  it('is saved and read back, and an old save without any of it still opens', () => {
    const next = comeBack(WITH_ALL, 40, '2026-11-15', seeded(2));
    const back = readPet({ getItem: (k: string) => (k === PET_KEY ? JSON.stringify(next) : null) });
    expect(back.lately).toEqual(next.lately);
    const old = { ...FRESH_PET, closeness: 12 };
    expect(readPet({ getItem: () => JSON.stringify(old) }).lately).toBeUndefined();
    expect('lately' in readPet({ getItem: () => JSON.stringify(old) })).toBe(false);
  });

  it('throws away news that does not look right, instead of showing it', () => {
    expect(readLately(null)).toBeUndefined();
    expect(readLately({ day: 5, did: [] })).toBeUndefined();
    expect(readLately({ day: 'x', did: [{ kind: 'sulked', v: 0 }] })).toBeUndefined();
    expect(readLately({ day: 'x', did: [{ kind: 'slept', v: 0, spot: 'the moon' }] })).toBeUndefined();
    const ok = readLately({ day: 'x', did: [{ kind: 'drew', v: 99, seed: 3, colours: ['#fff', '"><script>'] }, { kind: 'bad' }] })!;
    expect(ok.did).toHaveLength(1);
    expect(ok.did[0]).toMatchObject({ kind: 'drew', v: WAYS.drew - 1, colours: ['#fff'] });
  });
});

describe('what he remembers is what you gave him and the date, and nothing else', () => {
  it('says a date, never how long ago', () => {
    for (let back = 0; back <= 4000; back += 7) {
      const said = whenGiven(AT - back * DAY, AT);
      expect(said).toMatch(/^(today|yesterday|on \d{1,2} [A-Z][a-z]+( \d{4})?)$/);
      expect(said).not.toMatch(ABSENCE_WORDS);
    }
    expect(whenGiven(AT, AT)).toBe('today');
    expect(whenGiven(AT - DAY, AT)).toBe('yesterday');
    expect(whenGiven(new Date(2026, 2, 3).getTime(), AT)).toBe('on 3 March');
    expect(whenGiven(new Date(2024, 11, 25).getTime(), AT)).toBe('on 25 December 2024');
    // A gift from the future (a clock that moved) still reads sensibly.
    expect(whenGiven(AT + 5 * DAY, AT)).toBe('today');
  });

  it('is the same date however long you were out: the date of the gift does not move with the clock', () => {
    const given = new Date(2026, 2, 3).getTime();
    const soon = whenGiven(given, new Date(2026, 5, 1).getTime());
    const later = whenGiven(given, new Date(2026, 10, 1).getTime());
    expect(soon).toBe(later);
  });

  it('what he remembers carries the gift and its date, and no clock of yours', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const h of whatHeDid(WITH_ALL, 400, seeded(seed))) {
        if (h.kind !== 'remembered') continue;
        expect(Object.keys(h).sort()).toEqual(['givenAt', 'kind', 'name', 'thingId', 'v']);
        expect(WITH_ALL.things.find((t) => t.id === h.thingId)!.givenAt).toBe(h.givenAt);
      }
    }
  });
});

describe('his words', () => {
  const ids = Object.keys(data).filter((k) => k.startsWith('pet.lately.') || k === 'pet.hello.again' || k === 'pet.thing') as Array<keyof typeof data>;
  const textOf = (id: keyof typeof data): string[] => {
    const t = (data[id] as { text: string | string[] }).text;
    return Array.isArray(t) ? t : [t];
  };

  it('none of them can count, or mourn, a break', () => {
    expect(ids.length).toBeGreaterThanOrEqual(9);
    for (const id of ids) for (const t of textOf(id)) expect(t, `${id}: ${t}`).not.toMatch(ABSENCE_WORDS);
  });

  it('the hello takes nothing to fill in, so it cannot say how long it has been', () => {
    expect((data['pet.hello.again'] as { vars?: string[] }).vars).toBeUndefined();
    expect(textOf('pet.hello.again').join(' ')).not.toMatch(/[{}0-9]/);
  });

  it('the words under him and the places are nice and plain too', () => {
    for (const w of [...Object.values(SLEPT_PLACE), ...Object.values(TOY_PLACE), ...(['window', 'middle', 'desk', 'bowl'] as const).map(sleptWords)]) expect(w).not.toMatch(ABSENCE_WORDS);
  });

  it('every kind has as many ways of being said as the code thinks it has', () => {
    for (const kind of NICE) expect(textOf(`pet.lately.${kind}` as keyof typeof data).length, kind).toBe(WAYS[kind]);
  });

  it('no em dashes, and at most one exclamation mark a line', () => {
    for (const id of ids) for (const t of textOf(id)) {
      expect(t).not.toMatch(/—/);
      expect((t.match(/!/g) ?? []).length).toBeLessThanOrEqual(1);
    }
  });
});

describe('what he drew', () => {
  it('is the same picture for the same seed, in his own colours, and safe whatever the colours say', () => {
    const a = doodleUrl(42, ['#ff0000', '#00ff00']);
    expect(doodleUrl(42, ['#ff0000', '#00ff00'])).toBe(a);
    expect(doodleUrl(43, ['#ff0000', '#00ff00'])).not.toBe(a);
    const svg = decodeURIComponent(a.replace('data:image/svg+xml;utf8,', ''));
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('#ff0000');
    const hostile = decodeURIComponent(doodleUrl(7, ['"><script>alert(1)</script>']).replace('data:image/svg+xml;utf8,', ''));
    expect(hostile).not.toContain('script');
  });
});
