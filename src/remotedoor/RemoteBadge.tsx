// The pill in the title bar while the remote door is open, so nobody is ever drivable without being able to see that it is
// possible. It glows for a moment each time a program does something. Pressing it opens the card: the address, the log
// of what was driven and when, and the switch. Nothing here shows the key.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../ui/icons';
import { openHelp, openPrefs } from '../ui/overlays';
import { usePopover } from '../ui/popover';
import { hideRemoteCard, remoteCardOpen } from './card';
import { clock, remoteLog } from './log';
import { lastDriven, remoteStatus } from './state';
import { remoteLink } from './instance';
import '../audience/audience.css';
import './remotedoor.css';

/** How long the pill glows after something was driven, in milliseconds. */
export const GLOW_MS = 1600;

/** True for a moment after each time the door did something. */
function useGlow(): boolean {
  const at = lastDriven.use((v) => v);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!at) return undefined;
    setNow(Date.now());
    const t = setTimeout(() => setNow(Date.now()), GLOW_MS + 50);
    return () => clearTimeout(t);
  }, [at]);
  return at > 0 && now - at < GLOW_MS;
}

export function RemoteLog({ limit = 40 }: { limit?: number }) {
  const log = remoteLog.use((l) => l);
  if (!log.length) return <p className="aud-empty" data-testid="remote.logEmpty">Nothing has been driven yet.</p>;
  return (
    <ol className="rd-log" data-testid="remote.log" aria-label="What was driven, newest first">
      {log.slice(0, limit).map((e) => (
        <li key={e.id} data-outcome={e.outcome}>
          <span className="rd-time">{clock(e.at)}</span>
          <span className="rd-what">
            {e.what}
            {e.note && <span className="rd-note">{e.note}</span>}
          </span>
          <span className="rd-out">{e.outcome === 'done' ? 'done' : e.outcome === 'refused' ? 'not now' : 'did not work'}</span>
        </li>
      ))}
    </ol>
  );
}

function Card({ at }: { at: React.RefObject<HTMLElement | null> }) {
  const status = remoteStatus.use((s) => s);
  const ref = useRef<HTMLDivElement>(null);
  usePopover(ref, hideRemoteCard);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || at.current?.contains(t)) return;
      hideRemoteCard();
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [at]);
  const [style, setStyle] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    const place = () => {
      const box = at.current?.getBoundingClientRect();
      if (box) setStyle({ top: box.bottom + 6, right: Math.max(8, window.innerWidth - box.right) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [at]);
  return (
    <div className="ui-menu aud-card rd-card" role="dialog" aria-label="Remote door" ref={ref} style={style} data-testid="remote.card">
      <h2 className="aud-title">{status.running ? 'The remote door is open' : 'The remote door is off'}</h2>
      <p className="aud-sub">
        {status.running
          ? `Another program on this computer that has your key can drive Frameling through ${status.address}. Nothing outside this computer can reach it.`
          : 'Nothing is listening. Switch it on in Preferences when a program you trust needs to drive Frameling.'}
      </p>
      <h3 className="aud-head">What was driven</h3>
      <RemoteLog />
      <div className="aud-actions">
        {status.running && (
          <button type="button" className="ui-btn" data-testid="remote.switchOff" onClick={() => (hideRemoteCard(), void remoteLink.close())}>
            Switch off
          </button>
        )}
        <button type="button" className="ui-btn" onClick={() => (hideRemoteCard(), openPrefs('plugins', undefined, 'Remote door'))}>
          Settings
        </button>
      </div>
      <button type="button" className="ui-btn ui-btn-quiet aud-learn" onClick={() => (hideRemoteCard(), openHelp('remote-door'))}>
        <Icon name="help" size={14} /> How the remote door works
      </button>
    </div>
  );
}

export function RemoteBadge() {
  const running = remoteStatus.use((s) => s.running);
  const open = remoteCardOpen.use((v) => v);
  const glow = useGlow();
  const pill = useRef<HTMLButtonElement>(null);
  // Closed with the door: a card left open would show an off door nobody asked about.
  useEffect(() => {
    if (!running) hideRemoteCard();
  }, [running]);
  if (!running && !open) return null;
  return (
    <>
      {running && (
        <button
          type="button"
          ref={pill}
          className={`rd-pill${glow ? ' is-driven' : ''}`}
          data-testid="remote.badge"
          data-help="remote-door"
          aria-haspopup="dialog"
          aria-expanded={open}
          data-tip="The remote door is open"
          data-tip-desc="Another program on this computer can drive Frameling. Press to see what it has done, or to switch it off."
          onClick={() => remoteCardOpen.set(!open)}
        >
          <span className="rd-dot" aria-hidden="true" />
          Remote door
        </button>
      )}
      {open && <Card at={pill} />}
    </>
  );
}
