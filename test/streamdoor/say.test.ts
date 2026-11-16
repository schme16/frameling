// What a chat bot is told to say when the door turns a request away, and the one line that tests the door.
import { describe, expect, it } from 'vitest';
import { sayFor, waitSeconds } from '../../src/shared/doorSay';
import { testCommand } from '../../src/streamdoor/testCommand';
import { guessDetail } from '../../src/guess/actions';
import { voteDetail } from '../../src/votes/actions';
import type { DoorVerdict } from '../../src/shared/streamDoor';

type Refused = Extract<DoorVerdict, { ok: false }>;
const no = (reason: Refused['reason'], detail?: string, retryInMs?: number): Refused => ({ ok: false, reason, ...(detail ? { detail } : {}), ...(retryInMs === undefined ? {} : { retryInMs }) });

describe('what a bot can say', () => {
  it('tells a viewer why a vote was turned away', () => {
    expect(sayFor('vote.cast', no('invalid', 'closed'))).toBe('No vote is running right now.');
    expect(sayFor('vote.cast', no('invalid', 'no-option'))).toBe('That is not one of the options.');
    expect(sayFor('vote.cast', no('invalid', 'again'))).toBe('You have already voted.');
  });

  it('says the same detail in the words of its own action', () => {
    expect(sayFor('guess.send', no('invalid', 'closed'))).toBe('No guessing round is running right now.');
    expect(sayFor('jar.add', no('invalid', 'full'))).toBe('The prompt jar is full.');
  });

  it('has a sentence for every refusal, whatever the reason and whether or not there is a detail', () => {
    for (const reason of ['off', 'unknown', 'unavailable', 'invalid', 'cooldown', 'queue-full'] as const) {
      for (const detail of [undefined, 'closed', 'something-new']) {
        for (const id of ['vote.cast', 'guess.send', 'jar.add', 'door.message', 'nothing.here']) {
          const say = sayFor(id, no(reason, detail, 1500));
          expect(say, `${id} ${reason} ${detail}`).toMatch(/\S/);
          expect(say).not.toContain('—');
          expect(say.length).toBeLessThan(120);
        }
      }
    }
  });

  it('says how long to wait for a cooldown, in whole seconds, never less than one', () => {
    expect(waitSeconds(1)).toBe(1);
    expect(waitSeconds(2100)).toBe(3);
    expect(waitSeconds(undefined)).toBe(1);
    expect(sayFor('jar.add', no('cooldown', 'channel-wait', 2100))).toBe('The prompt jar just took one. Try again in 3 seconds.');
    expect(sayFor('door.zoom', no('cooldown', undefined, 1000))).toBe('That was too soon after the last one. Try again in 1 second.');
    expect(sayFor('door.zoom', no('cooldown'))).toBe('That was too soon after the last one.');
  });

  it('never names anyone and never says a guess was right or wrong', () => {
    const all: string[] = [];
    for (const id of ['vote.cast', 'guess.send', 'jar.add'])
      for (const d of ['closed', 'no-option', 'no-voter', 'no-player', 'no-guess', 'no-prompt', 'again', 'full', 'channel-wait']) all.push(sayFor(id, no('invalid', d)));
    for (const line of all) expect(line).not.toMatch(/\b(wrong|correct|incorrect|solved|got it|word was|was right|is right|not right)\b/i);
  });
});

describe('the details a vote and a guess give', () => {
  it('a vote passes its own reasons on as they are', () => {
    for (const t of ['closed', 'no-option', 'no-voter', 'again', 'full'] as const) expect(voteDetail(t)).toBe(t);
  });

  it('a guess keeps to the reasons that do not depend on the word, and folds the two that would hint at it into one', () => {
    for (const t of ['closed', 'no-guess', 'no-player', 'full'] as const) expect(guessDetail(t)).toBe(t);
    expect(guessDetail('solved')).toBe('again');
    expect(guessDetail('too-many')).toBe('again');
  });
});

describe('the test command', () => {
  const KEY = 'fld_Ab3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE-_x';

  it('carries the live address and the current key, and asks the door for its list', () => {
    expect(testCommand('http://127.0.0.1:47213', KEY)).toBe(`curl -H "Authorization: Bearer ${KEY}" http://127.0.0.1:47213/v1/actions`);
  });

  it('follows the port when it moved, and a new key when one was made', () => {
    expect(testCommand('http://127.0.0.1:47220/', 'fld_new')).toBe('curl -H "Authorization: Bearer fld_new" http://127.0.0.1:47220/v1/actions');
  });

  it('is a GET that changes nothing: no method, no body, so no vote is cast and no message shown', () => {
    const line = testCommand('http://127.0.0.1:47213', KEY)!;
    expect(line).not.toMatch(/-X|-d |--data|POST/);
  });

  it('uses double quotes only, so it pastes into Command Prompt and PowerShell as well as a Linux or Mac terminal', () => {
    expect(testCommand('http://127.0.0.1:47213', KEY)).not.toContain("'");
  });

  it('gives nothing when there is no address or key, or a key that could end the quotes', () => {
    expect(testCommand('', KEY)).toBeNull();
    expect(testCommand('http://127.0.0.1:47213', '')).toBeNull();
    for (const bad of ['a"b', 'a b', 'a;rm -rf', 'a$(x)', 'a\nb', 'a`b']) expect(testCommand('http://127.0.0.1:47213', bad), bad).toBeNull();
    for (const bad of ['ftp://x', 'http://a b', 'http://x;ls', '127.0.0.1:47213']) expect(testCommand(bad, KEY), bad).toBeNull();
  });
});
