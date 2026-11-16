// The one clock in Quill's house. It ticks once a second to re-read how he's feeling and to move his pottering on, and
// it only exists while someone could see the result: the panel is on screen, the window has focus, nothing is
// playing, and he's actually being drawn here. Otherwise there is no timer at all, not a slow one. (The rule and
// its test live in potter.ts `clockRuns` and test/quillpet/potter-cost.test.tsx.)
import { useEffect, useReducer, useRef, useState, type RefObject } from 'react';
import { reducedMotion, usePrefs } from '../ui/prefs';
import { clockRuns, potters, startPotter, stepPotter, type Gate, type Potter, type PotterCtx } from './potter';

/** How often it ticks. A second is plenty: he does one thing for several seconds at a time. */
export const TICK_MS = 1000;

/** Whether the element can be seen at all: not folded away, not scrolled out of view. True where we can't tell. */
function useOnScreen(ref: RefObject<Element | null>): boolean {
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => setSeen(entries[entries.length - 1].isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return seen;
}

/** The window has focus (a pen in another app, or a different window, counts as not looking). */
function useFocused(): boolean {
  const [focused, set] = useState(() => (typeof document === 'undefined' || !document.hasFocus ? true : document.hasFocus()));
  useEffect(() => {
    const on = () => set(true);
    const off = () => set(false);
    window.addEventListener('focus', on);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('focus', on);
      window.removeEventListener('blur', off);
    };
  }, []);
  return focused;
}

function usePageHidden(): boolean {
  const [hidden, set] = useState(() => typeof document !== 'undefined' && document.hidden);
  useEffect(() => {
    const on = () => set(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return hidden;
}

export interface QuillClockOptions {
  /** A Quill is drawn in his house right now. */
  shown: boolean;
  /** The animation is playing. */
  playing: boolean;
  /** The element to watch for being on screen. */
  within: RefObject<Element | null>;
  /** False while something louder than pottering has him (you drawing, a fuss): the clock still reads his mood, but he stays put. */
  stepping?: boolean;
  /** What changes what he fancies doing. Read fresh at every tick, so it never needs to re-render anything. */
  ctx: () => PotterCtx;
  /** For tests: a random number source. */
  rng?: () => number;
}

/**
 * Re-renders once a second while the clock runs, and gives back what he's pottering at. With the clock stopped there
 * is no timer and nothing moves; with reduced motion he sits in the middle of the room.
 */
export function useQuillClock({ shown, playing, within, ctx, stepping = true, rng = Math.random }: QuillClockOptions): { potter: Potter; running: boolean; moving: boolean } {
  const onScreen = useOnScreen(within);
  const focused = useFocused();
  const pageHidden = usePageHidden();
  // Re-read on every render, so a change of the saved setting or the system one is seen straight away.
  usePrefs((p) => p.reduceMotion);
  const gate: Gate = { shown, onScreen, focused, pageHidden, playing, reduced: reducedMotion() };
  const running = clockRuns(gate);
  const moving = potters(gate);

  const potter = useRef<Potter>(startPotter());
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const rngRef = useRef(rng);
  rngRef.current = rng;
  const movingRef = useRef(moving);
  movingRef.current = moving && stepping;

  useEffect(() => {
    if (!running) return;
    // Coming back to it: read how he's feeling now, without catching up on the time you were away.
    bump();
    const t = setInterval(() => {
      if (movingRef.current) potter.current = stepPotter(potter.current, TICK_MS, ctxRef.current(), rngRef.current);
      bump();
    }, TICK_MS);
    return () => clearInterval(t);
  }, [running]);

  // Reduced motion settles him: back to sitting in the middle, ready for when it's turned off.
  useEffect(() => {
    if (gate.reduced) potter.current = startPotter();
  }, [gate.reduced]);

  return { potter: potter.current, running, moving };
}
