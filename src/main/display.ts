// Which screen the window is on, and when it moves to another one. The page decides what to do about it
// (src/ui/screenSize.ts); this side only reports what the computer says.
import { BrowserWindow, screen } from 'electron';
import type { DisplayInfo } from '../preload/api';

/** The screen the window mostly sits on, in the computer's own units (before any interface size). */
export function describeDisplay(win: BrowserWindow): DisplayInfo {
  const d = screen.getDisplayMatching(win.getBounds());
  const b = win.getBounds();
  return {
    id: d.id,
    width: d.size.width,
    height: d.size.height,
    scaleFactor: d.scaleFactor,
    workWidth: d.workArea.width,
    workHeight: d.workArea.height,
    windowWidth: b.width,
    windowHeight: b.height,
  };
}

/**
 * Calls `send` with the new screen when the window is dragged onto another one, or when a screen's size or scale
 * changes. Dragging fires a stream of events, so it waits until the window has stopped for a moment. Returns a stopper.
 */
export function watchDisplay(win: BrowserWindow, send: (d: DisplayInfo) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = '';
  const check = () => {
    if (win.isDestroyed()) return;
    const d = describeDisplay(win);
    const key = `${d.id}:${d.width}x${d.height}@${d.scaleFactor}`;
    if (key === last) return;
    last = key;
    send(d);
  };
  const soon = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(check, 700);
  };
  // Linux only sends 'move' (not 'moved') while dragging, so listen to both.
  win.on('move', soon);
  win.on('moved', soon);
  screen.on('display-metrics-changed', soon);
  screen.on('display-added', soon);
  screen.on('display-removed', soon);
  // The first answer is what the page asks for itself; remember it so only a real change is sent.
  try {
    const d = describeDisplay(win);
    last = `${d.id}:${d.width}x${d.height}@${d.scaleFactor}`;
  } catch {
    // Not placed yet: the first move reports it.
  }
  return () => {
    if (timer) clearTimeout(timer);
    win.removeListener('move', soon);
    win.removeListener('moved', soon);
    screen.removeListener('display-metrics-changed', soon);
    screen.removeListener('display-added', soon);
    screen.removeListener('display-removed', soon);
  };
}
