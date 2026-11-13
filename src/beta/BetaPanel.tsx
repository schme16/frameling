// Preferences > Diagnostics: the beta report panel. You write what happened, you read exactly what will go, and
// then, only then, you press Send. Nothing here ever acts on its own.
import { useEffect, useState } from 'react';
import { Toggle } from '../canvas/controls';
import { store } from '../core/store';
import { getPrefs, setPrefs, usePrefs } from '../ui/prefs';
import { toast } from '../ui/toast';
import { gatherEnv } from '../tablet/check/state';
import { buildReport, docShape, reportText, type IngestReport } from './report';
import { BETA_PAGE, canSend, SEND_WORDS, sendReport } from './send';
import { recentProblems } from './problems';
import './beta.css';

export function BetaPanel() {
  const on = usePrefs((p) => p.betaReports);
  const contact = usePrefs((p) => p.betaContact);
  const [note, setNote] = useState('');
  const [where, setWhere] = useState('');
  const [preview, setPreview] = useState<IngestReport | null>(null);
  const [busy, setBusy] = useState(false);

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
      } else toast(SEND_WORDS[out.why], { kind: 'warn' });
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
        hint="Off by default. Even with it on, a report only goes when you press Send, and you can read every word of it first."
      />
      <p className="tb-note">
        New to this?{' '}
        <a href={BETA_PAGE} target="_blank" rel="noreferrer noopener">
          The testing page
        </a>{' '}
        says what is most useful to send and exactly what we see.
      </p>
      {!on ? (
        <p className="tb-note">Frameling never sends anything by itself. There is no counting of what you do, no ping when it starts, and nothing at all leaves this computer unless you ask it to.</p>
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
            It takes what Frameling and this computer are, the shape of your drawing (how big, how many frames and layers) and anything that has
            gone wrong in the page. Never your drawing, never what you called it, never where it lives, never anything you typed anywhere else.
          </p>
          <div className="tb-check-buttons">
            <button type="button" className="tb-clear" onClick={show} disabled={!note.trim()}>
              Show me what you would send
            </button>
            <button type="button" className="ui-btn" onClick={() => void send()} disabled={!note.trim() || busy || !canSend()}>
              {busy ? 'Sending...' : 'Send it'}
            </button>
          </div>
          {!canSend() && <p className="tb-note">This build can't send (it carries no key). The pen check's Save a file still works, and you can send that however you like.</p>}
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
