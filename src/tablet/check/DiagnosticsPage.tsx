// Preferences, Diagnostics: tools for finding out what is going wrong. For now, Quill's pen check. Other checks can be
// added below it as more sections.
import { QuillSays } from '../../ui/mascot';
import { line } from '../../ui/mascot/lines';
import { DiagnosticsSwitch } from '../../plugins/DiagnosticsSwitch';
import { BetaPanel } from '../../beta/BetaPanel';
import { UpdatePanel } from '../../update/UpdatePanel';
import { checkMemory, startPenCheck } from './state';
import '../tablet.css';

export function DiagnosticsPage() {
  const done = checkMemory.use((m) => m.done);
  return (
    <div className="tb-page" data-testid="diagnostics-page">
      <h3>Diagnostics</h3>
      <p className="ui-pref-intro">Checks that find out what is going on when something is not working, and save a small file you can send to whoever is helping.</p>
      <h4>Telling the makers</h4>
      <BetaPanel />
      <h4>New versions</h4>
      <UpdatePanel />
      <h4>Plugins</h4>
      <DiagnosticsSwitch />
      <h4>Pen and tablet</h4>
      <QuillSays anim="talk" then="idle" size={80} whenHidden={<p>Pen or tablet acting up? A quick check walks you through it, then saves a small file with what it saw.</p>}>
        <p>{line('pen.check.diagnostics')}</p>
      </QuillSays>
      <div className="tb-check-buttons">
        <button type="button" className="tb-clear" onClick={startPenCheck}>
          {done ? 'Check my pen again' : 'Check my pen with Quill'}
        </button>
      </div>
      <p className="tb-note">{done ? 'You have saved a pen report before, so Quill will not offer the check by himself any more.' : 'It asks you to hover, press, lean and so on, and saves a report file at the end. Nothing is sent anywhere.'}</p>
    </div>
  );
}
