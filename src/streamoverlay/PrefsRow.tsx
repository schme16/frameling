// Preferences > Features: the stream overlay's address and how to put it in OBS. The address has a secret in it, so it
// is hidden until someone presses Show, hidden again after a few seconds, never shown while stream-safe mode is on (it
// can still be copied), and every drawing of it goes through displaySecret.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { audience } from '../audience';
import { displaySecret, useStreamSafe } from '../core/streamSafe';
import { isFeatureOn } from '../features/host';
import { useFeaturesVersion } from '../features/use';
import { Icon } from '../ui/icons';
import { openHelp } from '../ui/overlays';
import { toast } from '../ui/toast';
import { doorStatus } from '../streamdoor/state';
import { copyOverlayUrl, fetchOverlayUrl } from './copy';
import { rollOverlay } from './commands';
import { maskedAddress } from './state';
import { startOverlayTest } from './sources';
import '../streamdoor/streamdoor.css';
import './streamoverlay.css';

/** How long a shown address stays shown, in milliseconds. */
export const SHOW_FOR_MS = 15_000;

export function StreamOverlayPrefsRow() {
  useFeaturesVersion();
  const on = isFeatureOn('stream-overlay');
  const door = doorStatus.use((s) => s);
  const audienceOn = useSyncExternalStore(audience.subscribe, () => audience.isOn());
  const safe = useStreamSafe();
  const [shown, setShown] = useState<string | null>(null);

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
    const u = await fetchOverlayUrl();
    if (!u) toast('The overlay is not open yet. Switch audience features on first.', { kind: 'warn' });
    else setShown(u);
  };

  const line = door.running ? 'Ready. Add it to OBS as a browser source (the steps are below). It shows nothing until something happens.' : audienceOn ? 'Opening...' : 'Closed. It opens when audience features are on.';

  return (
    <div className="sd-prefs so-prefs" data-testid="streamoverlay.prefs">
      <h3>Stream overlay</h3>
      <p className="ui-pref-intro" data-testid="streamoverlay.status">
        {line}
      </p>
      <div className="ui-pref-row">
        <div className="ui-pref-text">
          <strong>Address</strong>
          <span>{safe ? 'Stream-safe mode is on, so the address stays hidden. You can still copy it.' : 'Hidden until you press Show. It has a secret in it, so keep it off stream.'}</span>
        </div>
        <div className="ui-pref-control sd-control">
          <code className="sd-code sd-key" data-testid="streamoverlay.address" aria-label={shown === null ? 'The overlay address, hidden' : 'The overlay address, shown'}>
            {shown === null ? maskedAddress(door.running ? door.address : '', door.port) : displaySecret(shown)}
          </code>
          <button type="button" className="ui-btn ui-btn-quiet" data-testid="streamoverlay.reveal" onClick={() => void reveal()} disabled={safe || !door.running}>
            <Icon name={shown === null ? 'eye' : 'eye-off'} size={14} /> {shown === null ? 'Show' : 'Hide'}
          </button>
          <button type="button" className="ui-btn ui-btn-quiet" data-testid="streamoverlay.copy" onClick={() => void copyOverlayUrl()} disabled={!door.running}>
            Copy
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-quiet"
            data-testid="streamoverlay.roll"
            onClick={() =>
              void rollOverlay().then((did) => {
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
          <strong>Check it works</strong>
          <span>Shows a made-up Quill, banner and prompt for a few seconds.</span>
        </div>
        <div className="ui-pref-control sd-control">
          <button type="button" className="ui-btn ui-btn-quiet" data-testid="streamoverlay.test" onClick={() => startOverlayTest()} disabled={!door.running}>
            Show a test
          </button>
        </div>
      </div>
      <ol className="so-steps" data-testid="streamoverlay.steps">
        <li>
          Press <strong>Copy</strong> above. The address stays hidden.
        </li>
        <li>
          In OBS, under <strong>Sources</strong>, press <strong>+</strong> and pick <strong>Browser</strong>.
        </li>
        <li>
          Paste the address into <strong>URL</strong>, and set <strong>Width</strong> and <strong>Height</strong> to match your stream (usually 1920 and 1080).
        </li>
        <li>
          Press <strong>OK</strong>, and drag it above your capture view.
        </li>
      </ol>
      <div>
        <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp('stream-overlay')}>
          <Icon name="help" size={14} /> How the stream overlay works
        </button>
      </div>
    </div>
  );
}
