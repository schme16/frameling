// The dazed Quill after a crash: what happened, and (in a build that can send) the choice to send the notes or not.
import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/icons';
import { openHelp } from '../ui/overlays';
import { QuillSays } from '../ui/mascot';
import { line, lines } from '../ui/mascot/lines';
import { setChoice } from '../core/choices';
import { CRASH_CHOICE, crashDialog } from './crashAsk';
import { MachineBox } from './MachineBox';
import type { MachineFacts } from './machine';
import { reportText } from './report';
import { sayFailure, sendReport } from './send';
import './beta.css';

type Phase = { kind: 'asking' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'failed'; text: string };

export function CrashOffer() {
  const d = crashDialog.use((v) => v);
  if (!d) return null;
  return <Offer key={d.notes.startedAt} dialog={d} />;
}

function Offer({ dialog }: { dialog: NonNullable<ReturnType<typeof crashDialog.get>> }) {
  const { mode, report } = dialog;
  const [phase, setPhase] = useState<Phase>({ kind: 'asking' });
  const [remember, setRemember] = useState(true);
  const close = () => crashDialog.set(null);
  const no = () => {
    if (remember) setChoice(CRASH_CHOICE, 'no');
    close();
  };
  const send = async () => {
    setPhase({ kind: 'sending' });
    const out = await sendReport(report);
    setPhase(out.ok ? { kind: 'sent' } : { kind: 'failed', text: sayFailure(out) });
  };
  const sent = phase.kind === 'sent';
  const words = sent ? [line('crash.sent')] : lines(mode === 'ask' ? 'crash.offer' : 'crash.told');
  return (
    <Modal title="Frameling fell over" size="sm" className="bt-crash" onClose={close} initialFocus="[data-autofocus]">
      <div className="bt-crash-body">
        <QuillSays anim={sent ? [{ anim: 'cheer' }, { anim: 'idle' }] : 'dazed'} size={96} side="top" className="bt-crash-says">
          {words.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </QuillSays>
        {mode === 'ask' && !sent && (
          <details className="bt-crash-read">
            <summary>Read what would go</summary>
            <p className="tb-note">This, word for word, is what goes. Nothing else.</p>
            {report.data.machine ? <MachineBox machine={report.data.machine as MachineFacts} /> : null}
            <pre className="bt-preview" data-testid="crash.report">{reportText(report)}</pre>
          </details>
        )}
        {phase.kind === 'failed' && (
          <p className="tb-note bt-crash-failed" role="status" data-testid="crash.failed">
            {phase.text}
          </p>
        )}
        {mode === 'ask' && !sent && (
          <label className="ui-choice-remember">
            <input type="checkbox" data-testid="crash.remember" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            If I say no thanks, don't offer again after a crash. You can change it any time in Preferences, Behaviour.
          </label>
        )}
      </div>
      <div className="ui-choice-foot bt-crash-foot">
        <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp('crash-notes')}>
          <Icon name="help" size={14} /> Learn more
        </button>
        <span className="ui-spacer" />
        {mode === 'ask' && !sent ? (
          <>
            <button type="button" className="ui-btn" data-testid="crash.no" onClick={no} disabled={phase.kind === 'sending'}>
              No thanks
            </button>
            <button type="button" className="ui-btn ui-btn-primary" data-autofocus data-testid="crash.send" onClick={() => void send()} disabled={phase.kind === 'sending'}>
              {phase.kind === 'sending' ? 'Sending...' : phase.kind === 'failed' ? 'Try again' : 'Send the notes'}
            </button>
          </>
        ) : (
          <button type="button" className="ui-btn ui-btn-primary" data-autofocus data-testid="crash.ok" onClick={close}>
            {sent ? 'Close' : 'OK'}
          </button>
        )}
      </div>
    </Modal>
  );
}
