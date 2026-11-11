// Quill, the hedgehog with coloured-pencil quills. <Quill anim="wave" then="idle" /> plays a wave and settles into
// idle. Frames are drawn by the shared runtime straight onto the element, so a playing Quill never re-renders React.
import { useEffect, useRef, type ReactNode } from 'react';
import { usePrefs } from '../prefs';
import { createPlayer, loadQuill, quillSheet } from './runtime';
import { toBeats, type QuillAnim, type Script } from './timing';
import './quill.css';

export type { QuillAnim, Beat, Script } from './timing';

export interface QuillProps {
  /** One anim, or beats played in order (the last one stays on). */
  anim?: Script;
  /** What to settle into after a one-shot (or after `anim`'s beats). */
  then?: QuillAnim;
  /** Wanted width in px. Drawn at a whole-number scale of the art so the pixels stay crisp. */
  size?: number;
  /** Face left instead of right. */
  flip?: boolean;
  onDone?: () => void;
  className?: string;
  /** Show him even with Show Quill off. Only for his goodbye, which plays after the switch is already off. */
  force?: boolean;
}

/** True when Quill should show. Bubbles use it to keep their text when he's hidden. */
export const useShowQuill = (): boolean => usePrefs((p) => p.showQuill);

/** True when a Quill would actually be drawn: turned on (or forced, for his goodbye), and the art has loaded. */
export function useQuillShown(force = false): boolean {
  const show = useShowQuill();
  const ready = quillSheet.use((s) => !!s);
  useEffect(loadQuill, []);
  return (show || force) && ready;
}

export function Quill({ anim = 'idle', then, size = 96, flip = false, onDone, className = '', force = false }: QuillProps) {
  if (!useQuillShown(force)) return null;
  return <QuillSprite anim={anim} then={then} size={size} flip={flip} onDone={onDone} className={className} />;
}

function QuillSprite({ anim, then, size, flip, onDone, className }: Required<Pick<QuillProps, 'anim' | 'size' | 'flip'>> & Pick<QuillProps, 'then' | 'onDone' | 'className'>) {
  const el = useRef<HTMLSpanElement>(null);
  const player = useRef<ReturnType<typeof createPlayer> | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  // A stable key for the script, so a new array with the same beats doesn't restart him.
  const key = JSON.stringify([anim, then ?? null]);

  useEffect(() => {
    const p = createPlayer({ el: el.current!, size, beats: toBeats(anim, then), onDone: () => done.current?.() });
    player.current = p;
    return () => {
      p.stop();
      player.current = null;
    };
  }, []);

  useEffect(() => {
    player.current?.set(toBeats(anim, then), () => done.current?.(), size);
  }, [key, size]);

  return <span ref={el} className={`quill${flip ? ' quill-flip' : ''}${className ? ` ${className}` : ''}`} aria-hidden="true" />;
}

export interface QuillSaysProps extends QuillProps {
  children: ReactNode;
  /** Where Quill stands: left of the bubble (default) or above it. */
  side?: 'left' | 'top';
  /** The bubble's own class, for placing it. */
  bubbleClassName?: string;
}

/** Quill with a speech bubble. With Quill turned off in Preferences the bubble still shows, without the tail. */
export function QuillSays({ children, side = 'left', bubbleClassName = '', className = '', ...quill }: QuillSaysProps) {
  const withQuill = useQuillShown();
  return (
    <div className={`quill-says quill-says-${side}${withQuill ? '' : ' is-alone'}${className ? ` ${className}` : ''}`}>
      {withQuill && <Quill {...quill} />}
      <div className={`quill-bubble${bubbleClassName ? ` quill-bubble-own ${bubbleClassName}` : ''}`}>{children}</div>
    </div>
  );
}

/** An empty spot with Quill and a friendly line, like a search with no results. Without Quill it's just the line. */
export function QuillEmpty({ children, anim = 'idle', then, size = 64, className = '' }: Pick<QuillProps, 'anim' | 'then' | 'size' | 'className'> & { children: ReactNode }) {
  return (
    <div className={`quill-empty${className ? ` ${className}` : ''}`}>
      <Quill anim={anim} then={then} size={size} />
      <p>{children}</p>
    </div>
  );
}
