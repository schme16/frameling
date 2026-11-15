import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { Quill, useQuillShown } from './mascot';
import { dismissToast, toasts, toastTestId, type ToastItem } from './toast';
import { scrubText, useStreamSafe } from '../core/streamSafe';
import { holdsBack, READ_IT, UNREAD_WAIT_MS, useCovering } from '../audience/spoilers';

const KIND_ICON = { info: 'info', success: 'check', warn: 'warning', error: 'warning' } as const;

function ToastCard({ t }: { t: ToastItem }) {
  useStreamSafe();
  const [paused, setPaused] = useState(false);
  // Words from chat that nobody has read stay covered, with a Read it button, until the streamer presses it.
  const covers = useCovering();
  const [read, setRead] = useState(false);
  const held = holdsBack(t.covered, covers, read);
  // A farewell Quill shows until his goodbye is done, then the toast carries on without him.
  const [gone, setGone] = useState(false);
  // His goodbye is the hello's: nothing outranks it. Any other toast is a toast.
  const surface = t.farewell ? 'hello' : 'toast';
  const quill = useQuillShown(surface, { surfaceId: String(t.id), force: !!t.farewell && !gone, wanted: !!t.quill });
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    // Covered, it waits to be read (and goes on its own after a while); read, it keeps its usual time from then.
    const wait = held ? UNREAD_WAIT_MS : t.duration;
    if (paused || !wait) return;
    timer.current = window.setTimeout(() => dismissToast(t.id), wait);
    return () => window.clearTimeout(timer.current);
  }, [paused, t.duration, t.id, held]);
  return (
    <div className={`ui-toast ui-toast-${t.kind}${t.sign ? ' ui-toast-sign' : ''}`} role={t.kind === 'error' ? 'alert' : 'status'} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      {quill ? <Quill surface={surface} surfaceId={String(t.id)} anim={t.quill!} then={t.farewell ? undefined : 'idle'} force={t.farewell && !gone} onDone={t.farewell ? () => setGone(true) : undefined} size={48} className="ui-toast-quill" /> : <Icon name={KIND_ICON[t.kind]} size={16} />}
      <span className="ui-toast-text">{held ? t.covered : scrubText(t.message)}</span>
      {held && (
        <button type="button" className="ui-toast-action" data-testid="toast.read-it" onClick={() => setRead(true)}>
          {READ_IT}
        </button>
      )}
      {t.action && !held && (
        <button
          type="button"
          className="ui-toast-action"
          data-testid={toastTestId(t.action)}
          onClick={() => {
            const run = t.action!.run;
            dismissToast(t.id);
            run();
          }}
        >
          {t.action.label}
        </button>
      )}
      {t.decline && (
        <button
          type="button"
          className="ui-toast-action"
          data-testid={toastTestId(t.decline)}
          onClick={() => {
            const run = t.decline!.run;
            dismissToast(t.id);
            run();
          }}
        >
          {t.decline.label}
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
