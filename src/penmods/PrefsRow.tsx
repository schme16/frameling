// Preferences > Features: the list of every pen modifier, so the streamer knows what they signed up for, with a switch for
// each and a Try it button. They all reach the drawing (the strokes you draw while one is on are permanent), so the plain
// words about the switch that lets them run at all sit at the top, with a button for it.
import { useSyncExternalStore } from 'react';
import { audience, setAudienceDrawing } from '../audience';
import { isFeatureOn } from '../features/host';
import { useFeaturesVersion } from '../features/use';
import { Icon } from '../ui/icons';
import { openHelp } from '../ui/overlays';
import { penMods } from './catalogue';
import { setPenModEnabled, stopPenMods, tryPenMod } from './registry';
import './penmods.css';

export function PenModsPrefsRow() {
  useFeaturesVersion();
  const snap = useSyncExternalStore(audience.subscribe, audience.snapshot);
  if (!isFeatureOn('stream-penmods')) return null;
  const enabledOf = (id: string) => snap.actions.find((a) => a.id === id)?.enabled ?? true;
  const drawingOn = snap.drawingAllowed;
  return (
    <div className="pm-prefs" data-testid="penmods.prefs">
      <h3>Pen modifiers</h3>
      <p className="ui-pref-intro" data-testid="penmods.drawingNote">
        {drawingOn
          ? 'You have allowed these. For a while, your pen steadies, shakes or changes size, and every line you draw meanwhile is yours to keep. Each line is a normal step, so Undo takes it back. Your own settings are never changed.'
          : 'These are off, because "Let the audience interrupt your drawing" is off. Until you turn that on, your audience cannot set any of them off. Try it still works, because it is your own hand.'}
      </p>
      <div>
        <button type="button" className="ui-btn ui-btn-quiet" data-testid="penmods.allow" onClick={() => setAudienceDrawing(!drawingOn)}>
          {drawingOn ? 'Stop letting the audience interrupt my drawing' : 'Let the audience interrupt my drawing'}
        </button>
      </div>
      {penMods.map((m) => {
        const enabled = enabledOf(m.id);
        return (
          <div className="ui-pref-row" key={m.id} data-testid={`penmods.row.${m.id}`}>
            <div className="ui-pref-text">
              <strong>{m.label}</strong>
              <span>
                {m.about}
                {!drawingOn && enabled ? ' Waiting for the interrupt switch above.' : ''}
              </span>
            </div>
            <div className="ui-pref-control">
              <button type="button" className="ui-btn ui-btn-quiet" data-testid={`penmods.try.${m.id}`} onClick={() => tryPenMod(m.id)}>
                Try it
              </button>
              <button type="button" role="switch" aria-checked={enabled} aria-label={`${m.label}, on or off`} data-testid={`penmods.switch.${m.id}`} className={`ui-switch${enabled ? ' is-on' : ''}`} onClick={() => setPenModEnabled(m.id, !enabled)}>
                <span className="ui-switch-knob" />
              </button>
            </div>
          </div>
        );
      })}
      <div>
        <button type="button" className="ui-btn ui-btn-quiet" data-testid="penmods.stop" onClick={() => stopPenMods()}>
          Put my pen back
        </button>
        <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp('pen-modifiers')}>
          <Icon name="help" size={14} /> How pen modifiers work
        </button>
      </div>
    </div>
  );
}
