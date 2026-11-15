// Preferences > Features: the list of every dare, so the streamer knows what they signed up for, with a switch for each
// and a Try it button. The dares that reach the drawing sit in their own group, with the plain words about the switch
// that lets them run at all (which lives in the Audience features block above).
import { useSyncExternalStore } from 'react';
import { audience, setAudienceDrawing } from '../audience';
import { isFeatureOn } from '../features/host';
import { useFeaturesVersion } from '../features/use';
import { Icon } from '../ui/icons';
import { openHelp } from '../ui/overlays';
import { allDares, type DareDef, type DareFamily } from './catalogue';
import { setDareEnabled, tryDare } from './registry';
import './dares.css';

function Row({ d, enabled, blocked }: { d: DareDef<any>; enabled: boolean; blocked: boolean }) {
  return (
    <div className="ui-pref-row" data-testid={`dares.row.${d.id}`}>
      <div className="ui-pref-text">
        <strong>{d.label}</strong>
        <span>
          {d.about}
          {blocked && enabled ? ' Waiting for the interrupt switch above.' : ''}
        </span>
      </div>
      <div className="ui-pref-control">
        <button type="button" className="ui-btn ui-btn-quiet" data-testid={`dares.try.${d.id}`} onClick={() => tryDare(d.id)}>
          Try it
        </button>
        <button type="button" role="switch" aria-checked={enabled} aria-label={`${d.label}, on or off`} data-testid={`dares.switch.${d.id}`} className={`ui-switch${enabled ? ' is-on' : ''}`} onClick={() => setDareEnabled(d.id, !enabled)}>
          <span className="ui-switch-knob" />
        </button>
      </div>
    </div>
  );
}

export function DaresPrefsRow() {
  useFeaturesVersion();
  const snap = useSyncExternalStore(audience.subscribe, audience.snapshot);
  if (!isFeatureOn('stream-dares')) return null;
  const enabledOf = (id: string) => snap.actions.find((a) => a.id === id)?.enabled ?? true;
  const group = (family: DareFamily) => allDares.filter((d) => d.family === family);
  const drawingOn = snap.drawingAllowed;
  return (
    <div className="dr-prefs" data-testid="dares.prefs">
      <h3>Audience dares</h3>
      <p className="ui-pref-intro">Everything your audience can dare you to do, and a switch for each. Dares only come in while audience features are on. Try it fires one yourself, so you can see it.</p>
      <h4 className="dr-group">Only change how the screen looks</h4>
      {group('view').map((d) => (
        <Row key={d.id} d={d} enabled={enabledOf(d.id)} blocked={false} />
      ))}
      <h4 className="dr-group">Reach your drawing</h4>
      <p className="ui-pref-intro" data-testid="dares.drawingNote">
        {drawingOn
          ? 'You have allowed these. Each one adds or nudges something as a single step, so one Undo takes it back. None of them delete, clear or flatten anything.'
          : 'These are off, because "Let the audience interrupt your drawing" is off. Until you turn that on, your audience cannot run any of them.'}
      </p>
      <div>
        <button type="button" className="ui-btn ui-btn-quiet" data-testid="dares.allow" onClick={() => setAudienceDrawing(!drawingOn)}>
          {drawingOn ? 'Stop letting the audience interrupt my drawing' : 'Let the audience interrupt my drawing'}
        </button>
      </div>
      {group('drawing').map((d) => (
        <Row key={d.id} d={d} enabled={enabledOf(d.id)} blocked={!drawingOn} />
      ))}
      <div>
        <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp('dares')}>
          <Icon name="help" size={14} /> How dares work
        </button>
      </div>
    </div>
  );
}
