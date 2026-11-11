import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { Quill, useQuillShown } from './mascot';
import { dismissToast, toasts, type ToastItem } from './toast';

const KIND_ICON = { info: 'info', success: 'check', warn: 'warning', error: 'warning' } as const;

function ToastCard({ t }: { t: ToastItem }) {
  const [paused, setPaused] = useState(false);
  const quill = useQuillShown() && !!t.quill;
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (paused || !t.duration) return;
    timer.current = window.setTimeout(() => dismissToast(t.id), t.duration);
    return () => window.clearTimeout(timer.current);
  }, [paused, t.duration, t.id]);
  return (
    <div className={`ui-toast ui-toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      {quill ? <Quill anim={t.quill!} then="idle" size={32} className="ui-toast-quill" /> : <Icon name={KIND_ICON[t.kind]} size={16} />}
      <span className="ui-toast-text">{t.message}</span>
      {t.action && (
        <button
          type="button"
          className="ui-toast-action"
          onClick={() => {
            const run = t.action!.run;
            dismissToast(t.id);
            run();
          }}
        >
          {t.action.label}
        </button>
      )}
      <button type="button" className="ui-icon-btn ui-toast-x" aria-label="Dismiss message" onClick={() => dismissToast(t.id)}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

export function ToastView() {
  const list = toasts.use((v) => v);
  return (
    <div className="ui-toasts" aria-live="polite">
      {list.map((t) => (
        <ToastCard key={t.id} t={t} />
      ))}
    </div>
  );
}
