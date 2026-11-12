import { line } from '../ui/mascot/lines';
import { useEffect, useState } from 'react';
import { QuillEmpty } from '../ui/mascot';
import { desktop } from './desktop';
import { loadBytes } from './document';
import { Modal, mountModal } from './mount';
import type { KeptAutosave } from '../preload/api';

function when(t: number): string {
  const mins = Math.round((Date.now() - t) / 60000);
  const clock = new Date(t).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  if (mins < 2) return `just now (${clock})`;
  if (mins < 60) return `${mins} minutes ago (${clock})`;
  return clock;
}

function RecoverDialog({ close }: { close: () => void }) {
  const [items, setItems] = useState<KeptAutosave[] | null>(null);
  useEffect(() => {
    void (desktop()?.autosave.listKept() ?? Promise.resolve([])).then(setItems).catch(() => setItems([]));
  }, []);

  const open = async (k: KeptAutosave) => {
    const r = await desktop()?.autosave.readKept(k.id);
    if (!r) return;
    // It comes back as unsaved work with no file, so Save asks where to put it.
    if (await loadBytes(r.bytes, null, { dirty: true })) close();
  };
  const drop = async (k: KeptAutosave) => {
    await desktop()?.autosave.removeKept(k.id);
    setItems((x) => (x ?? []).filter((y) => y.id !== k.id));
  };

  return (
    <Modal title="Recover unsaved work" onClose={close}>
      <div className="io-body">
        <p className="io-muted">Drawings you chose not to save are kept here for 7 days, in case you change your mind.</p>
        {items === null ? null : items.length === 0 ? (
          <QuillEmpty anim="idle" className="io-empty">{line('empty.recover')}</QuillEmpty>
        ) : (
          <ul className="io-recover">
            {items.map((k, i) => (
              <li key={k.id}>
                {k.thumb ? <img src={k.thumb} alt="" width={64} height={64} /> : <span className="io-thumb-none" aria-hidden="true" />}
                <span className="io-recover-text">
                  <b>{k.name || 'Untitled'}</b>
                  <small>Last changed {when(k.savedAt)}</small>
                  <small>Kept until {new Date(k.keptAt + 7 * 24 * 3600 * 1000).toLocaleDateString()}</small>
                </span>
                <button type="button" className="io-btn io-primary" data-testid={`recover.open.${k.id}`} data-autofocus={i === 0 ? '' : undefined} onClick={() => void open(k)}>
                  Open
                </button>
                <button type="button" className="io-btn" data-testid={`recover.delete.${k.id}`} aria-label={`Delete the kept copy of ${k.name}`} onClick={() => void drop(k)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="io-foot">
        <button type="button" className="io-btn io-primary" data-testid="recover.close" onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  );
}

export function openRecoverDialog(): void {
  mountModal((close) => <RecoverDialog close={close} />);
}
