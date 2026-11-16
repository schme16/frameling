// The small card that says a newer Frameling is out, in the release's own words, with three answers. It sits in the
// corner rather than stopping the whole window, and it only turns up at a moment when nobody is drawing.
import { useEffect } from 'react';
import { Icon } from '../ui/icons';
import { openHelp } from '../ui/overlays';
import { versionText } from './logic';
import { answer, carryOn, finishUpdate, offer, offerNotes, openReleasePage } from './state';
import './update.css';

export function UpdateOffer() {
  const o = offer.use((v) => v);
  const asking = o?.phase.kind === 'asking';
  // Not right now is what Escape means, as long as the card is only asking.
  useEffect(() => {
    if (!asking) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.querySelector('.up-offer')?.contains(document.activeElement)) void answer('later');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [asking]);
  if (!o) return null;
  const { release, facts, phase } = o;
  const page = facts.how === 'page';
  const notes = offerNotes(release);
  const version = versionText(release.tag);
  const beta = release.prerelease || release.draft;
  return (
    <section className="up-offer" role="dialog" aria-modal="false" aria-labelledby="up-title" data-testid="update.offer">
      <header className="up-head">
        <Icon name="info" size={16} />
        <h2 id="up-title">{phase.kind === 'ready' ? 'Updated' : `Frameling ${version} is out`}</h2>
        {beta && <span className="up-tag">{release.draft ? 'draft' : 'pre-release'}</span>}
        <button type="button" className="ui-btn ui-btn-quiet up-help" aria-label="Learn more about updates" title="Learn more" onClick={() => openHelp('updates')}>
          <Icon name="help" size={14} />
        </button>
      </header>

      {phase.kind === 'asking' && (
        <>
          <p className="up-sub">
            You have {versionText(facts.version)}. {page ? facts.why : 'Nothing is downloaded until you press Update now.'}
          </p>
          {notes.lines.length > 0 && (
            <div className="up-notes" tabIndex={0} aria-label="What is new" data-testid="update.notes">
              {notes.lines.map((l, i) =>
                l.kind === 'heading' ? (
                  <h3 key={i}>{l.text}</h3>
                ) : l.kind === 'item' ? (
                  <p key={i} className="up-item">
                    {l.text}
                  </p>
                ) : (
                  <p key={i}>{l.text}</p>
                ),
              )}
              {notes.more && <p className="up-more">There is more on the release page.</p>}
            </div>
          )}
          <div className="up-foot">
            <span className="ui-spacer" />
            <button type="button" className="ui-btn ui-btn-quiet" data-testid="update.skip" onClick={() => void answer('skip')} title="Never offer this version again. A newer one still will be.">
              Skip this one
            </button>
            <button type="button" className="ui-btn" data-testid="update.later" onClick={() => void answer('later')} title="Ask again next time Frameling starts.">
              Not right now
            </button>
            {page ? (
              <button type="button" className="ui-btn ui-btn-primary" data-testid="update.page" onClick={openReleasePage}>
                Open the page
              </button>
            ) : (
              <button type="button" className="ui-btn ui-btn-primary" data-testid="update.now" onClick={() => void answer('now')}>
                Update now
              </button>
            )}
          </div>
        </>
      )}

      {phase.kind === 'getting' && (
        <div className="up-body" role="status">
          <p className="up-sub">Getting {version}. Keep drawing, nothing here stops you.</p>
          <div className="up-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase.pct}>
            <span style={{ width: `${phase.pct}%` }} />
          </div>
        </div>
      )}

      {phase.kind === 'ready' && (
        <>
          <p className="up-sub" role="status">
            {phase.next === 'restart' ? `${version} is in place. Restart to start using it.` : 'The installer is open. Frameling needs to close so it can finish.'}
          </p>
          <div className="up-foot">
            <span className="ui-spacer" />
            {phase.next === 'restart' && (
              <button type="button" className="ui-btn" data-testid="update.carryOn" onClick={carryOn}>
                Later
              </button>
            )}
            <button type="button" className="ui-btn ui-btn-primary" data-testid="update.finish" onClick={finishUpdate}>
              {phase.next === 'restart' ? 'Restart now' : 'Close Frameling'}
            </button>
          </div>
        </>
      )}

      {phase.kind === 'failed' && (
        <>
          <p className="up-sub up-failed" role="status" data-testid="update.failed">
            {phase.text}
          </p>
          <div className="up-foot">
            <span className="ui-spacer" />
            <button type="button" className="ui-btn" onClick={carryOn}>
              Close
            </button>
            <button type="button" className="ui-btn ui-btn-primary" onClick={openReleasePage}>
              Open the page
            </button>
          </div>
        </>
      )}
    </section>
  );
}
