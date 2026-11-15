// Join a live review: type the code somebody gave you and the name they will see you as. Opens a review window of its own
// (the desktop side makes it); this dialog only starts that and closes.
import { useMemo, useState } from 'react';
import { parseCode } from '../share/code';
import { codeHint } from '../io/shareState';
import { Modal, mountModal } from '../io/mount';
import { noteName } from '../notes/state';
import '../io/share.css';

function JoinDialog({ close }: { close: () => void }) {
  const [text, setText] = useState('');
  const [name, setName] = useState(noteName());
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parseCode(text), [text]);
  const hint = parsed.ok || text.trim() === '' ? '' : codeHint(parsed.why, parsed.ok ? undefined : parsed.word);
  const go = () => {
    const api = window.frameling?.review;
    if (!parsed.ok || !api || busy) return;
    setBusy(true);
    void api.join(text, name.trim()).then((r) => {
      if (r.ok) close();
      else setBusy(false);
    });
  };
  return (
    <Modal title="Join a live review" onClose={close}>
      <div className="io-body">
        <form
          id="review-join-form"
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          <p>Type the code they gave you. It's four words. A window opens where you can look at their drawing, point, and leave notes. You cannot change their drawing.</p>
          <label className="share-field">
            <span>Their code</span>
            <input data-autofocus="" data-testid="review.joinCode" value={text} spellCheck={false} autoComplete="off" autoCapitalize="off" maxLength={80} placeholder="four words, like ocean-tiger-maple-spoon" aria-describedby="review-join-hint" onChange={(e) => setText(e.target.value)} />
          </label>
          <p id="review-join-hint" className="share-hint" role="status">
            {hint}
          </p>
          <label className="share-field">
            <span>The name they will see</span>
            <input data-testid="review.joinName" value={name} maxLength={24} placeholder="Reviewer" autoComplete="off" onChange={(e) => setName(e.target.value)} />
          </label>
          <p className="io-muted share-note">They have to let you in first. Your notes are kept on this computer only until they have arrived.</p>
        </form>
      </div>
      <div className="io-foot">
        <button type="button" className="io-btn" onClick={close}>
          Cancel
        </button>
        <button type="submit" form="review-join-form" className="io-btn io-primary" data-testid="review.joinGo" disabled={!parsed.ok || busy}>
          Join
        </button>
      </div>
    </Modal>
  );
}

export function openJoinDialog(): () => void {
  return mountModal((close) => <JoinDialog close={close} />);
}
