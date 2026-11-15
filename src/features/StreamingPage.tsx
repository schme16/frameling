// Preferences > Streaming: everything about streaming and sharing a screen, in one place. The Streaming tools switch is
// first, with the sharing settings (Stream-safe, OBS, the capture view) next because they are for anybody who shares a
// screen, streamer or not. The nine tools and their settings are folded under "Choose one by one", and stay on the page
// while the family is tucked away, so this tab is always the way back.
import { useSyncExternalStore, type ReactNode } from 'react';
import { audience } from '../audience';
import { allChoices } from '../core/choices';
import { getCommand } from '../core/registry';
import { ChoiceRows } from '../ui/ChoiceDialog';
import { Icon } from '../ui/icons';
import { openHelp } from '../ui/overlays';
import { toast } from '../ui/toast';
import { AudiencePrefsRow } from '../audience/PrefsRow';
import { DaresPrefsRow } from '../dares/PrefsRow';
import { PenModsPrefsRow } from '../penmods/PrefsRow';
import { StreamDoorPrefsRow } from '../streamdoor/PrefsRow';
import { StreamOverlayPrefsRow } from '../streamoverlay/PrefsRow';
import { TwitchPrefsRow } from '../twitch/PrefsRow';
import { FeatureRow } from './FeatureRow';
import { setFeatureOn, switchableFeatures } from './host';
import { STREAM_FEATURES, STREAMING_NAME, streamingCount } from './streamFamily';
import type { FeatureDescriptor } from './feature';
import { useFeaturesVersion } from './use';

/** The group name the sharing settings sit under, which is also the group of their remembered answers. */
const SHARING = 'Sharing your screen';

export function StreamingPage({ sharing }: { sharing: ReactNode }) {
  useFeaturesVersion();
  const count = streamingCount();
  const on = count > 0;
  const audienceOn = useSyncExternalStore(audience.subscribe, () => audience.isOn());
  const all = switchableFeatures();
  const list = STREAM_FEATURES.map((id) => all.find((f) => f.id === id)).filter((f): f is FeatureDescriptor => !!f);
  const change = (id: string, v: boolean) => {
    const r = setFeatureOn(id, v);
    if (!r.ok) toast(r.reason, { kind: 'warn' });
  };
  const run = (id: 'features.streamingOff' | 'features.streamingOn') => getCommand(id)?.run();
  const answers = allChoices().filter((c) => c.category === 'Streaming');
  const sharingAnswers = allChoices().filter((c) => c.category === SHARING);
  return (
    <div className="streaming-page" data-help="streaming" data-testid="streaming-page">
      <h3>Streaming</h3>
      <p className="ui-pref-intro">Everything for streaming and sharing your screen. The tools for streamers can be tucked away, and the sharing settings stay for anybody.</p>
      {on && (
        <div className="ui-pref-row streaming-start" data-testid="streaming-start">
          <div className="ui-pref-text">
            <strong>Getting your viewers taking part</strong>
            <span>Twitch events need only a connection. Votes, guesses and typed prompts need a chat bot as well. The whole route, in order, is one page.</span>
          </div>
          <div className="ui-pref-control">
            <button type="button" className="ui-btn" data-testid="streaming-start-help" onClick={() => openHelp('viewers-take-part')}>
              <Icon name="help" size={14} /> Show me how
            </button>
          </div>
        </div>
      )}
      <section className="features-streaming" data-testid="features-streaming" aria-labelledby="streaming-tools-title">
        <h4 id="streaming-tools-title">The streaming tools</h4>
        <div className="ui-pref-row">
          <div className="ui-pref-text">
            <strong>{STREAMING_NAME}</strong>
            <span>For people who stream: chat dares, votes, a prompt jar, Twitch, a stream overlay and more. Switch it off if you never stream, and all of it goes out of the menus, lists and help. Nothing is lost, and it comes back with this switch.</span>
            <span data-testid="streaming-status">
              {!on ? 'The streaming tools are tucked away. Switch this on to bring them all back, or pick single ones under Choose one by one.' : audienceOn ? 'Audience features are on.' : 'Audience features are off, so none of these does anything yet. They only work once you switch on audience features, below.'}
            </span>
          </div>
          <div className="ui-pref-control">
            <button type="button" role="switch" aria-checked={on} aria-label={`${STREAMING_NAME} on or off`} data-testid="streaming-switch" className={`ui-switch${on ? ' is-on' : ''}`} onClick={() => run(on ? 'features.streamingOff' : 'features.streamingOn')}>
              <span className="ui-switch-knob" />
            </button>
          </div>
        </div>
        <details className="features-streaming-more" open={audienceOn || undefined}>
          <summary>
            Choose one by one ({count} of {STREAM_FEATURES.length} on)
          </summary>
          <AudiencePrefsRow />
          {list.map((f) => (
            <FeatureRow key={f.id} f={f} change={change} />
          ))}
          <StreamDoorPrefsRow />
          <StreamOverlayPrefsRow />
          <TwitchPrefsRow />
          <DaresPrefsRow />
          <PenModsPrefsRow />
          {answers.length > 0 && (
            <div data-testid="streaming-answers">
              <h4>Your usual answers</h4>
              <ChoiceRows list={answers} />
            </div>
          )}
        </details>
      </section>
      <section data-testid="streaming-sharing" aria-labelledby="streaming-sharing-title">
        <h4 id="streaming-sharing-title">{SHARING}</h4>
        <p className="ui-pref-intro">For anybody who shares a screen or goes live, with the streaming tools tucked away or not.</p>
        {sharing}
        {sharingAnswers.length > 0 && <ChoiceRows list={sharingAnswers} />}
      </section>
      <div>
        <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp('streaming')}>
          <Icon name="help" size={14} /> How streaming works
        </button>
      </div>
    </div>
  );
}
