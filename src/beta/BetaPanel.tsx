// Preferences > Diagnostics: the beta report panel. You write what happened, you read exactly what will go, and
// then, only then, you press Send. Nothing here ever acts on its own.
import { useEffect, useState } from 'react';
import { Toggle } from '../canvas/controls';
import { store } from '../core/store';
import { getPrefs, setPrefs, usePrefs } from '../ui/prefs';
import { toast } from '../ui/toast';
import { gatherEnv } from '../tablet/check/state';
import { buildReport, docShape, reportText, type IngestReport } from './report';
import { BETA_PAGE, canSend, checkBoard, lastSendFailure, sayFailure, sendReport } from './send';
import { recentProblems } from './problems';
import './beta.css';

export function BetaPanel() {
  const on = usePrefs((p) => p.betaReports);
  const contact = usePrefs((p) => p.betaContact);
  const [note, setNote] = useState('');
  const [where, setWhere] = useState('');
  const [preview, setPreview] = useState<IngestReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  // What the last check or send said, kept on the page so it can be read twice and quoted.
  const [said, setSaid] = useState<{ good: boolean; text: string } | null>(null);

  // The preview is thrown away whenever the words change, so what you read is never out of date.
  useEffect(() => setPreview(null), [note, where, contact]);

  const build = async (): Promise<IngestReport> => {
    const s = store().get();
    return buildReport({
      note,
      contact: getPrefs().betaContact,
      where,
      env: (await gatherEnv()) as unknown as Record<string, unknown>,
      shape: docShape(s.doc),
      problems: recentProblems(),
    });
  };

  const check = async () => {
    setChecking(true);
    try {
      const r = await checkBoard();
      if (r.ok) setSaid({ good: true, text: 'The board is there and it accepts this copy of Frameling. If a report still fails, it is something else.' });
      else setSaid({ good: false, text: sayFailure(r) });
    } finally {
      setChecking(false);
    }
  };

  const show = () => void build().then(setPreview);

  const send = async () => {
    setBusy(true);
    try {
      const r = preview ?? (await build());
      const out = await sendReport(r);
      if (out.ok) {
        toast('Sent. Thank you, that really does help.', { kind: 'success', quill: 'cheer' });
        setNote('');
        setWhere('');
        setPreview(null);
      } else {
        setSaid({ good: false, text: sayFailure(out) });
        toast(sayFailure(out), { kind: 'warn' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bt-beta" data-help="beta-reports">
      <Toggle
        label="Let me send reports to the makers"
        checked={on}
        onChange={(v) => setPrefs({ betaReports: v })}
        hint="On in a beta build, off in an ordinary one. With it on, a crash is reported by itself, and anything you write here goes when you press Send."
      />
      <p className="tb-note">
        New to this?{' '}
        <a href={BETA_PAGE} target="_blank" rel="noreferrer noopener">
          The testing page
        </a>{' '}
        says what is most useful to send and exactly what we see.
      </p>
      {!on ? (
        <p className="tb-note">Nothing is being sent. No crash reports, no counting of what you do, no ping when it starts, and nothing at all leaves this computer.</p>
      ) : (
        <>
          <label className="bt-field">
            <span>What happened?</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="It froze when I pressed Export, with the timeline open." />
          </label>
          <label className="bt-field">
            <span>Where were you? (optional)</span>
            <input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Export" />
          </label>
          <label className="bt-field">
            <span>How can we reach you? (optional)</span>
            <input value={contact} onChange={(e) => setPrefs({ betaContact: e.target.value })} placeholder="Left empty is fine" />
          </label>
          <p className="tb-note">
            <b>This is a beta build, so a crash tells us by itself</b>, up to a few times a run. Nothing else is ever sent on its own: there is no
            counting of what you do and no ping when Frameling starts. Turn the switch off and even crashes stay here.
          </p>
          <p className="tb-note">
            Either way it takes what Frameling and this computer are, the shape of your drawing (how big, how many frames and layers) and what went
            wrong. Never your drawing, never what you called it, never where it lives, never anything you typed anywhere else.
          </p>
          <div className="tb-check-buttons">
            <button type="button" className="tb-clear" onClick={show} disabled={!note.trim()}>
              Show me what you would send
            </button>
            <button type="button" className="ui-btn" onClick={() => void send()} disabled={!note.trim() || busy || !canSend()}>
              {busy ? 'Sending...' : 'Send it'}
            </button>
            <button type="button" className="tb-clear" onClick={() => void check()} disabled={checking || !canSend()}>
              {checking ? 'Checking...' : 'Check the connection'}
            </button>
          </div>
          {(() => {
            const failed = said ?? (lastSendFailure() ? { good: false, text: `The last report didn't go. ${sayFailure(lastSendFailure()!)}` } : null);
            return failed && <p className="tb-note" role="status" data-good={failed.good}>{failed.text}</p>;
          })()}
          {!canSend() && <p className="tb-note">This build can't send (it was made without a way to send, so it isn't your internet). The pen check's Save a file still works, and you can send that however you like.</p>}
          {preview && (
            <>
              <p className="tb-note">This, word for word, is what goes. Nothing else.</p>
              <pre className="bt-preview">{reportText(preview)}</pre>
            </>
          )}
        </>
      )}
    </div>
  );
}
