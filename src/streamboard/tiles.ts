// The Stream control board's buttons, as plain data and pure functions. A tile is a face on a command that already
// exists (src/core/registry.ts): it holds no logic of its own, it only says which command to run for the state the stream
// is in, and what to write on the button. Nothing here touches a window, a store or the registry, so every tile can be
// tested on its own (test/streamboard/tiles.test.ts).

/** What is going on, as numbers and flags. The drawing window builds this from the real stores; tests build it by hand. */
export interface Situation {
  /** The vote: none, going, or its result showing. */
  vote: 'none' | 'open' | 'result';
  voteTotal: number;
  guess: 'none' | 'open' | 'result';
  guessPlayers: number;
  hintsLeft: number;
  /** Prompts waiting in the jar, and whether one is in the streamer's hand. */
  jarCount: number;
  jarHand: boolean;
  audienceOn: boolean;
  drawingAllowed: boolean;
  waiting: number;
  daresGoing: boolean;
  penModOn: boolean;
  streamSafe: boolean;
  captureOpen: boolean;
  /** Turning audience participation on would stop to ask a first-time question. */
  asks: boolean;
}

export const QUIET: Situation = {
  vote: 'none',
  voteTotal: 0,
  guess: 'none',
  guessPlayers: 0,
  hintsLeft: 0,
  jarCount: 0,
  jarHand: false,
  audienceOn: false,
  drawingAllowed: false,
  waiting: 0,
  daresGoing: false,
  penModOn: false,
  streamSafe: false,
  captureOpen: false,
  asks: false,
};

/** How a tile looks: a plain action, a switch that shows on or off, or a switch for audience participation (its own information colour). */
export type TileTone = 'action' | 'switch' | 'audience';

/** What one tile shows right now. */
export interface Face {
  /** The command it runs, by id. */
  command: string;
  /** The big words. */
  label: string;
  /** The small words under them (counts and on/off, never who). Empty when there is nothing to add. */
  caption: string;
  /** For a switch: is it on? Null for a plain action. */
  on: boolean | null;
  /** Pressing it opens a setup dialog in the drawing window, so that window should come forward (the streamer may say not to). */
  needsWindow: boolean;
  /** Pressing it asks a first-time question in the drawing window, so that window must come forward or the question goes unseen. */
  asks?: boolean;
}

export interface TileDef {
  /** Stable for ever: the saved layout refers to it. */
  id: string;
  /** What the arrange tray calls it, and the help names it by. */
  name: string;
  /** One plain line: what it does. */
  about: string;
  tone: TileTone;
  /** On the board the first time, before anybody arranged anything. */
  defaultOn: boolean;
  face(s: Situation): Face;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const onOff = (on: boolean): string => (on ? 'On' : 'Off');

export const TILES: readonly TileDef[] = [
  {
    id: 'vote',
    name: 'Vote',
    about: 'Starts a vote, ends it and shows the result, then puts the result away. The button follows what the vote is doing.',
    tone: 'action',
    defaultOn: true,
    face: (s) =>
      s.vote === 'open'
        ? { command: 'votes.end', label: 'End the vote', caption: plural(s.voteTotal, 'vote') + ' in', on: null, needsWindow: false }
        : s.vote === 'result'
          ? { command: 'votes.close', label: 'Put the result away', caption: 'The vote is over', on: null, needsWindow: false }
          : { command: 'votes.start', label: 'Start a vote', caption: '', on: null, needsWindow: true },
  },
  {
    id: 'guess',
    name: 'Guessing game',
    about: 'Starts a guessing round, reveals the word, then puts the result away. The word shows on the board below only while the board is private.',
    tone: 'action',
    defaultOn: true,
    face: (s) =>
      s.guess === 'open'
        ? { command: 'guess.end', label: 'Reveal the word', caption: s.guessPlayers ? `${plural(s.guessPlayers, 'person', 'people')} guessing` : 'Nobody has guessed yet', on: null, needsWindow: false }
        : s.guess === 'result'
          ? { command: 'guess.close', label: 'Put the result away', caption: 'The round is over', on: null, needsWindow: false }
          : { command: 'guess.start', label: 'Start a guessing game', caption: '', on: null, needsWindow: true },
  },
  {
    id: 'hint',
    name: 'Hint',
    about: 'Shows one more letter of the secret word to everyone.',
    tone: 'action',
    defaultOn: true,
    face: (s) => ({ command: 'guess.hint', label: 'Give a hint', caption: s.guess === 'open' ? `${s.hintsLeft} left` : '', on: null, needsWindow: false }),
  },
  {
    id: 'jar',
    name: 'Prompt jar',
    about: 'Pulls a prompt out of the jar. What it says stays covered until you press to read it.',
    tone: 'action',
    defaultOn: true,
    face: (s) => ({ command: 'promptjar.pull', label: s.jarHand ? 'Pull another prompt' : 'Pull a prompt', caption: `${s.jarCount} in the jar`, on: null, needsWindow: false }),
  },
  {
    id: 'pass',
    name: 'Pass on the prompt',
    about: 'Throws away the prompt you pulled out.',
    tone: 'action',
    defaultOn: true,
    face: () => ({ command: 'promptjar.pass', label: 'Pass on this prompt', caption: '', on: null, needsWindow: false }),
  },
  {
    id: 'putback',
    name: 'Put the prompt back',
    about: 'Puts the prompt you pulled out back in the jar, to come up another time.',
    tone: 'action',
    defaultOn: false,
    face: () => ({ command: 'promptjar.putBack', label: 'Put the prompt back', caption: '', on: null, needsWindow: false }),
  },
  {
    id: 'audience',
    name: 'Audience participation',
    about: 'Lets viewers take part. Off until you switch it on. Pressing it while on switches everything off.',
    tone: 'audience',
    defaultOn: true,
    face: (s) => ({ command: 'audience.toggle', label: 'Audience participation', caption: onOff(s.audienceOn), on: s.audienceOn, needsWindow: false, asks: !s.audienceOn && s.asks }),
  },
  {
    id: 'interrupt',
    name: 'Let them interrupt',
    about: 'Lets dares and pen tricks reach your drawing. Each is one step Undo takes back.',
    tone: 'switch',
    defaultOn: true,
    face: (s) => ({ command: 'audience.drawing', label: 'Let them interrupt my drawing', caption: onOff(s.drawingAllowed), on: s.drawingAllowed, needsWindow: false }),
  },
  {
    id: 'queue',
    name: 'Empty the queue',
    about: 'Throws away everything waiting its turn. What is already happening carries on.',
    tone: 'action',
    defaultOn: true,
    face: (s) => ({ command: 'audience.clearQueue', label: 'Empty the queue', caption: s.waiting ? `${s.waiting} waiting` : 'Nothing waiting', on: null, needsWindow: false }),
  },
  {
    id: 'dares',
    name: 'Put the dares back',
    about: 'Ends every dare that is going and puts your view and colours back.',
    tone: 'action',
    defaultOn: true,
    face: (s) => ({ command: 'dares.stop', label: 'Put every dare back', caption: s.daresGoing ? 'A dare is going' : '', on: null, needsWindow: false }),
  },
  {
    id: 'pen',
    name: 'Put my pen back',
    about: 'Takes a pen modifier off right now.',
    tone: 'action',
    defaultOn: true,
    face: (s) => ({ command: 'penmods.stop', label: 'Put my pen back', caption: s.penModOn ? 'A pen trick is on' : '', on: null, needsWindow: false }),
  },
  {
    id: 'safe',
    name: 'Stream-safe',
    about: 'Hides file paths, your name and keys behind stand-ins, so nothing slips out on stream.',
    tone: 'switch',
    defaultOn: true,
    face: (s) => ({ command: 'view.streamSafe', label: 'Stream-safe', caption: onOff(s.streamSafe), on: s.streamSafe, needsWindow: false }),
  },
  {
    id: 'capture',
    name: 'Capture view',
    about: 'Opens or closes the clean window your streaming program captures.',
    tone: 'switch',
    defaultOn: false,
    face: (s) => ({ command: 'capture.toggle', label: 'Capture view', caption: onOff(s.captureOpen), on: s.captureOpen, needsWindow: false }),
  },
  {
    id: 'obs',
    name: 'Look for OBS',
    about: 'Asks Frameling to look for OBS again right now.',
    tone: 'action',
    defaultOn: false,
    face: () => ({ command: 'stream.obsLook', label: 'Look for OBS', caption: '', on: null, needsWindow: false }),
  },
];

export const TILE_IDS: readonly string[] = TILES.map((t) => t.id);

export const tileById = (id: string): TileDef | undefined => TILES.find((t) => t.id === id);

/** The one red button, kept apart from the tiles and in the same place every time. It is a command like the rest. */
export const STOP_COMMAND = 'audience.kill';
export const STOP_LABEL = 'Stop everything';
