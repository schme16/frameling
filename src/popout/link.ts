// The drawing window's end of the link to the picture window. A message port arrives (from the desktop side) whenever the
// picture window opens or the link is made again; this turns it into a Mirror that watches the store. Nothing runs while
// no picture window is open: the store has no extra listener and the tools' taps are empty.
import { store, type State } from '../core/store';
import { currentChoice, onChoiceChange } from '../core/choices';
import { subscribeViewSettings } from '../canvas/viewSettings';
import { cssVar, subscribeTheme } from '../canvas/theme';
import { lookingThrough } from '../camera/ops';
import { documentTitle } from '../io/document';
import { getMarksState, subscribeMarksState } from '../notes/marksState';
import { backgroundColour, type BackgroundChoice } from './capture';
import { setInkTap, setLiveTap, setPixelTap, type InkMaker, type InkShapes, type PixelFeed } from './ink';
import { waitAfter } from './pace';
import { Mirror } from './mirror';
import type { FromPopout, Look, LiveDrawing, PopoutTheme, ToPopout } from './protocol';
import { marksVisible, throughCamera, type CameraChoice, type MarksChoice } from './show';
import { subscribeStreamSafe } from '../core/streamSafe';

/** The two things that can follow the drawing: the picture window, and a live review (see src/review). */
type Kind = 'popout' | 'review';

interface Out {
  kind: Kind;
  port: MessagePort;
  stop(): void;
}

const outs: Record<Kind, Out | null> = { popout: null, review: null };
const listeners = new Set<() => void>();

export const isPopoutOpen = (): boolean => outs.popout !== null;
/** Is a live review you are sharing following the drawing? */
export const isReviewFollowing = (): boolean => outs.review !== null;

// Which kind of window the desktop side linked us to (it says so just before the port arrives).
let capture = false;
/** Is the window that is open the capture view? */
export const isCaptureOpen = (): boolean => outs.popout !== null && capture;

/** Calls `fn` when the picture window opens or goes (for menu ticks). Returns the unsubscribe. */
export function subscribePopout(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

const tell = () => {
  for (const f of listeners) f();
};

/** The theme colours the picture window wears. Read again only when the theme changes. */
function readTheme(): PopoutTheme {
  const bg = cssVar('--canvas-bg', '#121019');
  return { dark: isDarkColour(bg), bg, text: cssVar('--text', '#f4efe6'), muted: cssVar('--muted', '#b3aac4'), accent: cssVar('--accent', '#9b7bff'), raised: cssVar('--raised', '#322d43') };
}

/** Is a #rrggbb colour dark? (Anything else counts as dark.) */
export function isDarkColour(c: string): boolean {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(c.trim());
  if (!m) return true;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

// What is being drawn right now is one thing, however many ports follow it: the strokes in progress are read once per screen
// frame and handed to each. The tools have one tap each (ink.ts), which the first follower installs and the last one removes.
let ink: InkShapes | InkMaker = null;
let feed: PixelFeed | null = null;
let pixelsDirty = false;
let pixelsRestart = false;
let pixelsAt = 0;
let live: LiveDrawing | null = null;
let inkDirty = false;
let liveDirty = false;
let raf = 0;
const mirrors = new Set<Mirror>();
let tapped = false;

// Strokes and half-done changes go once per screen frame at most: the picture window cannot show more anyway.
const flush = () => {
  raf = 0;
  if (inkDirty) {
    const i = typeof ink === 'function' ? ink() : ink;
    for (const m of mirrors) m.setInk(i);
  }
  if (liveDirty) for (const m of mirrors) m.setLive(live);
  inkDirty = liveDirty = false;
  if (feed && pixelsDirty) {
    if (performance.now() < pixelsAt) later();
    else {
      pixelsDirty = false;
      const p = feed.take(pixelsRestart);
      pixelsRestart = false;
      if (p) {
        for (const m of mirrors) m.setPixels(p);
        pixelsAt = performance.now() + waitAfter(p.data.byteLength);
      }
    }
  }
};
const later = () => {
  if (!raf) raf = requestAnimationFrame(flush);
};

function installTaps(): void {
  if (tapped) return;
  tapped = true;
  setInkTap((s) => {
    ink = s;
    inkDirty = true;
    // The end of a stroke goes straight away (the finished line is arriving as an edit); growth waits for the next screen frame.
    if (s === null) flush();
    else later();
  });
  setPixelTap((f) => {
    if (f === null) {
      feed = null;
      pixelsDirty = false;
      pixelsRestart = false;
      pixelsAt = 0;
      for (const m of mirrors) m.setPixels(null);
      return;
    }
    feed = f;
    pixelsDirty = true;
    later();
  });
  setLiveTap((l) => {
    live = l;
    liveDirty = true;
    if (l === null) flush();
    else later();
  });
}

function removeTaps(): void {
  if (!tapped || mirrors.size) return;
  tapped = false;
  setInkTap(null);
  setLiveTap(null);
  setPixelTap(null);
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

function start(port: MessagePort, kind: Kind): void {
  outs[kind]?.stop();
  let theme = readTheme();
  let mirror: Mirror | null = null;
  const unsubs: (() => void)[] = [];

  const lookOf = (s: State): Look => {
    const camera = throughCamera(currentChoice<CameraChoice>('popout.camera'), s.doc, lookingThrough(s));
    const cap =
      kind === 'popout' && capture
        ? { bg: backgroundColour(currentChoice<BackgroundChoice>('popout.captureBackground')), hideCursor: currentChoice('popout.captureCursor') === 'hide' }
        : null;
    return {
      // The capture view is never told the drawing's name, so it cannot show it anywhere.
      name: cap ? '' : documentTitle(),
      frame: s.ui.frame,
      playing: s.ui.playing,
      activeLayerId: s.ui.activeLayerId,
      camera,
      marks: marksVisible(currentChoice<MarksChoice>('popout.marks'), s.ui.playing, camera, getMarksState().show),
      theme,
      ...(cap ? { capture: cap } : {}),
    };
  };

  const begin = () => {
    // The other end said hello: from here on, follow everything.
    if (!mirror) {
      // A message that cannot be sent (something odd in a drawing that cannot be copied) must never get in the way of the
      // drawing window: it stops following, and the other end says the link is gone.
      const send = (m: ToPopout) => {
        try {
          port.postMessage(m);
        } catch {
          queueMicrotask(stop);
        }
      };
      mirror = new Mirror({ get: () => store().get(), lastChange: () => store().lastChange() }, send, lookOf);
      const m = mirror;
      mirrors.add(m);
      installTaps();
      unsubs.push(store().subscribe(() => m.sync()));
      // The window's title follows Stream-safe going on or off.
      unsubs.push(subscribeStreamSafe(() => m.sync()));
      unsubs.push(subscribeViewSettings(() => m.sync()));
      unsubs.push(subscribeMarksState(() => m.sync()));
      unsubs.push(onChoiceChange((id) => id.startsWith('popout.') && m.sync()));
      unsubs.push(
        subscribeTheme(() => {
          theme = readTheme();
          m.sync();
        }),
      );
    }
    mirror.hello();
    // The other end starts again, so the pixels in progress go again from the start.
    if (feed) {
      pixelsRestart = true;
      pixelsDirty = true;
      later();
    }
  };

  port.onmessage = (e) => {
    if ((e.data as FromPopout | null)?.t === 'hello') begin();
  };
  port.start();
  port.addEventListener('close', () => stop());

  function stop(): void {
    if (outs[kind]?.port !== port) return;
    outs[kind] = null;
    for (const u of unsubs.splice(0)) u();
    if (mirror) mirrors.delete(mirror);
    mirror = null;
    removeTaps();
    try {
      port.close();
    } catch {
      // Already closed.
    }
    tell();
  }

  outs[kind] = { kind, port, stop };
  tell();
}

/** Stops following (the picture window is gone). */
export function stopFollowing(): void {
  outs.popout?.stop();
}

/** Stops following for a live review (it ended). */
export function stopReviewFollowing(): void {
  outs.review?.stop();
}

let installed = false;
/** Listens for the link arriving from the desktop side. Call once at start-up; does nothing in a plain browser. */
export function installPopoutLink(): void {
  if (installed || typeof window === 'undefined') return;
  const api = window.frameling?.popout;
  if (!api) return;
  installed = true;
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.ports[0]) return;
    if (e.data === 'frameling-popout-port') start(e.ports[0], 'popout');
    else if (e.data === 'frameling-review-port' && window.frameling?.review) start(e.ports[0], 'review');
  });
  api.onMode?.((m) => {
    capture = m === 'capture';
  });
  api.onClosed(() => {
    capture = false;
    stopFollowing();
  });
}
