// The moved-commands audit, tried on made-up records: does it notice each kind of move, say it in plain words, and
// accept it once it is written down? The first story is the one that started this: the capture view, moved twice.
import { describe, expect, it } from 'vitest';
import type { Move } from './known-moves';
import { ALWAYS_ON, differences, excused, failure, ledgerProblems, NO_KEYS, NO_MENU, IN_PALETTE, NOT_IN_PALETTE, sentence, type Book, type Place, type Searcher } from './places-logic';

const place = (over: Partial<Place> = {}): Place => ({ name: 'Capture view', place: 'View > Second window and capture view', keys: 'Ctrl+Alt+Shift+P', switch: 'popout', palette: IN_PALETTE, words: ['obs', 'green screen'], ...over });
const book = (p: Place): Book => ({ 'capture.toggle': p });
const finds = (yes: boolean): Searcher => ({ keywords: () => new Set<string>(), finds: () => yes });
const keeps: Searcher = { keywords: () => new Set(['obs', 'green screen']), finds: () => false };
const why = 'The streaming menu went away for people who do not stream, at the user\'s request.';

describe('moved commands: the audit notices each way a command can move', () => {
  it('nothing changed, nothing said', () => {
    expect(differences(book(place()), book(place()), keeps)).toEqual([]);
  });

  it('a command that moved out of one menu into another says where it was and where it is, and how deep', () => {
    const was = book(place({ place: 'View > Second window and capture view' }));
    const now = book(place({ place: 'Streaming' }));
    const [c] = differences(was, now, keeps);
    expect(c).toMatchObject({ id: 'capture.toggle', what: 'place' });
    expect(sentence(c, was, now)).toBe('"Capture view" (capture.toggle) moved. It used to be in View > Second window and capture view; it is now in Streaming. That is shallower: 2 clicks deep, it was 3 clicks deep.');
  });

  it('a command pushed deeper into a menu says it got deeper', () => {
    const was = book(place({ place: 'View' }));
    const now = book(place({ place: 'View > Sharing your screen' }));
    expect(sentence(differences(was, now, keeps)[0], was, now)).toContain('That is deeper: 3 clicks deep, it was 2 clicks deep.');
  });

  it('a command taken out of every menu says it is palette and shortcut only now', () => {
    const was = book(place());
    const now = book(place({ place: NO_MENU }));
    expect(sentence(differences(was, now, keeps)[0], was, now)).toContain('no longer in any menu');
  });

  it('a rename says the old name and the new one', () => {
    const was = book(place());
    const now = book(place({ name: 'Clean view' }));
    const [c] = differences(was, now, keeps);
    expect(c.what).toBe('name');
    expect(sentence(c, was, now)).toContain('used to be called "Capture view"; it is now "Clean view"');
  });

  it('a shortcut taken away, and one changed, are said differently', () => {
    const was = book(place());
    const lost = book(place({ keys: NO_KEYS }));
    const changed = book(place({ keys: 'Mod+K' }));
    expect(sentence(differences(was, lost, keeps)[0], was, lost)).toContain('lost its shortcut. It used to be Ctrl+Alt+Shift+P');
    expect(sentence(differences(was, changed, keeps)[0], was, changed)).toContain('different shortcut');
  });

  it('a command put behind a feature switch it was not behind says people who turn it off lose it', () => {
    const was = book(place({ switch: ALWAYS_ON }));
    const now = book(place({ switch: 'streaming' }));
    const [c] = differences(was, now, keeps);
    expect(c.what).toBe('switch');
    expect(sentence(c, was, now)).toContain('now behind the "streaming" feature switch. It used to be always on');
  });

  it('a command that left the palette is noticed', () => {
    expect(differences(book(place()), book(place({ palette: NOT_IN_PALETTE })), keeps)[0].what).toBe('palette');
  });

  it('a search word that stopped finding it is noticed, but only if it really stopped: a kept keyword is not searched for', () => {
    const was = book(place());
    const lost = differences(was, was, finds(false));
    expect(lost.map((c) => c.from)).toEqual(['obs', 'green screen']);
    expect(sentence(lost[0], was, was)).toContain('Typing "obs" in the palette used to show "Capture view" (capture.toggle) in the first three results. It no longer shows in the first five.');
    expect(differences(was, was, finds(true))).toEqual([]);
    expect(differences(was, was, keeps)).toEqual([]);
  });

  it('a command that no longer exists is noticed', () => {
    const was = book(place());
    const [c] = differences(was, {}, keeps);
    expect(c).toMatchObject({ what: 'gone', from: 'Capture view' });
    expect(sentence(c, was, {})).toContain('no longer exists');
  });
});

describe('moved commands: a written-down move is accepted, and only an exact one', () => {
  const was = book(place({ place: 'View > Second window and capture view' }));
  const now = book(place({ place: 'View > Sharing your screen' }));
  const m = (from: string, to: string): Move => ({ id: 'capture.toggle', what: 'place', from, to, why });

  it('the capture view moving twice in a day takes two lines, and both are needed', () => {
    const twice = [m('View > Second window and capture view', 'Streaming'), m('Streaming', 'View > Sharing your screen')];
    const [c] = differences(was, now, keeps);
    const used = new Set<Move>();
    expect(excused(c, twice, used)).toBe(true);
    expect(used.size).toBe(2);
    expect(excused(c, [twice[0]], new Set())).toBe(false);
    expect(excused(c, [twice[1]], new Set())).toBe(false);
  });

  it('a line that ends somewhere other than where the command is does not excuse it', () => {
    const [c] = differences(was, now, keeps);
    expect(excused(c, [m('View > Second window and capture view', 'Streaming')], new Set())).toBe(false);
  });

  it('what is left unexplained is said in a paste-ready line and tells the person what to do', () => {
    const [c] = differences(was, now, keeps);
    const text = failure([c], was, now);
    expect(text).toContain('1 change nobody wrote down');
    expect(text).toContain('It used to be in View > Second window and capture view; it is now in View > Sharing your screen.');
    expect(text).toContain('{ id: "capture.toggle", what: "place", from: "View > Second window and capture view", to: "View > Sharing your screen"');
    expect(text).toContain('say the old place and the new one in a sentence');
  });

  it('a written-down move that no longer applies, has no reason, or has a dash is flagged', () => {
    const used = new Set<Move>();
    expect(ledgerProblems([m('A', 'B')], was, used).join('\n')).toContain('stale');
    const lazy: Move = { ...m('View > Second window and capture view', 'View > Sharing your screen'), why: 'SAY WHY, in plain words, and who asked' };
    const u2 = new Set<Move>([lazy]);
    expect(ledgerProblems([lazy], was, u2).join('\n')).toContain('reason is missing');
    const dash: Move = { ...lazy, why: 'Moved it — on purpose, for the streamers.' };
    expect(ledgerProblems([dash], was, new Set([dash])).join('\n')).toContain('dash');
    expect(ledgerProblems([{ ...lazy, id: 'nope.nothing', why }], was, new Set()).join('\n')).toContain('names a command the record does not have');
    const good: Move = { ...lazy, why };
    expect(ledgerProblems([good], was, new Set([good]))).toEqual([]);
  });
});
