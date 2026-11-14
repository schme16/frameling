// The drawing window's end of the link to the picture window. A message port arrives (from the desktop side) whenever the
// picture window opens or the link is made again; this turns it into a Mirror that watches the store. Nothing runs while
// no picture window is open: the store has no extra listener and the tools' taps are empty.
import { store, type State } from '../core/store';
import { currentChoice, onChoiceChange } from '../core/choices';
import type { StrokeShape } from '../core/format';
import { subscribeViewSettings } from '../canvas/viewSettings';
import { cssVar, subscribeTheme } from '../canvas/theme';
import { lookingThrough } from '../camera/ops';
import { documentTitle } from '../io/document';
import { getMarksState, subscribeMarksState } from '../notes/marksState';
import { setInkTap, setLiveTap } from './ink';
import { Mirror } from './mirror';
import type { FromPopout, Look, LiveDrawing, PopoutTheme, ToPopout } from './protocol';
import { marksVisible, throughCamera, type CameraChoice, type MarksChoice } from './show';

interface Session {
  port: MessagePort;
  stop(): void;
}

let session: Session | null = null;
const listeners = new Set<() => void>();

export const isPopoutOpen = (): boolean => session !== null;

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

function start(port: MessagePort): void {
  session?.stop();
  let theme = readTheme();
  let raf = 0;
  let ink: StrokeShape | null = null;
  let live: LiveDrawing | null = null;
  let inkDirty = false;
  let liveDirty = false;
  let mirror: Mirror | null = null;
  const unsubs: (() => void)[] = [];

  const lookOf = (s: State): Look => {
    const camera = throughCamera(currentChoice<CameraChoice>('popout.camera'), s.doc, lookingThrough(s));
    return {
      name: documentTitle(),
      frame: s.ui.frame,
      playing: s.ui.playing,
      activeLayerId: s.ui.activeLayerId,
      camera,
      marks: marksVisible(currentChoice<MarksChoice>('popout.marks'), s.ui.playing, camera, getMarksState().show),
      theme,
    };
  };

  // Strokes and half-done changes go once per screen frame at most: the picture window cannot show more anyway.
  const flush = () => {
    raf = 0;
    if (inkDirty) mirror?.setInk(ink);
    if (liveDirty) mirror?.setLive(live);
    inkDirty = liveDirty = false;
  };
  const later = () => {
    if (!raf) raf = requestAnimationFrame(flush);
  };

  const begin = () => {
    // The picture window said hello: from here on, follow everything.
    if (!mirror) {
      // A message that cannot be sent (something odd in a drawing that cannot be copied) must never get in the way of the
      // drawing window: it stops following, and the second window says the link is gone.
      const send = (m: ToPopout) => {
        try {
          port.postMessage(m);
        } catch {
          queueMicrotask(stop);
        }
      };
      mirror = new Mirror({ get: () => store().get(), lastChange: () => store().lastChange() }, send, lookOf);
      const m = mirror;
      unsubs.push(store().subscribe(() => m.sync()));
      unsubs.push(subscribeViewSettings(() => m.sync()));
      unsubs.push(subscribeMarksState(() => m.sync()));
      unsubs.push(onChoiceChange((id) => id.startsWith('popout.') && m.sync()));
      unsubs.push(
        subscribeTheme(() => {
          theme = readTheme();
          m.sync();
        }),
      );
      setInkTap((s) => {
        ink = s;
        inkDirty = true;
        // The end of a stroke goes straight away (the finished line is arriving as an edit); growth waits for the next screen frame.
        if (s === null) flush();
        else later();
      });
      setLiveTap((l) => {
        live = l;
        liveDirty = true;
        if (l === null) flush();
        else later();
      });
    }
    mirror.hello();
  };

  port.onmessage = (e) => {
    if ((e.data as FromPopout | null)?.t === 'hello') begin();
  };
  port.start();
  port.addEventListener('close', () => stop());

  function stop(): void {
    if (session?.port !== port) return;
    session = null;
    for (const u of unsubs.splice(0)) u();
    setInkTap(null);
    setLiveTap(null);
    if (raf) cancelAnimationFrame(raf);
    try {
      port.close();
    } catch {
      // Already closed.
    }
    tell();
  }

  session = { port, stop };
  tell();
}

/** Stops following (the picture window is gone). */
export function stopFollowing(): void {
  session?.stop();
}

let installed = false;
/** Listens for the link arriving from the desktop side. Call once at start-up; does nothing in a plain browser. */
export function installPopoutLink(): void {
  if (installed || typeof window === 'undefined') return;
  const api = window.frameling?.popout;
  if (!api) return;
  installed = true;
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data !== 'frameling-popout-port' || !e.ports[0]) return;
    start(e.ports[0]);
  });
  api.onClosed(() => stopFollowing());
}
