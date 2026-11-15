// The Firebot setup file, held against Firebot's own import code (setup-manager.ts, v5.67.0) and against the guide.
// Firebot's Import window asks each import question and swaps its replaceToken for the answer in every string of
// every component, so the tests do the same swap and then check what Firebot would end up running.
import { describe, expect, it } from 'vitest';
import { bodies } from '../../src/streamdoor/help.bodies';
import { ADDRESS_TOKEN, buildFirebotSetup, cleanAddress, FIREBOT_COMMANDS, firebotSetupText, KEY_TOKEN } from '../../src/streamdoor/firebotSetup';

const ADDRESS = 'http://127.0.0.1:47213';
const KEY = 'fld_Ab3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE';

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

/** Firebot's replaceQuestionAnswers: every string anywhere under components, token for answer. */
function importAs(setupText: string, answers: Record<string, string>) {
  const setup = JSON.parse(setupText);
  const walk = (data: Json): void => {
    if (!data || typeof data !== 'object') return;
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'string') {
        let out = v;
        for (const q of setup.importQuestions) out = out.split(q.replaceToken).join(answers[q.id] ?? q.defaultAnswer ?? '');
        (data as Record<string, unknown>)[k] = out;
      } else walk(v as Json);
    }
  };
  walk(setup.components);
  return setup;
}
const answersFor = (setup: ReturnType<typeof buildFirebotSetup>, key: string, address?: string) => {
  const [a, k] = setup.importQuestions;
  return { [a.id]: address ?? a.defaultAnswer, [k.id]: key } as Record<string, string>;
};

/** What Firebot hands the body once its variables are filled in: $convertToJSON[x] becomes x as JSON text. */
const filled = (body: string, vars: Record<string, string>) =>
  body.replace(/\$convertToJSON\[(\$arg\[(?:1|all)\]|\$userId|\$userDisplayName)\]/g, (_m, v: string) => JSON.stringify(vars[v]));
const VIEWER = { '$arg[1]': '2', '$arg[all]': 'a "cat" \\ with, odd } things', $userId: '12345678', $userDisplayName: 'Ann "Annie" Lee' };

describe('Firebot setup file: shape', () => {
  const text = firebotSetupText(ADDRESS);
  const setup = JSON.parse(text);

  it('is valid JSON with what Firebot needs to load it', () => {
    // Firebot refuses a file without components; its Import window reads name, version, author, description and importQuestions.
    expect(typeof setup.name).toBe('string');
    expect(typeof setup.description).toBe('string');
    expect(typeof setup.author).toBe('string');
    expect(typeof setup.version).toBe('number');
    expect(setup.requireCurrency).toBe(false);
    expect(setup.components).toBeTruthy();
    // Every component list Firebot's FirebotSetup type names is there, so its import loops have something to walk.
    expect(Object.keys(setup.components).sort()).toEqual(
      ['commands', 'counters', 'currencies', 'effectQueues', 'events', 'eventGroups', 'hotkeys', 'presetEffectLists', 'timers', 'scheduledTasks', 'variableMacros', 'viewerRoles', 'viewerRankLadders', 'quickActions', 'overlayWidgetConfigs', 'globalValues'].sort(),
    );
    for (const [k, v] of Object.entries(setup.components)) if (k !== 'commands') expect(v, k).toEqual([]);
  });

  it('has the three commands, each one HTTP Request effect, with ids that stay the same so importing again replaces them', () => {
    const cmds = setup.components.commands;
    expect(cmds.map((c: { trigger: string }) => c.trigger)).toEqual(['!vote', '!guess', '!prompt']);
    const ids = [...cmds.map((c: { id: string }) => c.id), ...cmds.map((c: { effects: { id: string } }) => c.effects.id), ...cmds.map((c: { effects: { list: { id: string }[] } }) => c.effects.list[0].id), ...setup.importQuestions.map((q: { id: string }) => q.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(JSON.parse(firebotSetupText('http://127.0.0.1:50000')).components.commands.map((c: { id: string }) => c.id)).toEqual(cmds.map((c: { id: string }) => c.id));
    for (const c of cmds) {
      expect(c.active).toBe(true);
      expect(c.type).toBeUndefined(); // Firebot sets "custom" itself when it saves.
      expect(c.simple).toBe(false); // Only advanced mode has an effects list.
      expect(c.effects.list).toHaveLength(1);
      const e = c.effects.list[0];
      expect(e.type).toBe('firebot:http-request');
      expect(e.method).toBe('POST');
      // The effect's editor fills these in when it opens; an imported one never opens, and Firebot reads effect.options.* when it runs.
      expect(e.options).toEqual({});
      expect(e.headers).toEqual([{ key: 'Authorization', value: `Bearer ${KEY_TOKEN}` }]);
      expect(c.restrictionData).toEqual({ restrictions: [], mode: 'all', sendFailMessage: true });
    }
  });

  it('asks two import questions in Firebot\'s shape, and only the address has an answer in the file', () => {
    expect(setup.importQuestions).toHaveLength(2);
    const [address, key] = setup.importQuestions;
    expect(address).toMatchObject({ answerType: 'text', replaceToken: ADDRESS_TOKEN, defaultAnswer: ADDRESS });
    expect(key).toMatchObject({ answerType: 'text', replaceToken: KEY_TOKEN });
    expect(key.defaultAnswer).toBeUndefined();
    for (const q of setup.importQuestions) {
      expect(typeof q.id).toBe('string');
      expect(q.question).toBeTruthy();
      expect(Array.isArray(q.presetOptions)).toBe(true);
    }
  });

  it('only the first command waits on a cooldown the way Frameling does: !prompt, 8 seconds, global', () => {
    const [vote, guess, prompt] = setup.components.commands;
    expect(vote.cooldown).toEqual({});
    expect(guess.cooldown).toEqual({});
    expect(prompt.cooldown).toEqual({ global: 8 });
  });

  it('has no em dashes anywhere a person reads it', () => {
    expect(text).not.toContain('—');
  });
});

describe('Firebot setup file: the address and the key', () => {
  it('carries the real current address as the default answer, whatever the port', () => {
    for (const a of ['http://127.0.0.1:47213', 'http://127.0.0.1:47220']) {
      const s = buildFirebotSetup(a);
      expect(s.importQuestions[0].defaultAnswer).toBe(a);
      const out = importAs(JSON.stringify(s), answersFor(s, KEY));
      for (const c of out.components.commands) expect(c.effects.list[0].url.startsWith(`${a}/v1/actions/`)).toBe(true);
    }
  });

  it('never holds the key: it is not in the file, and a rolled key does not change the file', () => {
    const text = firebotSetupText(ADDRESS);
    expect(text).not.toContain(KEY);
    expect(text).not.toMatch(/fld_[A-Za-z0-9]/);
    // Nothing about the key can be in the output, so a new key leaves it identical.
    expect(firebotSetupText(ADDRESS)).toBe(text);
  });

  it('puts the answered key in all three commands, and a rolled key changes what Firebot ends up with', () => {
    const s = buildFirebotSetup(ADDRESS);
    const text = JSON.stringify(s);
    const first = importAs(text, answersFor(s, KEY));
    const rolled = importAs(text, answersFor(s, 'fld_NEWNEWNEWNEWNEWNEWNEWNEWNEWNEW12'));
    for (const c of first.components.commands) expect(c.effects.list[0].headers[0]).toEqual({ key: 'Authorization', value: `Bearer ${KEY}` });
    for (const c of rolled.components.commands) expect(c.effects.list[0].headers[0].value).toBe('Bearer fld_NEWNEWNEWNEWNEWNEWNEWNEWNEWNEW12');
    expect(JSON.stringify(first)).not.toBe(JSON.stringify(rolled));
    expect(JSON.stringify(first.components)).not.toContain('%%');
  });

  it('the three URLs, once answered, are exactly the actions door routes', () => {
    const s = buildFirebotSetup(ADDRESS);
    const out = importAs(JSON.stringify(s), answersFor(s, KEY));
    expect(out.components.commands.map((c: { effects: { list: { url: string }[] } }) => c.effects.list[0].url)).toEqual([
      `${ADDRESS}/v1/actions/vote.cast`,
      `${ADDRESS}/v1/actions/guess.send`,
      `${ADDRESS}/v1/actions/jar.add`,
    ]);
  });

  it('tidies the address: no space, no slash at the end, a fallback when empty', () => {
    expect(cleanAddress('  http://127.0.0.1:47213/ ')).toBe('http://127.0.0.1:47213');
    expect(cleanAddress('')).toBe('http://127.0.0.1:47213');
    expect(buildFirebotSetup('http://127.0.0.1:47213//').importQuestions[0].defaultAnswer).toBe('http://127.0.0.1:47213');
  });
});

describe('Firebot setup file: the bodies', () => {
  const s = buildFirebotSetup(ADDRESS);
  const body = (i: number) => s.components.commands[i].effects.list[0].body;

  it('are exactly the verified ones', () => {
    expect(body(0)).toBe('{"option": $convertToJSON[$arg[1]], "voter": $convertToJSON[$userId]}');
    expect(body(1)).toBe('{"guess": $convertToJSON[$arg[all]], "player": $convertToJSON[$userId], "name": $convertToJSON[$userDisplayName]}');
    expect(body(2)).toBe('{"text": $convertToJSON[$arg[all]]}');
  });

  it('are the same ones the Firebot help topic tells people to type by hand', () => {
    const help = bodies['chat-commands-firebot'];
    for (const c of FIREBOT_COMMANDS) {
      const at = help.indexOf(`\`/${c.action}\``);
      expect(at, c.action).toBeGreaterThan(-1);
      const fence = help.indexOf('```', at);
      expect(help.slice(fence + 3, help.indexOf('```', fence + 3)).trim().split('\n')[0]).toBe(c.body);
    }
  });

  it('are JSON whatever a viewer types, and keep the trusted fields out of a viewer\'s reach', () => {
    expect(JSON.parse(filled(body(0), VIEWER))).toEqual({ option: '2', voter: '12345678' });
    expect(JSON.parse(filled(body(1), VIEWER))).toEqual({ guess: VIEWER['$arg[all]'], player: '12345678', name: VIEWER.$userDisplayName });
    expect(JSON.parse(filled(body(2), VIEWER))).toEqual({ text: VIEWER['$arg[all]'] });
    expect(JSON.parse(filled(body(1), { ...VIEWER, '$arg[all]': 'x","player":"someone else' })).player).toBe('12345678');
  });
});
