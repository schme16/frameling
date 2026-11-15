// Preferences > Features: the optional parts of Frameling, each with a switch. Quiet on purpose: nothing here is
// needed to start drawing.
import { Icon } from '../ui/icons';
import { openHelp, openPrefs } from '../ui/overlays';
import { toast } from '../ui/toast';
import { FeatureRow } from './FeatureRow';
import { offFeatures, setFeatureOn, switchableFeatures } from './host';
import { STREAMING_NAME, STREAM_FEATURES } from './streamFamily';
import { useFeaturesVersion } from './use';

/** Streaming has a tab of its own now, so the Features page only points at it. */
function StreamingPointer() {
  return (
    <div className="ui-pref-row" data-testid="features-streaming-pointer">
      <div className="ui-pref-text">
        <strong>{STREAMING_NAME}</strong>
        <span>Dares, votes, the prompt jar, Twitch, the overlay and the rest have a tab of their own, with the switch for all of them.</span>
      </div>
      <div className="ui-pref-control">
        <button type="button" className="ui-btn" data-testid="features-open-streaming" onClick={() => openPrefs('streaming')}>
          Open the Streaming tab
        </button>
      </div>
    </div>
  );
}

export function FeaturesPage() {
  useFeaturesVersion();
  const all = switchableFeatures();
  const list = all.filter((f) => !STREAM_FEATURES.includes(f.id));
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
      </div>
      <StreamingPointer />
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
