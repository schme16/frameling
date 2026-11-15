// The picture window's page: the drawing, big, and nothing else. It keeps a copy of the drawing (replica.ts), told what
// changed through a message port, and paints it once per screen frame with the canvas's own painter. You can't draw in
// it, so there is nothing here that can change the drawing. Double-click (or F) for full screen.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { watchPixelRatio } from '../canvas/pixelRatio';
import { MarkShape } from '../notes/MarkShape';
import { visibleMarks } from '../notes/marks';
import type { CanvasMark } from '../core/format';
import { safeBackground, windowTitle, type CaptureLook } from './capture';
import { PicturePainter, type Painted } from './painter';
import type { FromPopout, PopoutTheme, ToPopout } from './protocol';
import { Replica } from './replica';
import { ReviewBus, reviewTitle } from './reviewBus';
import { ReviewLayer } from './ReviewLayer';
import { pageOf, shownFrame } from './show';
import './popout.css';

const FALLBACK: PopoutTheme = { dark: true, bg: '#121019', text: '#f4efe6', muted: '#b3aac4', accent: '#9b7bff', raised: '#322d43' };

/** `review` makes it the reviewer's window: the same picture, with the review layer on top and a link that carries more than the picture. */
export function PopoutPage({ review = false }: { review?: boolean }) {
  const bus = useRef(new ReviewBus());
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<PopoutTheme>(FALLBACK);
  const [ready, setReady] = useState(false);
  const [lost, setLost] = useState(false);
  const [hint, setHint] = useState(true);
  // Set in the capture view only: the page shows the drawing and nothing else, on the colour the streamer picked.
  const [cap, setCap] = useState<CaptureLook | null>(null);
  const [shown, setShown] = useState<Painted | null>(null);
  const [marks, setMarks] = useState<CanvasMark[]>([]);

  useEffect(() => {
    const c = canvas.current!;
    const box = root.current!;
    const painter = new PicturePainter(c);
    const replica = new Replica();
    // Read by the checks (scripts/e2e/popout.cjs): what this window knows and how often it has painted.
    bus.current.replica = replica;
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
      const playing = replica.freeFrame === null && look.playing;
      const t0 = performance.now();
      // Only the frame-rate check (scripts/perf/popout.cjs) holds painting, to tell what the messages alone cost.
      if (probe.paused || replica.held) return;
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
      const t = review ? reviewTitle(bus.current.snapshot().link, look.name) : windowTitle(!!look.capture, look.name);
      if (t !== title) document.title = title = t;
      const lc = look.capture ? { bg: safeBackground(look.capture.bg), hideCursor: look.capture.hideCursor === true } : null;
      setCap((p) => (p === lc || (p && lc && p.bg === lc.bg && p.hideCursor === lc.hideCursor) ? p : lc));
      setShown((p) => (p && p.box.x === painted.box.x && p.box.y === painted.box.y && p.box.w === painted.box.w && p.box.h === painted.box.h && p.background === painted.background ? p : painted));
      // Marks are a few lines of SVG: worked out only when something about them can have changed.
      setMarks(look.marks && !playing ? visibleMarks(pageOf(replica.doc), shownFrame(replica.doc, look.frame)) : NO_MARKS);
      if (playing) painter.warmAhead(replica, dpr, 5);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    // The title bar says so the moment a review is over, even though no picture message comes to say it.
    const stopTitle = review
      ? bus.current.subscribe(() => {
          const t = reviewTitle(bus.current.snapshot().link, replica.look?.name || bus.current.snapshot().name);
          if (t !== title) document.title = title = t;
        })
      : () => {};
    const say = (m: FromPopout | { t: string }) => port?.postMessage(m);
    bus.current.say = (m) => port?.postMessage(m);
    bus.current.repaint = schedule;
    const onPort = (p: MessagePort) => {
      port?.close();
      port = p;
      asked = false;
      setLost(false);
      p.onmessage = (e) => {
        const m = e.data as ToPopout;
        if (!m || typeof m.t !== 'string') return;
        // The reviewer's window also hears about the link (and the sharer's pointer): those are not the picture.
        if (review && bus.current.handle(m)) return;
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
      if ((e.target as HTMLElement | null)?.closest?.('textarea, input')) return;
      if (e.key === 'f' || e.key === 'F' || e.key === 'F11') {
        e.preventDefault();
        toggleFullScreen();
      }
    };
    window.addEventListener('keydown', key);
    const hide = window.setTimeout(() => setHint(false), 6000);

    return () => {
      stopTitle();
      window.removeEventListener('message', onMessage);
      window.removeEventListener('keydown', key);
      window.clearTimeout(hide);
      ro.disconnect();
      stopDpr();
      if (raf) cancelAnimationFrame(raf);
      port?.close();
    };
  }, [review]);

  const vars = {
    '--po-bg': cap ? cap.bg : theme.bg,
    '--po-text': theme.text,
    '--po-muted': theme.muted,
    '--po-accent': theme.accent,
    '--po-raised': theme.raised,
  } as CSSProperties;
  const view = shown ? { zoom: shown.zoom, panX: shown.box.x, panY: shown.box.y } : null;

  return (
    <div ref={root} className={cap ? `po-root po-capture${cap.hideCursor ? ' po-nocursor' : ''}` : 'po-root'} style={vars} data-dark={theme.dark ? '' : undefined} data-ready={ready ? '' : undefined} data-testid="popout.root" onDoubleClick={review ? undefined : toggleFullScreen}>
      {shown ? <div className={shown.background || cap ? 'po-stage' : 'po-stage po-checker'} style={{ left: shown.box.x, top: shown.box.y, width: shown.box.w, height: shown.box.h, background: shown.background || undefined }} /> : null}
      <canvas ref={canvas} className="po-canvas" aria-label="Your drawing" />
      {view && marks.length ? (
        <svg className="po-marks" aria-hidden="true">
          {marks.map((m) => (
            <MarkShape key={m.id} m={m} v={view} />
          ))}
        </svg>
      ) : null}
      {review ? <ReviewLayer bus={bus.current} shown={shown} rootRef={root} /> : null}
      {!ready && !cap && !review ? (
        <div className="po-wait" role="status">
          <div className="po-wait-title">{lost ? 'The drawing window went away' : 'Waiting for your drawing'}</div>
          <div className="po-wait-text">{lost ? 'Open Frameling again and choose View > Panel windows and tools > Second window.' : 'It shows up here as soon as the drawing window sends it.'}</div>
        </div>
      ) : null}
      {ready && lost && !cap && !review ? (
        <div className="po-note" role="status">
          The drawing window went away. This is the last picture it sent.
        </div>
      ) : null}
      {ready && hint && !lost && !cap && !review ? <div className="po-hint">Double-click for full screen</div> : null}
    </div>
  );
}

const NO_MARKS: CanvasMark[] = [];

function toggleFullScreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => undefined);
}
