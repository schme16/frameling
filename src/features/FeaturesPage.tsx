// Preferences > Features: the optional parts of Frameling, each with a switch. Quiet on purpose: nothing here is
// needed to start drawing.
import { Icon } from '../ui/icons';
import { openHelp } from '../ui/overlays';
import { toast } from '../ui/toast';
import { getCommand } from '../core/registry';
import { isFeatureOn, needsIt, offFeatures, setFeatureOn, switchableFeatures } from './host';
import type { FeatureDescriptor } from './feature';
import { STREAMING_NAME, STREAM_FEATURES, streamingCount } from './streamFamily';
import { useFeaturesVersion } from './use';
import { AudiencePrefsRow } from '../audience/PrefsRow';
import { StreamDoorPrefsRow } from '../streamdoor/PrefsRow';
import { StreamOverlayPrefsRow } from '../streamoverlay/PrefsRow';
import { TwitchPrefsRow } from '../twitch/PrefsRow';
import { DaresPrefsRow } from '../dares/PrefsRow';
import { PenModsPrefsRow } from '../penmods/PrefsRow';

/** One feature and its switch. A feature that something on needs keeps its switch, disabled, with the reason under it. */
function FeatureRow({ f, change }: { f: FeatureDescriptor; change: (id: string, on: boolean) => void }) {
  const on = isFeatureOn(f.id);
  const user = on ? needsIt(f.id) : undefined;
  const noteId = `feature-note-${f.id}`;
  return (
    <div className="ui-pref-row">
      <div className="ui-pref-text">
        <strong>{f.name}</strong>
        <span>{f.about}</span>
        {user && (
          <span id={noteId} className="ui-pref-note">
            {user.name} needs this. Turn off {user.name} first.
          </span>
        )}
      </div>
      <div className="ui-pref-control">
        <button type="button" role="switch" aria-checked={on} aria-label={`${f.name} on or off`} data-testid={`feature-switch-${f.id}`} aria-disabled={user ? true : undefined} aria-describedby={user ? noteId : undefined} className={`ui-switch${on ? ' is-on' : ''}${user ? ' is-disabled' : ''}`} onClick={() => !user && change(f.id, !on)}>
          <span className="ui-switch-knob" />
        </button>
      </div>
    </div>
  );
}

/** The streaming family as one row with one switch, and the nine below it for anybody who wants to pick. */
function StreamingGroup({ list, change }: { list: FeatureDescriptor[]; change: (id: string, on: boolean) => void }) {
  const count = streamingCount();
  const on = count > 0;
  const run = (id: 'features.streamingOff' | 'features.streamingOn') => getCommand(id)?.run();
  return (
    <div className="features-streaming" data-testid="features-streaming">
      <div className="ui-pref-row">
        <div className="ui-pref-text">
          <strong>{STREAMING_NAME}</strong>
          <span>For people who stream: chat dares, votes, a prompt jar, Twitch, a stream overlay and more. Switch it off if you never stream, and all of it goes out of the menus, lists and help. Nothing is lost, and it comes back with this switch.</span>
        </div>
        <div className="ui-pref-control">
          <button type="button" role="switch" aria-checked={on} aria-label={`${STREAMING_NAME} on or off`} data-testid="streaming-switch" className={`ui-switch${on ? ' is-on' : ''}`} onClick={() => run(on ? 'features.streamingOff' : 'features.streamingOn')}>
            <span className="ui-switch-knob" />
          </button>
        </div>
      </div>
      <details className="features-streaming-more">
        <summary>
          Choose one by one ({count} of {STREAM_FEATURES.length} on)
        </summary>
        {list.map((f) => (
          <FeatureRow key={f.id} f={f} change={change} />
        ))}
      </details>
    </div>
  );
}

export function FeaturesPage() {
  useFeaturesVersion();
  const all = switchableFeatures();
  const list = all.filter((f) => !STREAM_FEATURES.includes(f.id));
  const stream = STREAM_FEATURES.map((id) => all.find((f) => f.id === id)).filter((f): f is FeatureDescriptor => !!f);
  const change = (id: string, on: boolean) => {
    const r = setFeatureOn(id, on);
    if (!r.ok) toast(r.reason, { kind: 'warn' });
  };
  return (
    <div className="features-page" data-help="features">
      <h3>Features</h3>
      <p className="ui-pref-intro">Turn off the parts of Frameling you do not use, to keep things simple. Your drawings keep all their data either way, and a feature can come back whenever you like.</p>
      <div>
        {list.map((f) => (
          <FeatureRow key={f.id} f={f} change={change} />
        ))}
        {stream.length > 0 && <StreamingGroup list={stream} change={change} />}
      </div>
      <AudiencePrefsRow />
      <StreamDoorPrefsRow />
      <StreamOverlayPrefsRow />
      <TwitchPrefsRow />
      <DaresPrefsRow />
      <PenModsPrefsRow />
      {offFeatures().length > 0 && (
        <div>
          <button type="button" className="ui-btn" data-testid="features-all-on" onClick={() => offFeatures().forEach((f) => change(f.id, true))}>
            Turn everything back on
          </button>
        </div>
      )}
      <p className="ui-pref-intro">If you open a drawing that uses a feature that is off, Frameling asks if you want it back. If you say no, nothing is lost.</p>
      <div>
        <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp('features')}>
          <Icon name="help" size={14} /> How features work
        </button>
      </div>
    </div>
  );
}
