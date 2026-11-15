// Preferences > Streaming: the actions door's address, its key and its port. The key is hidden until someone presses
// Show, hidden again after a few seconds, never shown while stream-safe mode is on (it can still be copied), and
// every drawing of it goes through displaySecret.
import { useEffect, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { audience } from '../audience';
import { displaySecret, HIDDEN, useStreamSafe } from '../core/streamSafe';
import { isFeatureOn } from '../features/host';
import { useFeaturesVersion } from '../features/use';
import { Icon } from '../ui/icons';
import { openHelp } from '../ui/overlays';
import { toast } from '../ui/toast';
import { validDoorPort } from '../shared/streamDoor';
import { rollKey } from './commands';
import { copyAddress, copyKey, fetchKey } from './copy';
import { saveFirebotSetup } from './firebotFile';
import { doorLink } from './instance';
import { doorStatus, preferredPort, setPreferredPort } from './state';
import './streamdoor.css';

/** How long a shown key stays shown, in milliseconds. */
export const SHOW_FOR_MS = 15_000;

export function StreamDoorPrefsRow() {
  useFeaturesVersion();
  const on = isFeatureOn('stream-door');
  const status = doorStatus.use((s) => s);
  const audienceOn = useSyncExternalStore(audience.subscribe, () => audience.isOn());
  const safe = useStreamSafe();
  const [shown, setShown] = useState<string | null>(null);
  const [port, setPort] = useState(String(preferredPort()));

  // Hidden again after a few seconds, and the moment stream-safe mode goes on.
  useEffect(() => {
    if (shown === null) return;
    const t = setTimeout(() => setShown(null), SHOW_FOR_MS);
    return () => clearTimeout(t);
  }, [shown]);
  useEffect(() => {
    if (safe) setShown(null);
  }, [safe]);
  useEffect(() => () => setShown(null), []);

  if (!on) return null;

  const reveal = async () => {
    if (shown !== null) return setShown(null);
    if (safe) return;
    const k = await fetchKey();
    if (!k) toast('The actions door needs the desktop app.', { kind: 'warn' });
    else setShown(k);
  };
  const usePort = () => {
    const n = Number(port);
    if (!validDoorPort(n)) return void toast('Pick a port between 1024 and 65535.', { kind: 'warn' });
    setPreferredPort(n);
    if (audience.isOn()) doorLink.reopen();
    toast(`The actions door will use port ${n}.`, { kind: 'success' });
  };

  let line: string;
  if (status.running) line = status.moved ? `Open. Port ${preferredPort()} was taken, so it moved to ${status.port}. Point your stream tool at the address below.` : 'Open, on this computer only.';
  else if (status.problem === 'port-busy') line = `Closed. Port ${status.port} is taken by another program. Pick another port below.`;
  else if (status.problem === 'failed') line = 'Closed. It could not start. Try another port below.';
  else line = audienceOn ? 'Opening...' : 'Closed. It opens when audience features are on.';

  return (
    <div className="sd-prefs" data-testid="streamdoor.prefs">
      <h4>Actions door</h4>
      <p className="ui-pref-intro" data-testid="streamdoor.status">
        {line}
      </p>
      <div className="ui-pref-row">
        <div className="ui-pref-text">
          <strong>Address</strong>
          <span>Where Streamer.bot, Firebot or a Stream Deck sends its requests.</span>
        </div>
        <div className="ui-pref-control sd-control">
          <code className="sd-code" data-testid="streamdoor.address">
            {status.running ? status.address : `http://127.0.0.1:${status.port}`}
          </code>
          <button type="button" className="ui-btn ui-btn-quiet" data-testid="streamdoor.copyAddress" onClick={() => void copyAddress()} disabled={!status.running}>
            Copy
          </button>
        </div>
      </div>
      <div className="ui-pref-row">
        <div className="ui-pref-text">
          <strong>Key (token)</strong>
          <span>{safe ? 'Stream-safe mode is on, so the key stays hidden. You can still copy it.' : 'Hidden until you press Show. Every request has to carry it.'}</span>
        </div>
        <div className="ui-pref-control sd-control">
          <code className="sd-code sd-key" data-testid="streamdoor.key" aria-label={shown === null ? 'The key, hidden' : 'The key, shown'}>
            {shown === null ? HIDDEN : displaySecret(shown)}
          </code>
          <button type="button" className="ui-btn ui-btn-quiet" data-testid="streamdoor.reveal" onClick={() => void reveal()} disabled={safe}>
            <Icon name={shown === null ? 'eye' : 'eye-off'} size={14} /> {shown === null ? 'Show' : 'Hide'}
          </button>
          <button type="button" className="ui-btn ui-btn-quiet" data-testid="streamdoor.copyKey" onClick={() => void copyKey()}>
            Copy
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-quiet"
            data-testid="streamdoor.roll"
            onClick={() =>
              void rollKey().then((did) => {
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
          <span>If another program has it, Frameling asks whether to use the next free one.</span>
        </div>
        <div className="ui-pref-control sd-control">
          <input className="sd-port" type="number" min={1024} max={65535} value={port} data-testid="streamdoor.port" aria-label="Port" onChange={(e) => setPort(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && usePort()} />
          <button type="button" className="ui-btn ui-btn-quiet" data-testid="streamdoor.usePort" onClick={usePort}>
            Use this port
          </button>
        </div>
      </div>
      <div className="ui-pref-row">
        <div className="ui-pref-text">
          <strong>Firebot setup file</strong>
          <span>Adds !vote, !guess and !prompt to Firebot in one import. It has the address but not the key: Firebot asks you to paste that.</span>
        </div>
        <div className="ui-pref-control sd-control">
          <button type="button" className="ui-btn ui-btn-quiet" data-testid="streamdoor.firebotSetup" onClick={() => void saveFirebotSetup()}>
            Save setup file
          </button>
        </div>
      </div>
      <div>
        <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp('actions-door')}>
          <Icon name="help" size={14} /> How to point Streamer.bot or Firebot at it
        </button>{' '}
        <button type="button" className="ui-btn ui-btn-quiet" data-testid="streamdoor.firebotHelp" onClick={() => openHelp('chat-commands-firebot')}>
          <Icon name="help" size={14} /> Using the Firebot setup file
        </button>
      </div>
    </div>
  );
}
