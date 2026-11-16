// Preferences > Plugins > Remote door: the switch, and beside it the address and the key. The key is hidden until someone
// presses Show, hidden again after a few seconds, never shown while stream-safe mode is on (it can still be copied), and
// every drawing of it goes through displaySecret. The switch is not remembered: Frameling always starts with it off.
import { useEffect, useState } from 'react';
import { displaySecret, HIDDEN, useStreamSafe } from '../core/streamSafe';
import { Icon } from '../ui/icons';
import { openHelp } from '../ui/overlays';
import { toast } from '../ui/toast';
import { validRemotePort } from '../shared/remoteDoor';
import { copyRemoteAddress, copyRemoteKey, fetchRemoteKey } from './copy';
import { RemoteLog } from './RemoteBadge';
import { preferredRemotePort, remoteStatus, setPreferredRemotePort } from './state';
import { hasRemote, rollRemoteKey, setRemoteOn } from './switch';
import './remotedoor.css';

/** How long a shown key stays shown, in milliseconds. */
export const SHOW_FOR_MS = 15_000;

export function RemoteDoorPrefsRow() {
  const status = remoteStatus.use((s) => s);
  const safe = useStreamSafe();
  const [shown, setShown] = useState<string | null>(null);
  const [port, setPort] = useState(String(preferredRemotePort()));
  const desk = hasRemote();

  useEffect(() => {
    if (shown === null) return;
    const t = setTimeout(() => setShown(null), SHOW_FOR_MS);
    return () => clearTimeout(t);
  }, [shown]);
  useEffect(() => {
    if (safe) setShown(null);
  }, [safe]);
  useEffect(() => () => setShown(null), []);

  const reveal = async () => {
    if (shown !== null) return setShown(null);
    if (safe) return;
    const k = await fetchRemoteKey();
    if (!k) toast('The remote door needs the desktop app.', { kind: 'warn' });
    else setShown(k);
  };
  const usePort = () => {
    const n = Number(port);
    if (!validRemotePort(n)) return void toast('Pick a port between 1024 and 65535.', { kind: 'warn' });
    setPreferredRemotePort(n);
    toast(status.running ? `The remote door will use port ${n} the next time you switch it on.` : `The remote door will use port ${n}.`, { kind: 'success' });
  };

  let line: string;
  if (!desk) line = 'Off. The remote door needs the desktop app.';
  else if (status.running) line = status.moved ? `Open, on this computer only, on port ${status.port}.` : 'Open, on this computer only. Programs that have the key can drive Frameling.';
  else if (status.problem === 'port-busy') line = `Off. Port ${status.port} is taken by another program. Pick another below.`;
  else if (status.problem === 'failed') line = 'Off. It could not start. Try another port below.';
  else line = 'Off. Nothing is listening on this computer.';

  return (
    <div className="rd-prefs" data-testid="remote.prefs" data-help="remote-door">
      <h4>Remote door</h4>
      <p className="ui-pref-intro">Lets another program on this computer drive Frameling, for testing and automation. Off every time Frameling starts, and nothing listens until you switch it on.</p>
      <div className="ui-pref-row">
        <div className="ui-pref-text">
          <strong>Let another program drive Frameling</strong>
          <span data-testid="remote.status">{line}</span>
        </div>
        <div className="ui-pref-control">
          <button type="button" role="switch" aria-checked={status.running} aria-label="Remote door on or off" data-testid="remote.switch" disabled={!desk} className={`ui-switch${status.running ? ' is-on' : ''}`} onClick={() => void setRemoteOn(!status.running)}>
            <span className="ui-switch-knob" />
          </button>
        </div>
      </div>
      <div className="ui-pref-row">
        <div className="ui-pref-text">
          <strong>Address</strong>
          <span>Where a program sends its requests.</span>
        </div>
        <div className="ui-pref-control">
          <code className="rd-code" data-testid="remote.address">
            {status.running ? status.address : `http://127.0.0.1:${status.port}`}
          </code>
          <button type="button" className="ui-btn ui-btn-quiet" data-testid="remote.copyAddress" onClick={() => void copyRemoteAddress()} disabled={!status.running}>
            Copy
          </button>
        </div>
      </div>
      <div className="ui-pref-row">
        <div className="ui-pref-text">
          <strong>Key (token)</strong>
          <span>{safe ? 'Stream-safe mode is on, so the key stays hidden. You can still copy it.' : 'Hidden until you press Show. Every request has to carry it.'}</span>
        </div>
        <div className="ui-pref-control">
          <code className="rd-code" data-testid="remote.key" aria-label={shown === null ? 'The key, hidden' : 'The key, shown'}>
            {shown === null ? HIDDEN : displaySecret(shown)}
          </code>
          <button type="button" className="ui-btn ui-btn-quiet" data-testid="remote.reveal" onClick={() => void reveal()} disabled={safe || !desk}>
            <Icon name={shown === null ? 'eye' : 'eye-off'} size={14} /> {shown === null ? 'Show' : 'Hide'}
          </button>
          <button type="button" className="ui-btn ui-btn-quiet" data-testid="remote.copyKey" onClick={() => void copyRemoteKey()} disabled={!desk}>
            Copy
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-quiet"
            data-testid="remote.roll"
            disabled={!desk}
            onClick={() =>
              void rollRemoteKey().then((did) => {
                if (did) setShown(null);
              })
            }
          >
            Make a new one
          </button>
        </div>
      </div>
      <div className="ui-pref-row">
        <div className="ui-pref-text">
          <strong>Port</strong>
          <span>If another program has it, the door stays off and says so. Used the next time you switch it on.</span>
        </div>
        <div className="ui-pref-control">
          <input className="rd-port ui-input" type="number" min={1024} max={65535} value={port} data-testid="remote.port" aria-label="Port" onChange={(e) => setPort(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && usePort()} />
          <button type="button" className="ui-btn ui-btn-quiet" data-testid="remote.usePort" onClick={usePort}>
            Use this port
          </button>
        </div>
      </div>
      <div className="ui-pref-row rd-logrow">
        <div className="ui-pref-text">
          <strong>What it has done</strong>
          <span>Each change a program made, and when. Kept only while Frameling is open, and never sent anywhere. Just looking is not listed.</span>
          <RemoteLog limit={12} />
        </div>
      </div>
      <div>
        <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp('remote-door')}>
          <Icon name="help" size={14} /> How the remote door works
        </button>
      </div>
    </div>
  );
}
