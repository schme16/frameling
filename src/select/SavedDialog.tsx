// The saved selections list: save the selection under a name, and bring one back, add it, take it away, rename or delete.
import { useState } from 'react';
import { mountModal, Modal } from '../io/mount';
import { useStore } from '../core/store';
import { describeSaved, freeName, MAX_NAME } from './saved';
import { canSave, deleteSelection, loadSelection, renameSelection, saveSelection, savedList } from './saved-commands';
import { toast } from '../ui/toast';
import type { SavedSelection } from '../core/format';
import type { SelectOp } from './mask';
import { usePixelSelectionVersion } from './pixel-state';
import './saved.css';

function Row({ s }: { s: SavedSelection }) {
  const [name, setName] = useState<string | null>(null);
  const load = (how: SelectOp, done: string) => {
    const r = loadSelection(s.id, how);
    if (!r.ok) return void toast(r.why);
    toast(r.note ?? done);
  };
  return (
    <li className="sv-row">
      <div className="sv-name">
        {name === null ? (
          <>
            <strong>{s.name}</strong>
            <span className="io-muted">{describeSaved(s)}</span>
          </>
        ) : (
          <input
            className="sv-input"
            value={name}
            maxLength={MAX_NAME}
            aria-label="New name"
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              renameSelection(s.id, name);
              setName(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setName(null);
              }
            }}
          />
        )}
      </div>
      <div className="sv-actions">
        <button type="button" className="io-btn io-primary" onClick={() => load('replace', `Brought back "${s.name}".`)}>
          Bring back
        </button>
        <button type="button" className="io-btn" onClick={() => load('add', `Added "${s.name}" to the selection.`)} title="Add it to what is selected now">
          Add
        </button>
        <button type="button" className="io-btn" onClick={() => load('subtract', `Took "${s.name}" out of the selection.`)} title="Take it out of what is selected now">
          Take away
        </button>
        <button type="button" className="io-btn" onClick={() => setName(s.name)}>
          Rename
        </button>
        <button type="button" className="io-btn" onClick={() => deleteSelection(s.id)} aria-label={`Delete ${s.name}`}>
          Delete
        </button>
      </div>
    </li>
  );
}

function SavedDialog({ close, focusName }: { close: () => void; focusName: boolean }) {
  const list = useStore((st) => st.doc.selections) ?? savedList();
  usePixelSelectionVersion();
  const st = useStore((s) => s);
  const can = canSave(st);
  const [name, setName] = useState('');
  const save = () => {
    if (saveSelection(name)) setName('');
  };
  return (
    <Modal title="Saved selections" onClose={close} wide>
      <div className="io-body sv">
        <div className="sv-save">
          <input
            className="sv-input"
            value={name}
            maxLength={MAX_NAME}
            placeholder={freeName(list.map((x) => x.name))}
            aria-label="Name for the selection"
            data-autofocus={focusName ? true : undefined}
            disabled={!can}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && can && save()}
          />
          <button type="button" className="io-btn io-primary" disabled={!can} onClick={save} title={can ? undefined : 'Select something first: pixels with the Select tool, or shapes on a vector layer.'}>
            Save what is selected
          </button>
        </div>
        {!can && <p className="io-muted">Select something first (pixels with the Select tool, or shapes on a vector layer) and you can save it here.</p>}
        {list.length ? (
          <ul className="sv-list">
            {list.map((s) => (
              <Row key={s.id} s={s} />
            ))}
          </ul>
        ) : (
          <p className="io-muted">Nothing saved yet. Select something, give it a name and press Save. It comes back with the file.</p>
        )}
      </div>
      <div className="io-foot">
        <button type="button" className="io-btn io-primary" onClick={close} data-autofocus={focusName ? undefined : true}>
          Done
        </button>
      </div>
    </Modal>
  );
}

export function openSavedDialog(focusName: boolean): void {
  mountModal((close) => <SavedDialog close={close} focusName={focusName} />);
}
