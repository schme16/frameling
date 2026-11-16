// The hidden text box that holds the keyboard while you type pixel text. The canvas draws the pixels, the caret and the
// selection (session.ts); this box only takes the keys, so paste, selecting, arrow keys and input methods all work.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { MAX_SCALE, MIN_SCALE } from './font';
import { commitPixelText, nudgePixelText, onPixelTextSession, pixelTextSession, setPixelTextValue } from './session';
import { getPixelText, setPixelText } from './settings';
import '../text.css';

export function PixelTextInput() {
  const s = useSyncExternalStore(onPixelTextSession, pixelTextSession);
  const ref = useRef<HTMLTextAreaElement>(null);
  const open = !!s;

  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  // Keep the box's own caret where the session says (a click on the canvas moved it).
  useEffect(() => {
    const el = ref.current;
    if (s && el && (el.selectionStart !== s.start || el.selectionEnd !== s.end)) el.setSelectionRange(s.start, s.end);
  });

  if (!s) return null;
  const sync = () => {
    const el = ref.current;
    if (el) setPixelTextValue(el.value, el.selectionStart, el.selectionEnd);
  };
  return (
    <textarea
      ref={ref}
      className="pxt-input"
      value={s.text}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      aria-label="Pixel text"
      onChange={sync}
      onSelect={sync}
      onBlur={() => void commitPixelText()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        const mod = e.ctrlKey || e.metaKey;
        if (e.key === 'Escape' || (e.key === 'Enter' && mod)) {
          e.preventDefault();
          void commitPixelText();
        } else if (mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          setPixelText({ scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, getPixelText().scale + (e.key === 'ArrowUp' ? 1 : -1))) });
        } else if (e.altKey && e.key.startsWith('Arrow')) {
          e.preventDefault();
          nudgePixelText(e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0, e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0);
        } else if (e.key === 'Tab') e.preventDefault();
        // Arrow keys move the caret after the key is handled.
        else requestAnimationFrame(sync);
      }}
    />
  );
}
