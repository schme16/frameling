// The list of what an Aseprite import had to approximate, in a plain dialog.
import { Modal, mountModal } from '../io/mount';
import './aseprite.css';

function WhatChanged({ title, notes, close }: { title: string; notes: string[]; close: () => void }) {
  return (
    <Modal title="What changed in the import" onClose={close} wide>
      <div className="io-body">
        <p className="io-muted">{title}</p>
        <p className="io-muted">Everything else came across as it was in Aseprite. The original details are kept in the drawing's notes.</p>
        <ul className="ase-notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
      <div className="io-foot">
        <button type="button" className="io-btn io-primary" data-autofocus="" onClick={close}>
          Got it
        </button>
      </div>
    </Modal>
  );
}

export function showWhatChanged(title: string, notes: string[]): void {
  mountModal((close) => <WhatChanged title={title} notes={notes} close={close} />);
}
