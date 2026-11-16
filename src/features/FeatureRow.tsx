// One feature and its switch, as Preferences > Features and Preferences > Streaming both show it.
import { isFeatureOn, needsIt } from './host';
import type { FeatureDescriptor } from './feature';

/** One feature and its switch. A feature that something on needs keeps its switch, disabled, with the reason under it. */
export function FeatureRow({ f, change }: { f: FeatureDescriptor; change: (id: string, on: boolean) => void }) {
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
