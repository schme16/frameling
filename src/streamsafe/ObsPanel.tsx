import { useEffect, useRef, useState } from 'react';
import { displaySecret, useMaskedType } from '../core/streamSafe';
import { openHelp } from '../ui/overlays';
import { getPrefs, setPrefs, usePrefs } from '../ui/prefs';
import { obs, useObsState } from './obs';
import { OBS_DEFAULT_ADDRESS, isLive, parseObsAddress, type ObsState } from './obsLogic';
import './streamsafe.css';

/** One plain sentence about where the link is, for the settings. */
export function obsStatusLine(s: ObsState): string {
  switch (s.link) {
    case 'off':
      return 'Off. Frameling is not looking for OBS.';
    case 'connecting':
      return 'Looking for OBS...';
    case 'waiting':
      return 'OBS is not running, or its WebSocket server is off. That is fine: Frameling keeps looking quietly.';
    case 'password':
      return 'OBS wants a password. Type it below.';
    case 'address':
      return 'That address does not work. Try localhost:4455.';
    case 'connected':
      return isLive(s) ? (s.streaming ? 'Connected. OBS is streaming, so Stream-safe is on.' : 'Connected. OBS is recording, so Stream-safe is on.') : 'Connected to OBS.';
  }
}

/**
 * Preferences > General > Going live with OBS: the address, the password and a status line. The password goes straight to
 * the desktop side and is kept there, encrypted by the computer's own key store: it never comes back here, so there is
 * nothing in this page to show on a stream. The box is always dots.
 */
export function ObsPanel() {
  const on = usePrefs((p) => p.obsLink);
  const state = useObsState();
  const maskedType = useMaskedType();
  const [draft, setDraft] = useState(() => getPrefs().obsAddress);
  const [pw, setPw] = useState('');
  const [remember, setRemember] = useState(true);
  const [changing, setChanging] = useState(false);
  const [, tick] = useState(0);
  const pwBox = useRef<HTMLInputElement>(null);
  useEffect(() => obs.subscribe(() => tick((n) => n + 1)), []);
  useEffect(() => void obs.refreshPassword(), [on]);

  if (!on) return null;
  const parsed = parseObsAddress(draft);
  const saved = obs.password.hasPassword && !changing && state.link !== 'password';
  const commitAddress = () => {
    if (parsed.ok && draft.trim() !== getPrefs().obsAddress) setPrefs({ obsAddress: draft.trim() });
  };
  const sendPassword = () => {
    if (!pw) return;
    const v = pw;
    setPw('');
    setChanging(false);
    void obs.setPassword(v, remember && obs.password.canSave);
  };
  return (
    <div className="obs-panel" data-testid="obs.panel">
      <p className="obs-line" role="status" data-testid="obs.status">
        {obsStatusLine(state)}
      </p>
      <label className="ui-pref-text">
        <span>OBS address</span>
        <input
          type={maskedType}
          className="ui-input"
          data-testid="obs.address"
          aria-label="OBS address"
          value={draft /* stream-safe-ok: typed here, shown as dots while stream-safe */}
          placeholder={OBS_DEFAULT_ADDRESS}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitAddress}
          onKeyDown={(e) => e.key === 'Enter' && commitAddress()}
        />
      </label>
      {!parsed.ok && <p className="obs-line">{parsed.why}</p>}
      {saved ? (
        <>
          <p className="obs-line" data-testid="obs.pwSaved">
            {displaySecret('Password kept')}
            {obs.password.canSave ? ' on this computer, locked with its key store.' : ' until Frameling closes.'}
          </p>
          <div className="obs-buttons">
            <button
              type="button"
              className="tb-clear"
              onClick={() => {
                setChanging(true);
                setTimeout(() => pwBox.current?.focus(), 0);
              }}
            >
              Change password
            </button>
            <button type="button" className="tb-clear" data-testid="obs.forget" onClick={() => void obs.setPassword(null, false)}>
              Forget password
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="ui-pref-text">
            <span>OBS password (leave empty if OBS has none)</span>
            <input
              ref={pwBox}
              type="password"
              autoComplete="off"
              className="ui-input"
              data-testid="obs.password"
              aria-label="OBS password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendPassword()}
            />
          </label>
          {obs.password.canSave ? (
            <label className="obs-line">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember it on this computer
            </label>
          ) : (
            <p className="obs-line">This computer has no safe place to keep it, so Frameling keeps it only until it closes.</p>
          )}
          <div className="obs-buttons">
            <button type="button" className="tb-clear" data-testid="obs.pwSave" disabled={!pw} onClick={sendPassword}>
              Use this password
            </button>
          </div>
        </>
      )}
      <div className="obs-buttons">
        <button type="button" className="tb-clear" data-testid="obs.look" onClick={() => obs.lookNow()} disabled={state.link === 'connected' || state.link === 'connecting'}>
          Look for OBS now
        </button>
        <button type="button" className="tb-clear" data-help="obs-golive" onClick={() => openHelp('obs-golive')}>
          How to turn it on in OBS
        </button>
      </div>
    </div>
  );
}
