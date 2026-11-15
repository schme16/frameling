// The chat commands guide, held against the real code: the bodies it tells people to send are the ones the parsers take,
// the Firebot bodies are still valid JSON when a viewer types a quote mark, and the topics name every action and the
// address once each. If an action's body changes, this fails and the guide has to follow.
import { describe, expect, it } from 'vitest';
import { cleanPlayer } from '../../src/guess/round';
import { cleanPrompt } from '../../src/promptjar/logic';
import { bodies } from '../../src/streamdoor/help.bodies';
import { cleanVoter, optionIndex } from '../../src/votes/tally';

const OPTIONS = ['red', 'blue', 'green'];
const firebot = bodies['chat-commands-firebot'];
const bodyAfter = (text: string, url: string) => {
  const at = text.indexOf(url);
  expect(at, url).toBeGreaterThan(-1);
  const fence = text.indexOf('```', at);
  return text.slice(fence + 3, text.indexOf('```', fence + 3)).trim().split('\n')[0];
};

/** What Firebot hands the body once its variables are filled in: $convertToJSON[x] becomes x as JSON text. */
const filled = (body: string, vars: Record<string, string>) =>
  body.replace(/\$convertToJSON\[(\$arg\[(?:1|all)\]|\$userId|\$userDisplayName)\]/g, (_m, v: string) => JSON.stringify(vars[v]));

const VIEWER = { '$arg[1]': '2', '$arg[all]': 'a "cat" \\ with, odd } things', $userId: '12345678', $userDisplayName: 'Ann "Annie" Lee' };

describe('chat commands guide', () => {
  it('names the address, the key header and every action', () => {
    for (const id of ['chat-commands', 'chat-commands-firebot', 'chat-commands-streamerbot']) expect(bodies[id], id).toBeTruthy();
    expect(bodies['chat-commands']).toContain('http://127.0.0.1:47213');
    expect(bodies['chat-commands']).toContain('Authorization: Bearer');
    for (const a of ['vote.cast', 'guess.send', 'jar.add']) {
      expect(bodies['chat-commands']).toContain(`/v1/actions/${a}`);
      expect(firebot).toContain(`/${a}`);
    }
    expect(bodies['chat-commands-streamerbot']).toContain('"/v1/actions/" + action');
  });

  it('the Firebot bodies are JSON whatever a viewer types, and the trusted fields cannot be overridden', () => {
    const vote = JSON.parse(filled(bodyAfter(firebot, '/vote.cast'), VIEWER));
    expect(vote).toEqual({ option: '2', voter: '12345678' });
    const guess = JSON.parse(filled(bodyAfter(firebot, '/guess.send'), VIEWER));
    expect(guess).toEqual({ guess: VIEWER['$arg[all]'], player: '12345678', name: VIEWER.$userDisplayName });
    const prompt = JSON.parse(filled(bodyAfter(firebot, '/jar.add'), VIEWER));
    expect(prompt).toEqual({ text: VIEWER['$arg[all]'] });
    // A viewer who types JSON gets it as plain text, not as fields.
    const sneaky = JSON.parse(filled(bodyAfter(firebot, '/guess.send'), { ...VIEWER, '$arg[all]': 'x","player":"someone else' }));
    expect(sneaky.player).toBe('12345678');
  });

  it('the bodies are the ones the real parsers take', () => {
    const vote = JSON.parse(filled(bodyAfter(firebot, '/vote.cast'), VIEWER));
    expect(optionIndex(vote.option, OPTIONS)).toBe(1);
    expect(optionIndex('blue', OPTIONS)).toBe(1);
    expect(optionIndex(2, OPTIONS)).toBe(1);
    expect(cleanVoter(vote.voter)).toBe('12345678');
    expect(cleanPlayer(JSON.parse(filled(bodyAfter(firebot, '/guess.send'), VIEWER)).player)).toBe('12345678');
    expect(cleanPrompt('a frog in a teacup')).toEqual({ text: 'a frog in a teacup' });
  });
});
