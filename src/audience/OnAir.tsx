// The red On air pill in the title bar, with a Stop button right beside it, and the card that hangs from it: what is
// waiting, what has happened (counts only), and the buttons. It shows whenever audience features are on, and nothing
// hides it. It never shows a name, because the gate never keeps one.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from '../ui/icons';
import { openHelp } from '../ui/overlays';
import { getCommand } from '../core/registry';
import { shortcutLabel } from '../ui/keys';
import { usePopover } from '../ui/popover';
import { audience, emptyAudienceQueue, setAudienceOn, stopAudience } from './index';
import { cardOpen, globalStop, hideAudienceCard } from './card';
import { countsLine, waited } from './summary';
import './audience.css';

const useGate = () => useSyncExternalStore(audience.subscribe, audience.snapshot);

const killKey = (): string => {
  const c = getCommand('audience.kill');
  return c ? shortcutLabel(c) : 'Ctrl+Alt+K';
};

function Card({ at }: { at: React.RefObject<HTMLElement | null> }) {
  const s = useGate();
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
      if (box) setStyle({ top: box.bottom + 6, right: Math.max(8, window.innerWidth - box.right) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [at]);
  const now = Date.now();
  const everywhere = globalStop.use((v) => v);
  return (
    <div className="ui-menu aud-card" role="dialog" aria-label="Audience features" ref={ref} style={style} data-testid="audience.card">
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
    </div>
  );
}

export function OnAir() {
  const s = useGate();
  const open = cardOpen.use((v) => v);
  const pill = useRef<HTMLDivElement>(null);
  if (!s.on) return null;
  const n = s.queue.length;
  return (
    <div className="aud-onair" ref={pill} role="group" aria-label="Audience features are on" data-testid="audience.onair" data-help="audience">
      <button type="button" className="aud-pill" aria-haspopup="dialog" aria-expanded={open} data-tip="Audience features are on. Open to see what is waiting." onClick={() => cardOpen.set(!open)}>
        <span className="aud-dot" aria-hidden="true" />
        On air
        {n > 0 && (
          <span className="aud-n" aria-label={`${n} waiting`}>
            {n}
          </span>
        )}
      </button>
      <button type="button" className="aud-stop" data-testid="audience.stop" data-tip={`Stop everything from the audience (${killKey()})`} aria-label="Stop everything from the audience" onClick={stopAudience}>
        Stop
      </button>
      {open && <Card at={pill} />}
    </div>
  );
}
