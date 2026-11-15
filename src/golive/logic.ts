// The Go live quest's checks as plain functions of a snapshot, so they can be tested without a window. quest.ts builds
// the snapshot from the real app.

export type GoLiveStep = 'audience' | 'door' | 'obs' | 'safe' | 'twitch' | 'overlay' | 'test';

/** The order of the steps, which is the order the streaming setup makes sense in. */
export const GO_LIVE_STEPS: readonly GoLiveStep[] = ['audience', 'door', 'obs', 'safe', 'twitch', 'overlay', 'test'];

export interface GoLiveSnapshot {
  /** Audience features are on (so the two first-time questions have been answered). */
  audienceOn: boolean;
  /** The Firebot setup file was saved during the quest. */
  setupFileSaved: boolean;
  /** The actions door's address was copied during the quest. */
  doorAddressCopied: boolean;
  /** OBS answered on its WebSocket connection. */
  obsConnected: boolean;
  streamSafeOn: boolean;
  twitchSignedIn: boolean;
  /** The overlay's address was copied during the quest. */
  overlayAddressCopied: boolean;
  /** "Show a test" on the overlay was pressed during the quest. */
  overlayTested: boolean;
}

/** What each step needs to be true. Each says that something happened, not only that a switch is on. */
export function stepDone(step: GoLiveStep, s: GoLiveSnapshot): boolean {
  switch (step) {
    case 'audience':
      return s.audienceOn;
    case 'door':
      // Firebot users save the file, everybody else copies the address.
      return s.setupFileSaved || s.doorAddressCopied;
    case 'obs':
      return s.obsConnected;
    case 'safe':
      return s.streamSafeOn;
    case 'twitch':
      return s.twitchSignedIn;
    case 'overlay':
      return s.overlayAddressCopied;
    case 'test':
      return s.overlayTested;
  }
}

/** The first step that is not done yet, or null when they all are. */
export function firstUndone(s: GoLiveSnapshot): GoLiveStep | null {
  return GO_LIVE_STEPS.find((step) => !stepDone(step, s)) ?? null;
}

/** How many of the steps are done. */
export const doneCount = (s: GoLiveSnapshot): number => GO_LIVE_STEPS.filter((step) => stepDone(step, s)).length;
