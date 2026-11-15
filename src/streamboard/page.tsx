// The Stream control board's page: big buttons, and nothing else. It holds no streaming logic. It shows what the
// drawing window sends (model.ts), and says back which button was pressed or where the buttons now sit. Covered words
// never reach it: the drawing window leaves them out of the message.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { bringBack, moveOnto, nudge, putAway, resize, SIZE_STEPS, type Layout } from './layout';
import type { BoardTheme, BoardView, TileView } from './model';
import type { FromBoard, ToBoard } from './protocol';
import { PrivateSide } from './sideView';
import './streamboard.css';

const FALLBACK: BoardTheme = { dark: true, bg: '#17151f', panel: '#211e2c', text: '#f4efe6', muted: '#b3aac4', accent: '#9b7bff', raised: '#322d43', line: '#2e2a40' };
const COVER_DOTS = '••••••';

/** How long a line stays in the message strip. */
const SAID_MS = 7000;

export function BoardPage() {
  const [view, setView] = useState<BoardView | null>(null);
  const [lost, setLost] = useState(false);
  const [said, setSaid] = useState<{ text: string; ok: boolean; n: number } | null>(null);
  const [arranging, setArranging] = useState(false);
  const [held, setHeld] = useState<string | null>(null);
  const port = useRef<MessagePort | null>(null);
  const saidTimer = useRef(0);

  const tell = (m: FromBoard) => port.current?.postMessage(m);

  useEffect(() => {
    const onPort = (p: MessagePort) => {
      port.current?.close();
      port.current = p;
      setLost(false);
      p.onmessage = (e) => {
        const m = e.data as ToBoard | null;
        if (!m || typeof m.t !== 'string') return;
        if (m.t === 'view') setView(m.view);
        else if (m.t === 'said') {
          setSaid({ text: m.text, ok: m.ok, n: Date.now() });
          window.clearTimeout(saidTimer.current);
          saidTimer.current = window.setTimeout(() => setSaid(null), SAID_MS);
        }
      };
      p.addEventListener('close', () => {
        if (port.current === p) {
          port.current = null;
          setLost(true);
        }
      });
      p.start();
      p.postMessage({ t: 'hello' } satisfies FromBoard);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source === window && e.data === 'frameling-streamboard-port' && e.ports[0]) onPort(e.ports[0]);
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(saidTimer.current);
      port.current?.close();
    };
  }, []);

  const theme = view?.theme ?? FALLBACK;
  const vars = {
    '--sb-bg': theme.bg,
    '--sb-panel': theme.panel,
    '--sb-text': theme.text,
    '--sb-muted': theme.muted,
    '--sb-accent': theme.accent,
    '--sb-raised': theme.raised,
    '--sb-line': theme.line,
    '--sb-min': `${view?.minTile ?? 190}px`,
  } as CSSProperties;

  // Every move goes to the drawing window, which keeps it, and comes back as the next view. The board shows it at once.
  const change = (next: Layout) => {
    if (!view) return;
    setView({ ...view, layout: next, size: next.size, tiles: reorder(view, next), tray: view.tray });
    tell({ t: 'layout', layout: next });
  };

  const press = (t: TileView) => {
    if (!arranging) return tell({ t: 'press', tile: t.id });
    if (held === null) setHeld(t.id);
    else if (held === t.id) setHeld(null);
    else {
      change(moveOnto(view!.layout, held, t.id));
      setHeld(null);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!arranging || held === null || !view) return;
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0;
    if (step) {
      e.preventDefault();
      change(nudge(view.layout, held, step));
    } else if (e.key === 'Escape') setHeld(null);
  };

  const done = () => {
    setArranging(false);
    setHeld(null);
  };

  if (!view) {
    return (
      <div className="sb-root" style={vars} data-dark={theme.dark ? '' : undefined}>
        <div className="sb-wait">
          <div className="sb-wait-title">{lost ? 'Frameling went away' : 'Waiting for Frameling'}</div>
          <div className="sb-wait-text">{lost ? 'Open Frameling again and choose Streaming > Stream control.' : 'The buttons show up here as soon as the drawing window answers.'}</div>
        </div>
      </div>
    );
  }

  const heldTile = held ? view.tiles.find((t) => t.id === held) : undefined;

  return (
    <div className="sb-root" style={vars} data-dark={theme.dark ? '' : undefined} data-arranging={arranging ? '' : undefined} onKeyDown={onKey} data-testid="sb.root">
      <header className="sb-top">
        <div className="sb-chips" data-testid="sb.chips">
          {view.obs ? (
            <span className={`sb-chip sb-obs sb-obs-${view.obs.colour}`} data-testid="sb.obs" data-colour={view.obs.colour}>
              {view.obs.word}
            </span>
          ) : null}
          <span className={`sb-chip ${view.audience.on ? 'sb-aud-on' : 'sb-aud-off'}`} data-testid="sb.audience">
            {view.audience.on ? `Audience participation: on${view.audience.waiting ? `, ${view.audience.waiting} waiting` : ''}` : 'Audience participation: off'}
          </span>
        </div>
        <button type="button" className={`sb-arrange${arranging ? ' is-on' : ''}`} data-testid="sb.arrange" aria-pressed={arranging} onClick={() => (arranging ? done() : setArranging(true))}>
          {arranging ? 'Done' : 'Arrange'}
        </button>
      </header>

      {view.prompt ? (
        <section className="sb-prompt" data-testid="sb.prompt" data-covered={view.prompt.covered ? '' : undefined} aria-label="The prompt you pulled">
          {view.prompt.covered ? (
            <>
              <button type="button" className="sb-read" data-testid="sb.read" onClick={() => tell({ t: 'prompt', do: 'read', id: view.prompt!.id })}>
                <span className="sb-dots" aria-hidden="true">{COVER_DOTS}</span>
                <span className="sb-read-label">Read it</span>
              </button>
              <p className="sb-note">Covered in case your viewers can see this screen. Reading it puts it on screen.</p>
            </>
          ) : (
            <>
              <p className="sb-prompt-text" data-testid="sb.prompt.text">{view.prompt.text}</p>
              <button type="button" className="sb-quiet" data-testid="sb.cover" onClick={() => tell({ t: 'prompt', do: 'cover', id: view.prompt!.id })}>
                Cover it
              </button>
            </>
          )}
        </section>
      ) : null}

      {arranging ? (
        <div className="sb-arrange-bar" data-testid="sb.arrangeBar">
          <p className="sb-arrange-help">{heldTile ? `Picked up "${heldTile.label}". Tap where it goes.` : 'Tap a button to pick it up, then tap where it goes.'}</p>
          <div className="sb-arrange-row">
            {heldTile ? (
              <>
                <button type="button" className="sb-small" data-testid="sb.earlier" onClick={() => change(nudge(view.layout, held!, -1))}>Earlier</button>
                <button type="button" className="sb-small" data-testid="sb.later" onClick={() => change(nudge(view.layout, held!, 1))}>Later</button>
                <button
                  type="button"
                  className="sb-small"
                  data-testid="sb.putAway"
                  onClick={() => {
                    change(putAway(view.layout, held!));
                    setHeld(null);
                  }}
                >
                  Put away
                </button>
              </>
            ) : (
              <>
                <button type="button" className="sb-small" data-testid="sb.smaller" disabled={view.layout.size === 0} onClick={() => change(resize(view.layout, -1))}>Smaller</button>
                <span className="sb-size" data-testid="sb.size">{SIZE_STEPS[view.layout.size]}</span>
                <button type="button" className="sb-small" data-testid="sb.bigger" disabled={view.layout.size === SIZE_STEPS.length - 1} onClick={() => change(resize(view.layout, 1))}>Bigger</button>
                <button type="button" className="sb-small" data-testid="sb.reset" disabled={view.isDefault} onClick={() => tell({ t: 'reset' })}>Put them back</button>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div className="sb-body">
      <main className="sb-grid" data-testid="sb.grid">
        {view.tiles.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`sb-tile sb-${t.tone}${t.on ? ' is-on' : ''}${t.enabled ? '' : ' is-off'}${held === t.id ? ' is-held' : ''}`}
            data-testid={`sb.tile.${t.id}`}
            data-command={t.command}
            aria-disabled={!t.enabled || undefined}
            aria-pressed={t.on === null ? undefined : t.on}
            title={t.enabled ? undefined : t.why}
            onClick={() => press(t)}
          >
            <span className="sb-label">{t.label}</span>
            {t.caption ? <span className="sb-caption">{t.caption}</span> : null}
            {!arranging && !t.enabled ? <span className="sb-why">{t.why}</span> : null}
          </button>
        ))}
        {view.tiles.length === 0 ? <p className="sb-empty">Every button is put away. Press Arrange to bring some back.</p> : null}
      </main>
      {arranging ? null : <PrivateSide view={view} tell={tell} />}
      </div>

      {arranging && view.tray.length ? (
        <section className="sb-tray" data-testid="sb.tray" aria-label="Buttons put away">
          <h2>Put away</h2>
          <div className="sb-tray-list">
            {view.tray.map((t) => (
              <button key={t.id} type="button" className="sb-small" data-testid={`sb.tray.${t.id}`} title={t.about} onClick={() => change(bringBack(view.layout, t.id))}>
                Add: {t.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="sb-foot">
        <p className={`sb-said${said ? ' is-shown' : ''}${said?.ok ? ' is-ok' : ''}`} role="status" aria-live="polite" data-testid="sb.said">
          {said?.text ?? ''}
        </p>
        <button type="button" className="sb-stop" data-testid="sb.stop" onClick={() => tell({ t: 'stop' })}>
          {view.stop.label}
        </button>
      </footer>
      {lost ? <div className="sb-lost">Frameling went away. The buttons will come back when it does.</div> : null}
    </div>
  );
}

/** The tiles in the order of a layout, kept from the last view (their faces do not change on a move). */
function reorder(view: BoardView, next: Layout): TileView[] {
  const by = new Map(view.tiles.map((t) => [t.id, t]));
  return next.shown.map((id) => by.get(id)).filter((t): t is TileView => !!t);
}
