// Preferences > Diagnostics > Updates: the switch for the quiet check, what it sends, and a button to check right now.
import { PrefTitle } from '../ui/PrefTitle';
import { setPrefs, usePrefs } from '../ui/prefs';
import { checkForUpdates } from './state';
import './update.css';

export function UpdatePanel() {
  const on = usePrefs((p) => p.updateCheck);
  const skipped = usePrefs((p) => p.updateSkipped);
  return (
    <div className="up-panel" data-help="updates">
      <PrefTitle
        level="group"
        title="New versions"
        label="Looking for new versions, on or off"
        on={on}
        onChange={(v) => setPrefs({ updateCheck: v })}
        switchTestId="update.switch"
        statusTestId="update.status"
        about={<p className="ui-pref-intro">A little after Frameling starts, and twice a day, it asks GitHub whether a newer version is out. Nothing is downloaded until you press Update now.</p>}
        status={
          on
            ? "On. What goes: one request to this project's releases on GitHub, which sees your internet address like any website does. Nothing of yours goes with it: no drawing, no name, no count of what you do."
            : 'Off. Nothing is asked of anyone. Frameling never looks by itself, and the button below still works whenever you want to know.'
        }
      />
      {skipped && (
        <p className="tb-note">
          You chose to skip {skipped}.{' '}
          <button type="button" className="ui-btn ui-btn-quiet" onClick={() => setPrefs({ updateSkipped: '' })}>
            Offer it again
          </button>
        </p>
      )}
      <div className="tb-check-buttons">
        <button type="button" className="tb-clear" onClick={() => void checkForUpdates({ manual: true })}>
          Check for updates now
        </button>
      </div>
    </div>
  );
}
