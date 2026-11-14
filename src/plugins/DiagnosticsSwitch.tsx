// The switch for measuring plugins' memory and speed. It lives in Preferences, Diagnostics.
import { useEffect, useState } from 'react';
import { desktop } from '../io/desktop';
import { restartFrameling } from '../io/restart';
import { setPrefs, usePrefs } from '../ui/prefs';
import { diagnosticsAvailableNote, memoryMeasurable, refreshDiag, syncDiagnosticsFlag } from './manager';

/** The switch for measuring, with what it costs and what a restart does. */
export function DiagnosticsSwitch() {
  const on = usePrefs((p) => p.pluginDiagnostics);
  const [measurable, setMeasurable] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void memoryMeasurable().then((v) => live && setMeasurable(v));
    return () => {
      live = false;
    };
  }, []);
  const note = diagnosticsAvailableNote(on, !!desktop()?.plugins, measurable === true);
  return (
    <div className="plugin-powers" role="group" aria-label="Diagnostics">
      <div className="plugin-power">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Measure plugins' memory and speed (uses more memory)"
          className={`ui-switch${on ? ' is-on' : ''}`}
          onClick={() => {
            setPrefs({ pluginDiagnostics: !on });
            syncDiagnosticsFlag(!on);
            void refreshDiag();
          }}
        >
          <span className="ui-switch-knob" />
        </button>
        <span>
          <strong>Measure plugins' memory and speed</strong> <span className="plugin-item-by">(uses more memory)</span>
          <br />
          <span className="plugin-item-by">{note}</span>
          {!!desktop()?.plugins && measurable !== null && on !== measurable && (
            <>
              {' '}
              <button type="button" className="ui-btn ui-btn-small" onClick={() => void restartFrameling()}>
                Restart now
              </button>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
