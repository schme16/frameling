import { Icon } from '../ui/icons';
import { openPrefs } from '../ui/overlays';
import { obs, useObsState } from './obs';
import { obsLook } from './obsLogic';
import './streamsafe.css';

/**
 * A small pill in the top bar while Going live with OBS is switched on, so you always know whether Frameling can see OBS.
 * Quiet when OBS is simply not running (a dim "not found"), clear when connected, and a nudge only when it needs you.
 * Pressing it looks for OBS again, or opens the settings when something needs fixing. Nothing shows while it is off.
 */
export function ObsBadge() {
  const state = useObsState();
  const look = obsLook(state);
  if (!look) return null;
  const fix = state.link === 'password' || state.link === 'address';
  return (
    <button
      type="button"
      className={`obs-badge obs-${look.tone}`}
      data-testid="obs.badge"
      data-state={state.link}
      data-help="obs-golive"
      data-tip={look.label}
      data-tip-desc={look.detail}
      onClick={() => (fix ? openPrefs('streaming', 'stream.obsLink') : obs.lookNow())}
    >
      <Icon name={look.tone === 'live' ? 'eye-off' : 'eye'} size={14} />
      {look.label}
    </button>
  );
}
