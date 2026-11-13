// Help > About Frameling: the version, and Quill saying hello.
import { line } from './mascot/lines';
import { Logo } from './icons';
import { Quill, useQuillShown } from './mascot';
import { Modal } from './Modal';
import { closeAbout, openHelp, overlays } from './overlays';
import { BETA_PAGE, canSend } from '../beta/send';

export function AboutDialog() {
  const open = overlays.use((o) => o.about);
  if (!open) return null;
  return <About />;
}

function About() {
  const quill = useQuillShown();
  const v = typeof window !== 'undefined' ? window.frameling?.versions : undefined;
  return (
    <Modal title="About Frameling" size="sm" className="ui-about" onClose={closeAbout} initialFocus=".ui-about-ok">
      <div className="ui-about-body">
        {quill ? <Quill anim={[{ anim: 'wave', hold: 2480 }, { anim: 'idle' }]} size={96} /> : <Logo size={64} />}
        <h2>Frameling{v?.app ? ` ${v.app}` : ''}</h2>
        <p>A friendly tool for drawing and animating, vector and pixel alike. Made with care, and a little bit of glitter.</p>
        {quill && <p className="ui-about-quill">{line('about.quill')}</p>}
        {v?.electron && (
          <p className="ui-about-small">
            Electron {v.electron}, Chrome {v.chrome}
          </p>
        )}
        {/* Only a beta build can send reports, so only a beta build points at the testing page. */}
        {canSend() && (
          <p className="ui-about-small">
            This is a beta build.{' '}
            <a href={BETA_PAGE} target="_blank" rel="noreferrer noopener">
              The testing page
            </a>{' '}
            says how to tell us what happened.
          </p>
        )}
      </div>
      <div className="ui-about-foot">
        <button
          type="button"
          className="ui-btn ui-btn-quiet"
          onClick={() => {
            closeAbout();
            openHelp('meet-quill');
          }}
        >
          Meet Quill
        </button>
        <span className="ui-status-spacer" />
        <button type="button" className="ui-btn ui-btn-primary ui-about-ok" onClick={closeAbout}>
          Lovely
        </button>
      </div>
    </Modal>
  );
}
