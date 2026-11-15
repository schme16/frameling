// The Live pill in the title bar, and the card that hangs from it. One pill for two things: the red On air part (audience
// features are on: what is waiting, the counts, Stop) and the OBS part (what OBS is doing). What it says for each mix is
// decided in liveState.ts. Press either part and the same card opens, with the queue and the OBS settings in it, so nothing
// that used to be a separate pill is out of reach. It never shows a name, because the gate never keeps one.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from './icons';
import { openHelp, openPrefs } from './overlays';
import { getCommand } from '../core/registry';
import { shortcutLabel } from './keys';
import { usePopover } from './popover';
import { audience, emptyAudienceQueue, setAudienceOn, stopAudience } from '../audience/index';
import { cardOpen, globalStop, hideAudienceCard } from '../audience/card';
import { countsLine, waited } from '../audience/summary';
import { obs, useObsState } from '../streamsafe/obs';
import { obsLook } from '../streamsafe/obsLogic';
import { livePill } from './liveState';
import '../audience/audience.css';
import '../streamsafe/streamsafe.css';

const useGate = () => useSyncExternalStore(audience.subscribe, audience.snapshot);

const killKey = (): string => {
  const c = getCommand('audience.kill');
  return c ? shortcutLabel(c) : 'Ctrl+Alt+K';
};

function Card({ at }: { at: React.RefObject<HTMLElement | null> }) {
  const s = useGate();
  const o = useObsState();
  const look = obsLook(o);
  const fix = o.link === 'password' || o.link === 'address';
  const ref = useRef<HTMLDivElement>(null);
  // The waits count up while it is open.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  usePopover(ref, hideAudienceCard);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || at.current?.contains(t)) return;
      hideAudienceCard();
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [at]);
  // Hangs from the pill's right edge, and follows it if the window changes size while it is open.
  const [style, setStyle] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    const place = () => {
      const box = at.current?.getBoundingClientRect();
      if (box)
        setStyle({
          top: box.bottom + 6,
          right: Math.max(8, window.innerWidth - box.right),
        });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [at]);
  const now = Date.now();
  const everywhere = globalStop.use((v) => v);
  return (
    <div className="ui-menu aud-card" role="dialog" aria-label={s.on ? 'Audience features' : 'OBS'} ref={ref} style={style} data-testid="audience.card">
      {s.on && (
        <>
          <h2 className="aud-title">Audience features are on</h2>
          <p className="aud-sub">Everything from outside goes through here first. Frameling does not keep who sent what, only how many.</p>
          {s.doors.length > 0 && <p className="aud-doors">Open to: {s.doors.map((d) => d.label).join(', ')}</p>}
          <p className="aud-doors" data-testid="audience.interrupts">
            {s.drawingAllowed ? 'Your audience may interrupt your drawing. Each one is a single step that Undo takes back.' : 'Your audience cannot touch your drawing.'}
          </p>
          <h3 className="aud-head">
            Waiting <span className="aud-count">{s.queue.length}</span>
          </h3>
          {s.queue.length === 0 ? (
            <p className="aud-empty">Nothing is waiting.</p>
          ) : (
            <ol className="aud-queue" data-testid="audience.queue">
              {s.queue.map((q) => (
                <li key={q.ticket}>
                  <span className="aud-label">{q.label}</span>
                  <span className="aud-wait">{waited(now - q.at)}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="aud-counts" data-testid="audience.counts">
            {countsLine(s.counts)}
          </p>
          <div className="aud-actions">
            <button type="button" className="ui-btn" disabled={s.queue.length === 0} onClick={() => void emptyAudienceQueue()}>
              Empty the queue
            </button>
            <button type="button" className="ui-btn" onClick={() => (hideAudienceCard(), setAudienceOn(false))}>
              Switch off
            </button>
            <button type="button" className="ui-btn aud-stop-wide" onClick={() => (hideAudienceCard(), stopAudience())}>
              Stop everything
            </button>
          </div>
          <p className="aud-key">{everywhere ? `${killKey()} stops everything from any window.` : `${killKey()} stops everything while Frameling is the window you are in. From another window, use the Stop button.`}</p>
          <button type="button" className="ui-btn ui-btn-quiet aud-learn" onClick={() => (hideAudienceCard(), openHelp('audience'))}>
            <Icon name="help" size={14} /> How audience features work
          </button>
        </>
      )}
      {look && (
        <>
          {s.on && <hr className="aud-sep" />}
          {s.on ? <h3 className="aud-head">OBS</h3> : <h2 className="aud-title">OBS</h2>}
          <p className="aud-doors" data-testid="obs.line" data-state={o.link}>
            {look.detail}
            {s.on && o.streaming && ' Stop above ends audience features only. It does not touch your stream.'}
          </p>
          <div className="aud-actions">
            {o.link === 'waiting' && (
              <button type="button" className="ui-btn" data-testid="obs.lookNow" onClick={() => obs.lookNow()}>
                Look for OBS now
              </button>
            )}
            <button type="button" className={`ui-btn${fix ? ' aud-stop-wide' : ''}`} data-testid="obs.settings" onClick={() => (hideAudienceCard(), openPrefs('streaming', 'stream.obsLink'))}>
              OBS settings
            </button>
          </div>
          <button type="button" className="ui-btn ui-btn-quiet aud-learn" onClick={() => (hideAudienceCard(), openHelp('obs-golive'))}>
            <Icon name="help" size={14} /> How OBS and Frameling work together
          </button>
        </>
      )}
    </div>
  );
}

export function LivePill() {
  const s = useGate();
  const o = useObsState();
  const open = cardOpen.use((v) => v);
  const pill = useRef<HTMLDivElement>(null);
  const m = livePill({ audience: s.on, waiting: s.queue.length, obs: o });
  if (!m) return null;
  const toggle = () => cardOpen.set(!open);
  const kind = m.obs?.kind;
  // The card is a sibling, not a child: the pill clips its parts and can be dimmed, and a card inside it would be dimmed and sit under the canvas.
  return (
    <>
      <div className="live-pill" ref={pill} role="group" aria-label={m.label} data-tone={m.tone} data-testid="live.pill" data-help={m.audience ? 'audience' : 'obs-golive'}>
        {m.audience && (
          <>
            <button type="button" className="aud-pill" data-testid="audience.onair" aria-haspopup="dialog" aria-expanded={open} data-tip={m.label} data-tip-desc={m.detail} onClick={toggle}>
              <span className="aud-dot" aria-hidden="true" />
              On air
              {m.audience.waiting > 0 && (
                <span className="aud-n" aria-label={`${m.audience.waiting} waiting`}>
                  {m.audience.waiting}
                </span>
              )}
            </button>
            <button
              type="button"
              className="aud-stop"
              data-testid="audience.stop"
              data-tip={`Stop everything from the audience (${killKey()})`}
              data-tip-desc="This ends audience features only. It does not touch OBS."
              aria-label="Stop everything from the audience"
              onClick={stopAudience}
            >
              Stop
            </button>
          </>
        )}
        {m.obs && (
          <button
            type="button"
            className={`live-obs live-obs-${kind}${m.audience ? ' is-beside' : ''}`}
            data-testid="obs.badge"
            data-state={o.link}
            data-help="obs-golive"
            aria-haspopup="dialog"
            aria-expanded={open}
            data-tip={m.audience ? m.label : m.obs.word}
            data-tip-desc={m.detail}
            onClick={toggle}
          >
            {kind === 'live' || kind === 'rec' ? <span className="live-dot" aria-hidden="true" /> : <Icon name={kind === 'fix' ? 'warning' : kind === 'ready' ? 'check' : 'eye'} size={13} />}
            {m.obs.word}
          </button>
        )}
      </div>
      {open && <Card at={pill} />}
    </>
  );
}
