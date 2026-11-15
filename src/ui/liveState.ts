// The one Live pill in the title bar: what it says for every mix of "audience features are on" and "what OBS is doing".
// Plain decisions only (no window, no timers), so each combination can be tested on its own. The pill itself is LivePill.tsx.
//
// Two different things share it, and the pill never blurs them:
//  - The audience part (red, with a pulsing dot, the waiting count and Stop) means somebody outside can reach Frameling.
//    It shows whenever audience features are on, whatever OBS is doing, and Stop belongs to it alone.
//  - The OBS part says what OBS is doing, in its own segment. It never turns the pill red unless OBS really is live.
import type { ObsLinkState, ObsState } from '../streamsafe/obsLogic';

export type ObsKind = 'live' | 'rec' | 'ready' | 'looking' | 'quiet' | 'fix';

export interface LivePillInput {
  /** Audience features are on. */
  audience: boolean;
  /** How many audience things are waiting in the queue. */
  waiting: number;
  /** What OBS is doing. link 'off' means Going live with OBS is switched off, so there is nothing to say. */
  obs: Pick<ObsState, 'link' | 'streaming' | 'recording'>;
}

export interface LivePillModel {
  /** The look of the whole pill: red for audience on, otherwise whatever OBS is. */
  tone: 'air' | ObsKind;
  /** The On air part, with the waiting count and Stop. Null while audience features are off. */
  audience: { waiting: number } | null;
  /** The OBS part. Null while Going live with OBS is off. */
  obs: { kind: ObsKind; word: string; fix: boolean } | null;
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

// The words on the pill. Short next to On air (the card and tooltip carry the rest), fuller when OBS is alone. Every
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
  const obs = kind ? { kind, word: input.audience ? wordBeside(kind, link) : wordAlone(kind, link), fix: kind === 'fix' } : null;
  const audience = input.audience ? { waiting } : null;
  const said = kind ? obsSaid(kind, link, streaming, recording) : '';

  let label: string;
  let detail: string;
  if (audience && kind) {
    label = `Audience features are on${waiting ? `, ${waiting} waiting` : ''}. ${SHORT_SAID[kind]}`;
    detail = `${said}. Press for the queue and OBS. Stop ends audience features, not your stream.`;
  } else if (audience) {
    label = `Audience features are on${waiting ? `, ${waiting} waiting` : ''}`;
    detail = 'Press to see what is waiting.';
  } else {
    label = obs!.word;
    detail = `${said}. Press for more.`;
  }
  return { tone: audience ? 'air' : kind!, audience, obs, label, detail };
}
