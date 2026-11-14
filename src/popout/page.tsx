// The picture window's page: the drawing, big, and nothing else. It keeps a copy of the drawing (replica.ts), told what
// changed through a message port, and paints it once per screen frame with the canvas's own painter. You can't draw in
// it, so there is nothing here that can change the drawing. Double-click (or F) for full screen.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { watchPixelRatio } from '../canvas/pixelRatio';
import { MarkShape } from '../notes/MarkShape';
import { visibleMarks } from '../notes/marks';
import type { CanvasMark } from '../core/format';
import { PicturePainter, type Painted } from './painter';
import type { FromPopout, PopoutTheme, ToPopout } from './protocol';
import { Replica } from './replica';
import { pageOf, shownFrame } from './show';
import './popout.css';

const FALLBACK: PopoutTheme = { dark: true, bg: '#121019', text: '#f4efe6', muted: '#b3aac4', accent: '#9b7bff', raised: '#322d43' };

export function PopoutPage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<PopoutTheme>(FALLBACK);
  const [ready, setReady] = useState(false);
  const [lost, setLost] = useState(false);
  const [hint, setHint] = useState(true);
  const [shown, setShown] = useState<Painted | null>(null);
  const [marks, setMarks] = useState<CanvasMark[]>([]);

  useEffect(() => {
    const c = canvas.current!;
    const box = root.current!;
    const painter = new PicturePainter(c);
    const replica = new Replica();
    // Read by the checks (scripts/e2e/popout.cjs): what this window knows and how often it has painted.
    const probe = { replica, paints: 0, paused: false, lastPaintMs: 0, paintMsTotal: 0, record: false, trace: [] as { t: number; frame: number; ms: number }[], port: () => !!port };
    (window as unknown as { __popout: unknown }).__popout = probe;
    let port: MessagePort | null = null;
    let raf = 0;
    let asked = false;
    let lastVersion = -1;
    let lastSize = '';
    let readyNow = false;
    let themeKey = '';
    let title = '';

    const size = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(box.clientWidth * dpr));
      const h = Math.max(1, Math.round(box.clientHeight * dpr));
      const key = `${w}x${h}@${dpr}`;
      if (key !== lastSize) {
        lastSize = key;
        c.width = w;
        c.height = h;
        painter.forget();
        lastVersion = -1;
      }
      return dpr;
    };

    const frame = () => {
      raf = 0;
      const dpr = size();
      if (replica.version === lastVersion) return;
      const look = replica.look;
      if (!look || !replica.doc) {
        lastVersion = replica.version;
        return;
      }
      const playing = look.playing;
      const t0 = performance.now();
      // Only the frame-rate check (scripts/perf/popout.cjs) holds painting, to tell what the messages alone cost.
      if (probe.paused) return;
      lastVersion = replica.version;
      const painted = painter.paint(replica, dpr, playing);
      if (!painted) return;
      probe.paints++;
      probe.lastPaintMs = performance.now() - t0;
      probe.paintMsTotal += probe.lastPaintMs;
      if (probe.record) probe.trace.push({ t: t0, frame: painted.frame, ms: probe.lastPaintMs });
      if (!readyNow) {
        readyNow = true;
        setReady(true);
      }
      const key = JSON.stringify(look.theme);
      if (key !== themeKey) {
        themeKey = key;
        setTheme(look.theme);
      }
      const t = `${look.name} - second window`;
      if (t !== title) document.title = title = t;
      setShown((p) => (p && p.box.x === painted.box.x && p.box.y === painted.box.y && p.box.w === painted.box.w && p.box.h === painted.box.h && p.background === painted.background ? p : painted));
      // Marks are a few lines of SVG: worked out only when something about them can have changed.
      setMarks(look.marks && !playing ? visibleMarks(pageOf(replica.doc), shownFrame(replica.doc, look.frame)) : NO_MARKS);
      if (playing) painter.warmAhead(replica, dpr, 5);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const say = (m: FromPopout) => port?.postMessage(m);
    const onPort = (p: MessagePort) => {
      port?.close();
      port = p;
      asked = false;
      setLost(false);
      p.onmessage = (e) => {
        const m = e.data as ToPopout;
        if (!m || typeof m.t !== 'string') return;
        if (m.t === 'doc') asked = false;
        if (replica.apply(m) && !asked) {
          // Out of step: one question is enough, the answer is a whole drawing.
          asked = true;
          say({ t: 'hello' });
        }
        schedule();
      };
      p.addEventListener('close', () => {
        if (port === p) {
          port = null;
          setLost(true);
        }
      });
      p.start();
      say({ t: 'hello' });
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source === window && e.data === 'frameling-popout-port' && e.ports[0]) onPort(e.ports[0]);
    };
    window.addEventListener('message', onMessage);

    const ro = new ResizeObserver(() => schedule());
    ro.observe(box);
    const stopDpr = watchPixelRatio(schedule);

    const key = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F' || e.key === 'F11') {
        e.preventDefault();
        toggleFullScreen();
      }
    };
    window.addEventListener('keydown', key);
    const hide = window.setTimeout(() => setHint(false), 6000);

    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('keydown', key);
      window.clearTimeout(hide);
      ro.disconnect();
      stopDpr();
      if (raf) cancelAnimationFrame(raf);
      port?.close();
    };
  }, []);

  const vars = {
    '--po-bg': theme.bg,
    '--po-text': theme.text,
    '--po-muted': theme.muted,
    '--po-accent': theme.accent,
    '--po-raised': theme.raised,
  } as CSSProperties;
  const view = shown ? { zoom: shown.zoom, panX: shown.box.x, panY: shown.box.y } : null;

  return (
    <div ref={root} className="po-root" style={vars} data-dark={theme.dark ? '' : undefined} data-ready={ready ? '' : undefined} data-testid="popout.root" onDoubleClick={toggleFullScreen}>
      {shown ? <div className={shown.background ? 'po-stage' : 'po-stage po-checker'} style={{ left: shown.box.x, top: shown.box.y, width: shown.box.w, height: shown.box.h, background: shown.background || undefined }} /> : null}
      <canvas ref={canvas} className="po-canvas" aria-label="Your drawing" />
      {view && marks.length ? (
        <svg className="po-marks" aria-hidden="true">
          {marks.map((m) => (
            <MarkShape key={m.id} m={m} v={view} />
          ))}
        </svg>
      ) : null}
      {!ready ? (
        <div className="po-wait" role="status">
          <div className="po-wait-title">{lost ? 'The drawing window went away' : 'Waiting for your drawing'}</div>
          <div className="po-wait-text">{lost ? 'Open Frameling again and choose View > Second window.' : 'It shows up here as soon as the drawing window sends it.'}</div>
        </div>
      ) : null}
      {ready && lost ? (
        <div className="po-note" role="status">
          The drawing window went away. This is the last picture it sent.
        </div>
      ) : null}
      {ready && hint && !lost ? <div className="po-hint">Double-click for full screen</div> : null}
    </div>
  );
}

const NO_MARKS: CanvasMark[] = [];

function toggleFullScreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => undefined);
}
