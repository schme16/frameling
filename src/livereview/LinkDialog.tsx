// The question a review link puts: "Join this review?". Nothing has connected when this shows. It says what joining does, shows
// the code (covered while you stream, the same cover as every other code), and only the Join button goes on to the desktop side.
// Even then the sharer has to let you in.
import { useEffect, useState } from 'react';
import { REVEAL_MS } from '../audience/spoilers';
import { Icon } from '../ui/icons';
import { Modal } from '../io/mount';
import { noteName } from '../notes/state';
import { maskedCode, parseCode } from '../share/code';
import { joinReady } from './linkLogic';
import { useCovered } from './state';
import '../io/share.css';
import './review.css';

export function LinkDialog({ code, close }: { code: string; close: () => void }) {
  const hide = useCovered();
  const [shownAt] = useState(() => Date.now());
  const [ready, setReady] = useState(false);
  const [peek, setPeek] = useState(false);
  const [name, setName] = useState(noteName());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(joinReady(shownAt, Date.now())), 950);
    return () => clearTimeout(t);
  }, [shownAt]);
  useEffect(() => {
    if (!peek) return;
    const t = setTimeout(() => setPeek(false), REVEAL_MS);
    return () => clearTimeout(t);
  }, [peek]);
  const parsed = parseCode(code);
  const shown = hide && !peek && parsed.ok ? maskedCode(parsed.code) : code;
  const go = () => {
    const api = window.frameling?.review;
    if (!ready || busy || !api) return;
    setBusy(true);
    void api.join(code, name.trim()).then((r) => {
      if (r.ok) close();
      else setBusy(false);
    });
  };
  return (
    <Modal title="Join a live review?" onClose={close}>
      <div className="io-body">
        <form
          id="review-link-form"
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          <p data-testid="review.linkAbout">Somebody sent you a link to look at their drawing live. Nothing has connected yet. Join only if you were expecting it.</p>
          <p className="io-muted">A window opens where you can look, point and leave notes. You can't change their drawing, and your own drawing here stays as it is. They have to let you in first.</p>
          <div className="share-field">
            <span>Their code</span>
            <div className="rv-linkcode">
              <code data-testid="review.linkCode" aria-live="polite">
                {shown}
              </code>
              {hide && (
                <button type="button" className="ui-btn ui-btn-quiet" data-testid="review.linkPeek" aria-pressed={peek} aria-label={peek ? 'Cover the code' : 'Show the code'} onClick={() => setPeek((p) => !p)}>
                  <Icon name="eye" size={14} /> {peek ? 'Cover' : 'Show'}
                </button>
              )}
            </div>
          </div>
          {hide && <p className="share-hint">Covered in case your viewers can see this window.</p>}
          <label className="share-field">
            <span>The name they will see</span>
            <input data-testid="review.linkName" value={name} maxLength={24} placeholder="Reviewer" autoComplete="off" onChange={(e) => setName(e.target.value)} />
          </label>
        </form>
      </div>
      <div className="io-foot">
        <button type="button" className="io-btn" data-autofocus="" data-testid="review.linkNo" onClick={close}>
          Not now
        </button>
        <button type="submit" form="review-link-form" className="io-btn io-primary" data-testid="review.linkJoin" disabled={!ready || busy}>
          Join
        </button>
      </div>
    </Modal>
  );
}
