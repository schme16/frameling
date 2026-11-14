// Preferences > Features: the optional parts of Frameling, each with a switch. Quiet on purpose: nothing here is
// needed to start drawing.
import { Icon } from '../ui/icons';
import { openHelp } from '../ui/overlays';
import { toast } from '../ui/toast';
import { isFeatureOn, needsIt, setFeatureOn, switchableFeatures } from './host';
import { useFeaturesVersion } from './use';

export function FeaturesPage() {
  useFeaturesVersion();
  const list = switchableFeatures();
  const change = (id: string, on: boolean) => {
    const r = setFeatureOn(id, on);
    if (!r.ok) toast(r.reason, { kind: 'warn' });
  };
  return (
    <div className="features-page" data-help="features">
      <h3>Features</h3>
      <p className="ui-pref-intro">Turn off the parts of Frameling you do not use, to keep things simple. Your drawings keep all their data either way, and a feature can come back whenever you like.</p>
      <div>
        {list.map((f) => {
          const on = isFeatureOn(f.id);
          // One that is on needs this feature: the switch stays, disabled, with the reason under it.
          const user = on ? needsIt(f.id) : undefined;
          const noteId = `feature-note-${f.id}`;
          return (
            <div key={f.id} className="ui-pref-row">
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
        })}
      </div>
      <p className="ui-pref-intro">If you open a drawing that uses a feature that is off, Frameling asks if you want it back. If you say no, nothing is lost.</p>
      <div>
        <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp('features')}>
          <Icon name="help" size={14} /> How features work
        </button>
      </div>
    </div>
  );
}
