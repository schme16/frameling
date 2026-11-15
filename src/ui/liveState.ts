// The one Live pill in the title bar: what it says for every mix of "audience participation is on" and "what OBS is doing".
// Plain decisions only (no window, no timers), so each combination can be tested on its own. The pill itself is LivePill.tsx.
//
// Two different things share it, and the pill never blurs them:
//  - The audience part (yellow, a plain information colour) says audience participation is on. Pressing it turns it off.
//    A small arrow part beside it opens the card, with the waiting count. It shows whenever audience participation is
//    on, whatever OBS is doing, and it is never red: it does not know whether you are going out to the world.
//  - The OBS part says what OBS is doing, in its own segment with its own colour. Green when OBS is connected and ready,
//    red only while OBS is really recording or streaming.
import type { ObsLinkState, ObsState } from '../streamsafe/obsLogic';

export type ObsKind = 'live' | 'rec' | 'ready' | 'looking' | 'quiet' | 'fix';

export interface LivePillInput {
  /** Audience features are on. */
  audience: boolean;
  /** How many audience things are waiting in the queue. */
  waiting: number;
  /** What OBS is doing. link 'off' means Going live with OBS is switched off, so there is nothing to say. */
  obs: Pick<ObsState, 'link' | 'streaming' | 'recording'>;
  /** The stop key as the person sees it ("Ctrl+Alt+K"), for the tooltip. Optional so tests need not know it. */
  stopKey?: string;
}

/** What the audience part says. Exactly these words, so nobody takes it for a broadcast light. */
export const AUDIENCE_WORD = 'Audience participation: on';

/** The colour of the OBS segment. Green is connected and ready, red is recording or streaming, nothing else is either. */
export type ObsColour = 'green' | 'red' | 'plain' | 'fix';

export function obsColour(kind: ObsKind): ObsColour {
  switch (kind) {
    case 'ready':
      return 'green';
    case 'live':
    case 'rec':
      return 'red';
    case 'fix':
      return 'fix';
    default:
      return 'plain';
  }
}

export interface AudiencePart {
  waiting: number;
  /** The words on the part that turns audience participation off. */
  word: string;
  /** Tooltip and detail for that part. Pressing it turns audience participation off. */
  tip: string;
  tipDetail: string;
  /** The small part that opens the card: its tooltip, detail and screen reader name. */
  openTip: string;
  openDetail: string;
  openLabel: string;
}

export interface LivePillModel {
  /** The look of the whole pill's edge: yellow for audience on, otherwise whatever OBS is. */
  tone: 'audience' | ObsKind;
  /** The audience part and the arrow that opens the card. Null while audience participation is off. */
  audience: AudiencePart | null;
  /** The OBS part. Null while Going live with OBS is off. */
  obs: { kind: ObsKind; colour: ObsColour; word: string; fix: boolean } | null;
  /** The sentence for the tooltip and for screen readers. */
  label: string;
  /** The line under it in the tooltip. */
  detail: string;
}

/** What OBS is, in one word of mood. */
export function obsKind(obs: LivePillInput['obs']): ObsKind | null {
  switch (obs.link) {
    case 'off':
      return null;
    case 'connecting':
      return 'looking';
    case 'waiting':
      return 'quiet';
    case 'password':
    case 'address':
      return 'fix';
    case 'connected':
      return obs.streaming ? 'live' : obs.recording ? 'rec' : 'ready';
  }
}

// The words on the pill. Short next to the audience part (the card and tooltip carry the rest), fuller when OBS is alone. Every
// state has its own words, so none can be mistaken for another at a glance.
const wordBeside = (kind: ObsKind, link: ObsLinkState): string => {
  switch (kind) {
    case 'live':
      return 'Live';
    case 'rec':
      return 'Rec';
    case 'ready':
      return 'OBS ready';
    case 'looking':
      return 'OBS...';
    case 'quiet':
      return 'No OBS';
    case 'fix':
      return link === 'address' ? 'OBS: address' : 'OBS: password';
  }
};
const wordAlone = (kind: ObsKind, link: ObsLinkState): string => {
  switch (kind) {
    case 'live':
      return 'Live';
    case 'rec':
      return 'Recording';
    case 'ready':
      return 'OBS: connected';
    case 'looking':
      return 'OBS: looking';
    case 'quiet':
      return 'OBS: not found';
    case 'fix':
      return link === 'address' ? 'OBS: address' : 'OBS: password';
  }
};

const obsSaid = (kind: ObsKind, link: ObsLinkState, streaming: boolean, recording: boolean): string => {
  switch (kind) {
    case 'live':
      return recording && streaming ? 'You are live in OBS, and recording' : 'You are live in OBS';
    case 'rec':
      return 'OBS is recording';
    case 'ready':
      return 'Connected to OBS';
    case 'looking':
      return 'Looking for OBS';
    case 'quiet':
      return 'OBS is not running, or its WebSocket server is off. Frameling keeps looking quietly';
    case 'fix':
      return link === 'address' ? 'Frameling cannot use the address typed for OBS' : 'OBS wants a password Frameling does not have, or has the wrong one';
  }
};

const SHORT_SAID: Record<ObsKind, string> = { live: 'Live in OBS', rec: 'OBS is recording', ready: 'OBS connected', looking: 'Looking for OBS', quiet: 'OBS not found', fix: 'OBS needs you' };

/** What the pill shows, or null when there is nothing to say (audience features off and Going live with OBS off). */
export function livePill(input: LivePillInput): LivePillModel | null {
  const kind = obsKind(input.obs);
  if (!input.audience && !kind) return null;
  const { link, streaming, recording } = input.obs;
  const waiting = Math.max(0, input.waiting);
  const obs = kind ? { kind, colour: obsColour(kind), word: input.audience ? wordBeside(kind, link) : wordAlone(kind, link), fix: kind === 'fix' } : null;
  const key = input.stopKey ?? 'Ctrl+Alt+K';
  const audience: AudiencePart | null = input.audience
    ? {
        waiting,
        word: AUDIENCE_WORD,
        tip: `${AUDIENCE_WORD}. Press to turn it off`,
        tipDetail: `Empties the queue and stops every effect. ${key} does the same. It does not touch OBS.`,
        openTip: waiting ? `${waiting} waiting. See the queue` : 'See the queue and the counts',
        openDetail: 'Opens the card: what is waiting, what the audience has done, and the OBS settings.',
        openLabel: waiting ? `See the queue, ${waiting} waiting` : 'See the queue and the counts',
      }
    : null;
  const said = kind ? obsSaid(kind, link, streaming, recording) : '';

  let label: string;
  let detail: string;
  if (audience && kind) {
    label = `${AUDIENCE_WORD}${waiting ? `, ${waiting} waiting` : ''}. ${SHORT_SAID[kind]}`;
    detail = `${said}. Press for the queue and OBS. Turning audience participation off does not stop your stream.`;
  } else if (audience) {
    label = `${AUDIENCE_WORD}${waiting ? `, ${waiting} waiting` : ''}`;
    detail = 'Press the arrow to see what is waiting.';
  } else {
    label = obs!.word;
    detail = `${said}. Press for more.`;
  }
  return { tone: audience ? 'audience' : kind!, audience, obs, label, detail };
}
