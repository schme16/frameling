// The play range (in and out): set the first and last frame that play, loop just that part, and export just it.
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { toast } from '../ui/toast';
import { setTl, tl } from './state';

export type InOut = { start: number; end: number };

/**
 * The range after setting one end at `frame`. Setting the start past the end (or the end before the start) moves
 * the other end along with it, so the range is never back to front. `undefined` means no range (it covers everything).
 */
export function withEnd(cur: InOut | undefined, length: number, end: 'in' | 'out', frame: number): InOut | undefined {
  const last = Math.max(0, length - 1);
  const f = Math.max(0, Math.min(last, Math.round(frame)));
  let start = cur ? cur.start : 0;
  let stop = cur ? cur.end : last;
  if (end === 'in') {
    start = f;
    if (stop < f) stop = last;
  } else {
    stop = f;
    if (start > f) start = 0;
  }
  if (start === 0 && stop === last) return undefined;
  return { start, end: stop };
}

function set(label: string, next: InOut | undefined): void {
  const s = store();
  s.update(label, (doc) => {
    if (next) doc.inOut = next;
    else delete doc.inOut;
  });
  // A chosen clip would take over from the range, so picking a range lets go of it.
  if (next && tl().clipId) setTl({ clipId: null });
}

export function setIn(frame = store().get().ui.frame): void {
  const { doc } = store().get();
  set('Set play range start', withEnd(doc.inOut, doc.length, 'in', frame));
}

export function setOut(frame = store().get().ui.frame): void {
  const { doc } = store().get();
  set('Set play range end', withEnd(doc.inOut, doc.length, 'out', frame));
}

/** Sets both ends at once (dragging across the ruler). */
export function setInOut(a: number, b: number): void {
  const { doc } = store().get();
  const last = Math.max(0, doc.length - 1);
  const clamp = (n: number) => Math.max(0, Math.min(last, Math.round(n)));
  const start = clamp(Math.min(a, b));
  const end = clamp(Math.max(a, b));
  set('Set play range', start === 0 && end === last ? undefined : { start, end });
}

export function clearInOut(): void {
  if (!store().get().doc.inOut) return void toast('There is no play range to clear. Everything plays.');
  set('Clear play range', undefined);
}

registerCommands([
  {
    id: 'timeline.setIn',
    label: 'Start the play range here (in)',
    category: 'Timeline',
    keys: ['Alt+['],
    description: 'Playback starts (and loops back to) this frame. Handy for working on one part. Export can save just the play range too.',
    help: 'timeline-play-range',
    keywords: ['in point', 'play range', 'work area', 'loop part', 'range start', 'mark in'],
    run: () => setIn(),
  },
  {
    id: 'timeline.setOut',
    label: 'End the play range here (out)',
    category: 'Timeline',
    keys: ['Alt+]'],
    description: 'Playback stops (or loops) after this frame.',
    help: 'timeline-play-range',
    keywords: ['out point', 'play range', 'work area', 'loop part', 'range end', 'mark out'],
    run: () => setOut(),
  },
  {
    id: 'timeline.clearInOut',
    label: 'Play everything again (clear the play range)',
    category: 'Timeline',
    description: 'Remove the play range, so the whole animation plays.',
    help: 'timeline-play-range',
    keywords: ['clear in out', 'play range', 'work area', 'reset range'],
    enabled: (s) => !!s.doc.inOut,
    run: () => clearInOut(),
  },
  {
    id: 'timeline.togglePingPong',
    label: 'Play back and forth',
    category: 'Timeline',
    description: 'Play to the end, then backwards to the start, instead of jumping back. Great for breathing, swinging and floating.',
    help: 'timeline-playing',
    keywords: ['ping pong', 'pingpong', 'bounce', 'boomerang', 'reverse', 'back and forth', 'yoyo'],
    checked: (s) => !!s.ui.pingPong,
    run: () => store().setUi((ui) => ({ pingPong: !ui.pingPong })),
  },
]);
