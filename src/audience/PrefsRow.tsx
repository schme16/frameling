// Preferences > Streaming: the master switch for audience features, opposite its group title (PrefTitle). Apart from the
// list of parts above it, because it is not a part you turn off to simplify: it is the one switch that lets anything
// from outside reach Frameling.
import { useSyncExternalStore } from 'react';
import { Icon } from '../ui/icons';
import { openHelp } from '../ui/overlays';
import { PrefTitle } from '../ui/PrefTitle';
import { useFeaturesVersion } from '../features/use';
import { streamingOn } from '../features/streamFamily';
import { audience, setAudienceDrawing, setAudienceOn } from './index';

export function AudiencePrefsRow() {
  useFeaturesVersion();
  const on = useSyncExternalStore(audience.subscribe, () => audience.isOn());
  const drawing = useSyncExternalStore(audience.subscribe, () => audience.snapshot().drawingAllowed);
  // Tucked away with the rest of the streaming tools; the switch opposite the Streaming title brings it back.
  if (!streamingOn()) return null;
  return (
    <div className="aud-prefs" data-testid="audience.prefs">
      <PrefTitle
        level="group"
        title="Audience features"
        label="Audience features on or off"
        on={on}
        onChange={setAudienceOn}
        switchTestId="audience.switch"
        about={<p className="ui-pref-intro">Let viewers and stream tools join in, in small safe ways. Off until you switch it on, and a yellow Audience participation: on pill shows while it is on, and pressing it turns it off.</p>}
        status={on ? 'On. Viewers and stream tools can join in, in the small safe ways below.' : 'Off. Nothing from your viewers or stream tools reaches Frameling, and the tools below wait until you switch this on.'}
      />
      <div className="ui-pref-row">
        <div className="ui-pref-text">
          <strong>Let the audience interrupt your drawing</strong>
          <span>Lets dares and pen tricks from your audience change your drawing, each as one step that Undo takes back. Off until you switch it on. While it is off, anything that would touch your drawing is turned away.</span>
        </div>
        <div className="ui-pref-control">
          <button type="button" role="switch" aria-checked={drawing} aria-label="Let the audience interrupt your drawing, on or off" data-testid="audience.drawing" className={`ui-switch${drawing ? ' is-on' : ''}`} onClick={() => setAudienceDrawing(!drawing)}>
            <span className="ui-switch-knob" />
          </button>
        </div>
      </div>
      <div>
        <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp('audience')}>
          <Icon name="help" size={14} /> How audience features work
        </button>
      </div>
    </div>
  );
}
