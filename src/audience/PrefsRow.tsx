// Preferences > Features: the master switch for audience features. Apart from the list of parts above it, because it is
// not a part you turn off to simplify: it is the one switch that lets anything from outside reach Frameling.
import { useSyncExternalStore } from 'react';
import { Icon } from '../ui/icons';
import { openHelp } from '../ui/overlays';
import { audience, setAudienceDrawing, setAudienceOn } from './index';

export function AudiencePrefsRow() {
  const on = useSyncExternalStore(audience.subscribe, () => audience.isOn());
  const drawing = useSyncExternalStore(audience.subscribe, () => audience.snapshot().drawingAllowed);
  return (
    <div className="aud-prefs" data-testid="audience.prefs">
      <h3>Audience features</h3>
      <div className="ui-pref-row">
        <div className="ui-pref-text">
          <strong>Audience features</strong>
          <span>Let viewers and stream tools join in, in small safe ways. Off until you switch it on, and a red On air pill shows while it is on.</span>
        </div>
        <div className="ui-pref-control">
          <button type="button" role="switch" aria-checked={on} aria-label="Audience features on or off" data-testid="audience.switch" className={`ui-switch${on ? ' is-on' : ''}`} onClick={() => setAudienceOn(!on)}>
            <span className="ui-switch-knob" />
          </button>
        </div>
      </div>
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
