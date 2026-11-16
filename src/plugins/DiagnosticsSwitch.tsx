// The switch for measuring plugins' memory and speed. It lives in Preferences, Diagnostics, opposite its group title
// (PrefTitle), because it is a whole thing you turn on rather than an option you tick: on, every plugin runs in its own
// process so its memory can be read, which costs memory and a restart.
import { useEffect, useState } from 'react';
import { desktop } from '../io/desktop';
import { restartFrameling } from '../io/restart';
import { PrefTitle } from '../ui/PrefTitle';
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
  const needsRestart = !!desktop()?.plugins && measurable !== null && on !== measurable;
  return (
    <div className="plugin-powers" role="group" aria-label="Plugin measuring">
      <PrefTitle
        level="group"
        title="Plugin measuring"
        label="Measuring plugins' memory and speed, on or off"
        on={on}
        onChange={(next) => {
          setPrefs({ pluginDiagnostics: next });
          syncDiagnosticsFlag(next);
          void refreshDiag();
        }}
        switchTestId="plugins.diagnostics.switch"
        statusTestId="plugins.diagnostics.status"
        about={<p className="ui-pref-intro">See how much memory and time your plugins use. The numbers show in Preferences, Plugins. It uses more memory, because every plugin needs its own process to be measured.</p>}
        status={note}
      />
      {needsRestart && (
        <div className="tb-check-buttons">
          <button type="button" className="ui-btn ui-btn-small" onClick={() => void restartFrameling()}>
            Restart now
          </button>
        </div>
      )}
    </div>
  );
}
