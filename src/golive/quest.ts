// "Go live": the guided way through setting up a stream, with a check at every step that it really happened. All of it
// is on Preferences > Streaming, so the quest keeps that page open and rings the next thing. It is the doing of the
// route that the help page "Getting your viewers taking part" explains; that page also covers what comes after (links,
// chat commands, a first vote). Listed in src/quests/library.ts with the other later quests.
import { audience } from '../audience';
import { hasStreamMark, resetStreamMarks } from '../features/streamMarks';
import { streamSafe } from '../core/streamSafe';
import { obs, setObsLink } from '../streamsafe/obs';
import { twitchStatus } from '../twitch/state';
import type { Quest } from '../quests/types';
import { questWord } from '../words/quests';
import { stepDone, type GoLiveSnapshot, type GoLiveStep } from './logic';
import { showStreamingPage } from './reveal';

/** The app as the checks see it. */
export function snapshot(): GoLiveSnapshot {
  return {
    audienceOn: audience.isOn(),
    setupFileSaved: hasStreamMark('setupFile'),
    doorAddressCopied: hasStreamMark('doorAddress'),
    obsConnected: obs.state.link === 'connected',
    streamSafeOn: streamSafe(),
    twitchSignedIn: twitchStatus.get().state === 'signed-in',
    overlayAddressCopied: hasStreamMark('overlayAddress'),
    overlayTested: hasStreamMark('overlayTest'),
  };
}

const done = (step: GoLiveStep) => () => stepDone(step, snapshot());

/** The questions the first switch-on asks. They are asked in the quest as usual, so they are never asked twice. */
const QUESTIONS = ['audience.strictness', 'audience.view'];

const T = {
  audience: '[data-testid="audience.switch"]',
  door: '[data-testid="streamdoor.firebotSetup"]',
  doorPanel: '[data-testid="streamdoor.prefs"]',
  obs: '[data-testid="obs.panel"]',
  obsSwitch: '[data-obs-section] [role="switch"]',
  safe: '[role="switch"][aria-label="Stream-safe mode"]',
  twitch: '[data-testid="twitch.connect"]',
  twitchBox: '[data-testid="twitch.connectBox"]',
  overlayCopy: '[data-testid="streamoverlay.copy"]',
  overlayPanel: '[data-testid="streamoverlay.prefs"]',
  overlayTest: '[data-testid="streamoverlay.test"]',
};

export const GO_LIVE_QUEST: Quest = {
  id: 'go-live',
  title: questWord('quest.go-live.title'),
  summary: questWord('quest.go-live.summary'),
  minutes: 6,
  icon: 'live',
  badge: { id: 'showrunner', name: questWord('quest.go-live.badge'), icon: 'live', color: '--rose' },
  features: ['stream-door', 'stream-overlay', 'stream-twitch'],
  asks: QUESTIONS,
  finish: questWord('quest.go-live.finish'),
  steps: [
    {
      id: 'audience',
      say: questWord('quest.go-live.audience.say'),
      why: questWord('quest.go-live.audience.why'),
      target: [T.audience],
      enter: () => {
        // Only what is done in the quest counts, so a copy from before it started does not skip a step.
        resetStreamMarks();
        showStreamingPage(T.audience);
      },
      done: done('audience'),
      show: 'audience.toggle',
      hint: questWord('quest.go-live.audience.hint'),
      help: 'audience',
    },
    {
      id: 'door',
      say: questWord('quest.go-live.door.say'),
      why: questWord('quest.go-live.door.why'),
      target: [T.door, T.doorPanel],
      enter: () => showStreamingPage(T.door, T.doorPanel),
      done: done('door'),
      show: 'streamdoor.firebotSetup',
      hint: questWord('quest.go-live.door.hint'),
      help: 'actions-door',
    },
    {
      id: 'obs',
      say: questWord('quest.go-live.obs.say'),
      why: questWord('quest.go-live.obs.why'),
      target: [T.obs, T.obsSwitch],
      enter: () => showStreamingPage(T.obs, T.obsSwitch),
      done: done('obs'),
      show: () => {
        setObsLink(true);
        showStreamingPage(T.obs, T.obsSwitch);
      },
      hint: questWord('quest.go-live.obs.hint'),
      hintAfter: 30,
      help: 'obs-golive',
    },
    {
      id: 'safe',
      say: questWord('quest.go-live.safe.say'),
      why: questWord('quest.go-live.safe.why'),
      target: [T.safe],
      enter: () => showStreamingPage(T.safe),
      done: done('safe'),
      show: 'view.streamSafe',
      hint: questWord('quest.go-live.safe.hint'),
      help: 'stream-safe',
    },
    {
      id: 'twitch',
      say: questWord('quest.go-live.twitch.say'),
      why: questWord('quest.go-live.twitch.why'),
      target: [T.twitch, T.twitchBox],
      enter: () => showStreamingPage(T.twitch, T.twitchBox),
      done: done('twitch'),
      show: 'twitch.connect',
      hint: questWord('quest.go-live.twitch.hint'),
      hintAfter: 40,
      help: 'twitch',
    },
    {
      id: 'overlay',
      say: questWord('quest.go-live.overlay.say'),
      why: questWord('quest.go-live.overlay.why'),
      target: [T.overlayCopy, T.overlayPanel],
      enter: () => showStreamingPage(T.overlayCopy, T.overlayPanel),
      done: done('overlay'),
      show: 'streamoverlay.copyAddress',
      hint: questWord('quest.go-live.overlay.hint'),
      hintAfter: 40,
      help: 'stream-overlay',
    },
    {
      id: 'test',
      say: questWord('quest.go-live.test.say'),
      why: questWord('quest.go-live.test.why'),
      target: [T.overlayTest],
      enter: () => showStreamingPage(T.overlayTest),
      done: done('test'),
      show: 'streamoverlay.test',
      hint: questWord('quest.go-live.test.hint'),
      help: 'stream-overlay',
    },
  ],
};
