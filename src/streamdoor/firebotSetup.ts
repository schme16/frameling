// The Firebot setup file: !vote, !guess and !prompt as three Firebot commands, each sending to the actions door.
//
// The format is Firebot's own (v5.67.0, src/backend/setups/setup-manager.ts and src/types/setups.ts in
// crowbartools/Firebot): a JSON file ending .firebotsetup with a name, a description, an author, a version,
// `importQuestions` and `components`. Firebot's Import window asks each import question and swaps its `replaceToken`
// for the answer in every text field of every component. We use that for the address and the key, so the file holds
// no secret, and a rolled key only means answering the question again. Fixed ids mean importing again replaces the
// three commands instead of adding copies.
import { DEFAULT_DOOR_PORT } from '../shared/streamDoor';

/** Firebot swaps this for the address the person types or accepts when it imports. */
export const ADDRESS_TOKEN = '%%FRAMELING_ADDRESS%%';
/** Firebot swaps this for the key the person pastes when it imports. */
export const KEY_TOKEN = '%%FRAMELING_KEY%%';

export const FIREBOT_SETUP_FILE = 'frameling-chat-commands.firebotsetup';
/** Bumped when the commands in the file change, so Firebot's Import window shows which one it is. */
export const FIREBOT_SETUP_VERSION = 1;

/** The three chat-driven actions and the body each sends. Firebot fills the $variables in before it sends. */
export const FIREBOT_COMMANDS = [
  {
    id: 'a3b1c8e0-5d7f-4f23-9b71-0f5d7f423a01',
    effectId: '8a981acf-a8e9-44a7-8b47-d610707e4d78',
    listId: '5c5c7888-558e-48ac-a416-941a2c453415',
    trigger: '!vote',
    action: 'vote.cast',
    description: 'Casts a vote in the Frameling vote that is running. Viewers type !vote 2, or !vote and the name of the option.',
    body: '{"option": $convertToJSON[$arg[1]], "voter": $convertToJSON[$userId]}',
    globalCooldown: undefined as number | undefined,
  },
  {
    id: 'b4c2d9f1-6e80-4a34-8c82-1a6e80534b02',
    effectId: '0736ff52-4e49-489d-b33a-08e54a5fafb7',
    listId: 'b11e27e3-d268-468a-aba2-64940b228753',
    trigger: '!guess',
    action: 'guess.send',
    description: 'Sends a guess to the Frameling guessing round that is running.',
    body: '{"guess": $convertToJSON[$arg[all]], "player": $convertToJSON[$userId], "name": $convertToJSON[$userDisplayName]}',
    globalCooldown: undefined as number | undefined,
  },
  {
    id: 'c5d3eaa2-7f91-4b45-9d93-2b7f91645c03',
    effectId: 'f2f117fd-d4da-43c9-aeab-89557b3bf7c6',
    listId: '57ca201a-1239-486f-9645-608bf2a9612b',
    trigger: '!prompt',
    action: 'jar.add',
    description: 'Adds what a viewer types to the Frameling prompt jar. One every 8 seconds for the whole channel, the same as Frameling.',
    body: '{"text": $convertToJSON[$arg[all]]}',
    globalCooldown: 8 as number | undefined,
  },
];

/** What Firebot's Import window says about the file. Markdown. Plain words, no em dashes. */
const DESCRIPTION = [
  'Three chat commands for **Frameling**, so your viewers can vote, guess and suggest prompts by typing in chat.',
  '',
  '- `!vote 2` votes in the vote that is running',
  '- `!guess elephant` guesses in the round that is running',
  '- `!prompt a frog in a teacup` adds to the prompt jar',
  '',
  'Under **Import Questions**, below:',
  '',
  '1. **Address** is already filled in. Leave it, unless Frameling shows a different one in **Preferences > Streaming**.',
  '2. **Key**: in Frameling, press **Copy** beside **Key (token)** in the same place, then paste it here. It is not in this file.',
  '',
  'Made a new key in Frameling later? Import this file again and paste the new one. It replaces these three commands, it does not add copies.',
].join('\n');

const ADDRESS_QUESTION_ID = '97a42bbc-e5f1-48f4-9c9d-ff248ccaf7ea';
const KEY_QUESTION_ID = '50a4c372-5fee-4aef-ad23-2e3ad418691b';

/** Firebot's own default for a new custom command: the fields it fills in itself, so an imported one behaves the same. */
function command(c: (typeof FIREBOT_COMMANDS)[number]) {
  return {
    id: c.id,
    name: c.trigger,
    description: c.description,
    active: true,
    trigger: c.trigger,
    simple: false,
    sendCooldownMessage: true,
    sendCooldownMessageAsReply: false,
    useCustomCooldownMessage: false,
    cooldownMessage: 'This command is still on cooldown for: {timeLeft}',
    cooldown: c.globalCooldown === undefined ? {} : { global: c.globalCooldown },
    effects: {
      id: c.listId,
      list: [
        {
          id: c.effectId,
          type: 'firebot:http-request',
          active: true,
          // The effect's editor sets these when it opens, but an imported effect never opens it, so they are written here.
          url: `${ADDRESS_TOKEN}/v1/actions/${c.action}`,
          method: 'POST',
          body: c.body,
          headers: [{ key: 'Authorization', value: `Bearer ${KEY_TOKEN}` }],
          options: {},
        },
      ],
    },
    restrictionData: { restrictions: [], mode: 'all', sendFailMessage: true },
    aliases: [],
    sortTags: ['Frameling'],
    treatQuotedTextAsSingleArg: false,
    allowTriggerBySharedChat: 'inherit',
  };
}

/**
 * The setup, with the address the person will most likely want already filled in as the answer to the first import
 * question. The key is never in it.
 */
export function buildFirebotSetup(address: string) {
  return {
    name: 'Frameling chat commands',
    description: DESCRIPTION,
    author: 'Frameling',
    version: FIREBOT_SETUP_VERSION,
    importQuestions: [
      {
        id: ADDRESS_QUESTION_ID,
        question: 'Frameling address',
        helpText: 'Shown in Frameling under Preferences > Streaming > Actions door. Usually the one already here. No slash at the end.',
        answerType: 'text',
        defaultAnswer: cleanAddress(address),
        replaceToken: ADDRESS_TOKEN,
        presetOptions: [] as string[],
      },
      {
        id: KEY_QUESTION_ID,
        question: 'Frameling key',
        helpText: 'In Frameling, press Copy beside Key (token) under Preferences > Streaming > Actions door, then paste it here.',
        answerType: 'text',
        replaceToken: KEY_TOKEN,
        presetOptions: [] as string[],
      },
    ],
    requireCurrency: false,
    components: {
      commands: FIREBOT_COMMANDS.map(command),
      counters: [],
      currencies: [],
      effectQueues: [],
      events: [],
      eventGroups: [],
      hotkeys: [],
      presetEffectLists: [],
      timers: [],
      scheduledTasks: [],
      variableMacros: [],
      viewerRoles: [],
      viewerRankLadders: [],
      quickActions: [],
      overlayWidgetConfigs: [],
      globalValues: [],
    },
  };
}

/** The address as Firebot will paste it in front of /v1/actions/...: no spaces and no slash at the end. */
export function cleanAddress(address: string): string {
  const a = address.trim().replace(/\/+$/, '');
  return a || `http://127.0.0.1:${DEFAULT_DOOR_PORT}`;
}

/** The file's text. Firebot reads plain JSON; the indent only makes it readable if somebody opens it. */
export function firebotSetupText(address: string): string {
  return JSON.stringify(buildFirebotSetup(address), null, 2);
}
