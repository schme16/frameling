// "Save changes?" as a Frameling dialog with Quill asking, instead of the system's grey box. Save is where the keyboard
// starts, Escape is Cancel, and a press well beside the dialog is Cancel too (never Don't save).
import { useEffect, useId } from 'react';
import { Modal } from '../ui/Modal';
import { QuillSays } from '../ui/mascot';
import { line } from '../ui/mascot/lines';
import { SAVE_ANSWERS, saveChangesQuestion } from '../shared/saveQuestion';
import { answerSave, saveAsking, setSaveAskMounted } from './saveAsk';
import './saveAsk.css';

export function SaveQuestionDialog() {
  useEffect(() => {
    setSaveAskMounted(true);
    return () => setSaveAskMounted(false);
  }, []);
  const pending = saveAsking.use((p) => p);
  if (!pending) return null;
  return <Question key={pending.id} name={pending.name} neverSaved={pending.neverSaved} onShown={pending.onShown} />;
}

function Question({ name, neverSaved, onShown }: { name: string; neverSaved: boolean; onShown?: () => void }) {
  const q = saveChangesQuestion(name, neverSaved);
  const detailId = useId();
  // Told once the dialog is really on the page, so the desktop side knows it need not ask another way.
  useEffect(() => onShown?.(), [onShown]);
  return (
    <Modal title={q.title} size="sm" hideHeader className="sq" onClose={() => answerSave('cancel')} initialFocus="[data-autofocus]" describedBy={detailId} backdropDoesNothing>
      <div className="sq-body">
        <QuillSays anim={[{ anim: 'think', hold: 2400 }, { anim: 'idle' }]} size={96} side="left" whenHidden={null} className="sq-says">
          <p>{line(neverSaved ? 'save.ask.never' : 'save.ask')}</p>
        </QuillSays>
        <h2 className="sq-q">{q.message}</h2>
        <p className="sq-detail" id={detailId}>
          {q.detail}
        </p>
      </div>
      <div className="ui-choice-foot sq-foot">
        {q.buttons.map((label, i) => (
          <button
            key={SAVE_ANSWERS[i]}
            type="button"
            className={`ui-btn${i === 0 ? ' ui-btn-primary' : ''}`}
            data-autofocus={i === 0 ? '' : undefined}
            data-testid={`save.${SAVE_ANSWERS[i]}`}
            onClick={() => answerSave(SAVE_ANSWERS[i])}
          >
            {label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
