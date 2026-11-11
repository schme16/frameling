// Shows the platform layer's questions ("Save changes?", "Replace these files?") as an in-page dialog.
import { useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { answer, asking, setAskMounted } from './ask';

export function AskDialog() {
  useEffect(() => {
    setAskMounted(true);
    return () => setAskMounted(false);
  }, []);
  const pending = asking.use((p) => p);
  if (!pending) return null;
  const { q } = pending;
  return (
    <Modal title={q.title} size="sm" className="ui-ask" onClose={() => answer(q.cancel)} initialFocus=".ui-btn-primary">
      <p className="ui-choice-q">{q.message}</p>
      {q.detail && <p>{q.detail}</p>}
      <div className="ui-choice-foot">
        <span className="ui-spacer" />
        {q.buttons.map((b) => (
          <button key={b.value} type="button" className={`ui-btn${b.primary ? ' ui-btn-primary' : ''}`} onClick={() => answer(b.value)}>
            {b.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
