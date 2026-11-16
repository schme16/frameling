// The History panel: every step you have taken, newest at the top. Click a step to go back to it; the steps after it
// turn grey and stay for Redo until you draw something new. "Keep" saves a step as a named version.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { notify } from '../io/notify';
import { store, useStore } from '../core/store';
import { Tip } from '../canvas/controls';
import { buildRows, clockWords, jumpWords, stepsFrom, versionName, whenWords, type HistoryRow } from './model';
import './history.css';

/** Saves the drawing as it stood at a row as a named version (the same list as File > Versions). */
async function keepRow(row: HistoryRow, steps: number): Promise<void> {
  const s = store();
  const doc = s.docAtStep(row.id);
  if (!doc) return;
  const { takeVersion } = await import('../io/versions');
  const v = await takeVersion({ name: versionName(row, steps), doc });
  if (v) notify(`Version "${v.name}" kept. Find it in File > Versions...`, 'success', { label: 'Show', run: () => void import('../io/VersionsDialog').then((m) => m.openVersionsDialog()) });
  else notify("That version couldn't be kept. Please try again.", 'error');
}

export function HistoryPanel() {
  // Any change to the drawing (a new step, Undo, Redo or a jump) gives a new document, so this looks again.
  useStore((s) => s.doc);
  const inside = store().nestedTag() !== null;
  const { done, undone } = store().historyList();
  const rows = useMemo(() => buildRows(done, undone), [done, undone]);
  // The words for "5 min ago" move on while the panel is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const list = useRef<HTMLUListElement>(null);
  const [busy, setBusy] = useState<number | null | undefined>(undefined);

  // The row you are at stays in view as steps are added or you jump.
  const currentId = rows.find((r) => r.state === 'current')?.id ?? null;
  useEffect(() => {
    list.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest' });
  }, [currentId, rows.length]);

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const btns = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button.hi-step')];
    const at = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : Math.min(btns.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)));
    btns[next]?.focus();
  };

  return (
    <div className="hi-panel" data-testid="history-panel">
      <Tip>The steps after the one you pick turn grey. Redo brings them back, until you draw something new.</Tip>
      {inside && <Tip stays>These are the steps of what you are editing inside the drawing.</Tip>}
      <ul className="hi-list" ref={list} aria-label="Steps you have taken, newest first" onKeyDown={onKeyDown}>
        {rows.map((r) => {
          const steps = stepsFrom(rows, r.id);
          const when = r.at === undefined ? '' : whenWords(r.at, now);
          return (
            <li key={r.id ?? 'start'} className={`hi-row ${r.state}`}>
              <button
                type="button"
                className="hi-step"
                aria-current={r.state === 'current' ? 'step' : undefined}
                title={`${jumpWords(steps)}${r.at === undefined ? '' : ` (${clockWords(r.at)})`}`}
                onClick={() => store().jumpToStep(r.id)}
                data-step={r.id ?? 'start'}
              >
                <span className="hi-dot" aria-hidden="true" />
                <span className="hi-label">{r.label}</span>
                <span className="hi-when">{when}</span>
              </button>
              {!inside && (
                <button
                  type="button"
                  className="hi-keep"
                  disabled={busy !== undefined}
                  aria-label={`Keep a version from the step ${r.label}`}
                  title="Keep a version of the drawing as it was at this step"
                  onClick={async () => {
                    setBusy(r.id);
                    try {
                      await keepRow(r, steps);
                    } finally {
                      setBusy(undefined);
                    }
                  }}
                >
                  Keep
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {done.length === 0 && undone.length === 0 && <Tip stays>Nothing to show yet. Draw something and each step will appear here.</Tip>}
    </div>
  );
}
