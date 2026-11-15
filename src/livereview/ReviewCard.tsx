// The live review card: the code to give, who is in, who is knocking, and what reviewers have said. It hangs top right while
// a review is on (or while there are comments you have not kept). Names and words stay covered while you stream, until you
// press to read them (cover.ts, the same cover as a secret word).
import { useEffect, useSyncExternalStore } from 'react';
import { Icon } from '../ui/icons';
import { toast } from '../ui/toast';
import { DRIFT_NOTE, type InboxEntry } from '../review/inbox';
import { colourOfSeat } from '../review/pointer';
import { COVERED_NAME, COVER_NOTE, coveredCount } from './cover';
import { setChoice, useChoice } from '../core/choices';
import { admit, goToFrame, inbox, isRevealed, keepNow, refuse, removeSeat, review, reveal, setCard, stopReview, useCovered } from './state';
import './review.css';

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('Code copied.', { kind: 'success' });
  } catch {
    toast('Could not copy. Select the code and copy it.', { kind: 'warn' });
  }
}

const KIND_WORDS = { note: 'Note', reply: 'Answer', tick: 'Ticked off', mark: 'Mark' } as const;

function words(e: InboxEntry): string {
  const it = e.item;
  if (it.t === 'note' || it.t === 'reply') return it.text;
  if (it.t === 'tick') return it.done ? 'Ticked a note off as done.' : 'Un-ticked a note.';
  const m = it.mark;
  const what = m.kind === 'arrow' ? 'An arrow' : m.kind === 'circle' ? 'A circle' : m.kind === 'scribble' ? 'A sketch' : 'Words on the picture';
  return m.kind === 'text' && m.text ? `${what}: ${m.text}` : what;
}

function Entry({ e, hide }: { e: InboxEntry; hide: boolean }) {
  const open = !hide || isRevealed(e.key);
  const it = e.item;
  const frame = it.t === 'note' ? it.frame : it.t === 'mark' ? it.mark.frame : undefined;
  return (
    <li className="rv-entry" data-testid="review.entry" data-kept={e.kept ? '' : undefined}>
      <span className="rv-dot" style={{ background: colourOfSeat(e.seat) }} aria-hidden="true" />
      <div className="rv-entry-body">
        <div className="rv-entry-head">
          <b>{hide ? COVERED_NAME : e.by}</b> <span className="rv-muted">{KIND_WORDS[it.t]}{frame !== undefined ? `, frame ${frame + 1}` : ''}{e.kept ? ', in your drawing' : ''}</span>
        </div>
        {open ? (
          <p className="rv-words" data-testid="review.words">{words(e)}</p>
        ) : (
          <button type="button" className="rv-cover" data-testid="review.read" onClick={() => reveal(e.key)}>
            <span aria-hidden="true">••••••</span> <Icon name="eye" size={14} /> Read it
          </button>
        )}
        {e.drift && open && <p className="rv-muted">{DRIFT_NOTE}</p>}
        {!e.kept && open && (
          <div className="rv-entry-actions">
            {frame !== undefined && (
              <button type="button" className="ui-btn ui-btn-quiet" onClick={() => goToFrame(e)}>
                Go to frame
              </button>
            )}
            <button type="button" className="ui-btn ui-btn-quiet" data-testid="review.keepOne" onClick={() => keepNow([e.key])}>
              Keep
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export function ReviewCard() {
  const s = review.use((v) => v);
  const hide = useCovered();
  const answer = useChoice('review.keep');
  useSyncExternalStore(
    (fn) => {
      const t = setInterval(fn, 1000);
      return () => clearInterval(t);
    },
    () => Math.floor(Date.now() / 1000),
  );
  useEffect(() => {
    if (s.phase === 'off' && !inbox.waiting && s.card) setCard(false);
  }, [s.phase, s.card]);
  const waiting = inbox.waiting;
  if (!s.card || (s.phase === 'off' && !waiting)) return null;
  const unread = inbox.unread;
  const entries = inbox.entries;
  const here = s.seats.filter((x) => x.linked);
  return (
    <div className="ui-menu rv-card" role="dialog" aria-label="Live review" data-testid="review.card">
      <div className="rv-head">
        <h2 className="rv-title">Live review</h2>
        <button type="button" className="ui-btn ui-btn-quiet" aria-label="Hide this card" data-testid="review.hide" onClick={() => setCard(false)}>
          Hide
        </button>
      </div>
      {s.phase === 'starting' && <p className="rv-muted" role="status">Making a code…</p>}
      {s.phase === 'offline' && (
        <p className="rv-warn" role="status" data-testid="review.offline">
          Could not reach the peer network, so there is no code. Check your connection and try again, or send a copy instead.
        </p>
      )}
      {s.phase === 'burned' && (
        <p className="rv-warn" role="status" data-testid="review.burned">
          Somebody tried the wrong code three times, so it stopped letting new people in. Reviewers already here are fine. Stop and start again for a new code.
        </p>
      )}
      {s.phase === 'live' && (
        <>
          <p className="rv-sub">Give this code to up to four people. They can look, point and leave notes. They cannot change your drawing.</p>
          <div className="rv-code" data-testid="review.code" aria-live="polite">{s.code}</div>
          <div className="rv-row">
            <button type="button" className="ui-btn" data-testid="review.copy" onClick={() => void copy(s.code)}>
              Copy the code
            </button>
          </div>
        </>
      )}
      {s.knocks.map((k) => (
        <div className="rv-knock" key={k.conn} data-testid="review.knock" role="alert">
          <span>
            <b>{hide ? COVERED_NAME : k.name}</b> wants to review.
          </span>
          <span className="rv-row">
            <button type="button" className="ui-btn ui-btn-primary" data-testid="review.letIn" onClick={() => admit(k.conn)}>
              Let in
            </button>
            <button type="button" className="ui-btn ui-btn-quiet" data-testid="review.notNow" onClick={() => refuse(k.conn)}>
              Not now
            </button>
          </span>
        </div>
      ))}
      {s.seats.length > 0 && (
        <ul className="rv-seats" aria-label="Who is here">
          {s.seats.map((x) => (
            <li key={x.seat} className="rv-seat" data-testid="review.seat" data-linked={x.linked ? '' : undefined}>
              <span className="rv-dot" style={{ background: colourOfSeat(x.seat) }} aria-hidden="true" />
              <span className="rv-seat-name">{hide ? COVERED_NAME : x.name}</span>
              <span className="rv-muted">{x.linked ? 'here' : 'link dropped'}</span>
              {s.phase !== 'off' && (
                <button type="button" className="ui-btn ui-btn-quiet" aria-label={`Send ${hide ? COVERED_NAME : x.name} away`} onClick={() => removeSeat(x.seat)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {s.phase === 'live' && here.length === 0 && s.knocks.length === 0 && <p className="rv-muted" role="status">Waiting for somebody to use the code.</p>}
      <label className="rv-auto" data-testid="review.auto">
        <input type="checkbox" checked={answer === 'all'} onChange={(e) => setChoice('review.keep', e.target.checked ? 'all' : 'look')} />
        <span>Add comments to my drawing as they come</span>
      </label>
      {answer === 'all' && hide && waiting > 0 && <p className="rv-muted">They are covered while you stream, and go in when it is safe.</p>}
      {entries.length > 0 && (
        <section aria-label="What reviewers said">
          <h3 className="rv-sec">
            Comments{' '}
            {hide && unread > 0 ? <span className="rv-n" data-testid="review.count">{coveredCount(unread)}</span> : <span className="rv-n" data-testid="review.count">{waiting > 0 ? `${waiting} waiting` : 'all in your drawing'}</span>}
          </h3>
          {hide && <p className="rv-muted">{COVER_NOTE}</p>}
          <ul className="rv-list">
            {entries.map((e) => (
              <Entry key={e.key} e={e} hide={hide} />
            ))}
          </ul>
          {waiting > 0 && (
            <div className="rv-row">
              <button type="button" className="ui-btn ui-btn-primary" data-testid="review.keepAll" onClick={() => keepNow()}>
                Keep all in my drawing
              </button>
            </div>
          )}
        </section>
      )}
      <div className="rv-row rv-foot">
        {s.phase !== 'off' ? (
          <button type="button" className="ui-btn" data-testid="review.stop" onClick={stopReview}>
            Stop the review
          </button>
        ) : (
          <button type="button" className="ui-btn ui-btn-quiet" onClick={() => setCard(false)}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}

/** The chip beside the Live pill: obvious while a review is on, and the way to open the card. Hidden when off. */
export function ReviewChip() {
  const s = review.use((v) => v);
  const hide = useCovered();
  if (s.phase === 'off') return null;
  const here = s.seats.filter((x) => x.linked).length;
  const label = s.phase === 'live' ? (here ? `Live review: ${here} here` : 'Live review: waiting') : s.phase === 'starting' ? 'Live review: starting' : 'Live review: needs you';
  const names = here && !hide ? s.seats.filter((x) => x.linked).map((x) => x.name).join(', ') : '';
  return (
    <button type="button" className="rv-chip" data-testid="review.chip" data-help="live-review" aria-expanded={s.card} data-tip={names ? `${label} (${names})` : label} onClick={() => setCard(!s.card)}>
      <span className="rv-chip-dot" aria-hidden="true" />
      {label}
      {s.knocks.length > 0 && <span className="rv-n" aria-label={`${s.knocks.length} knocking`}>{s.knocks.length}</span>}
    </button>
  );
}
