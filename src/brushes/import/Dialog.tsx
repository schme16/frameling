// The look at what a brush file holds, before any of it lands in the library: each brush with its picture, a tick to keep
// it or not, and in plain words what did not come across. Choosing is yours; nothing is added until you say so.
import { useMemo, useState } from 'react';
import { displayFile } from '../../core/streamSafe';
import { Modal, mountModal } from '../../io/mount';
import { PixelStroke, PixelTip } from '../PixelSample';
import '../picker.css';
import { MAX_GROUP } from '../library';
import type { ImportedBrush, ImportResult } from './index';
import { FORMAT_NAMES, plural } from './types';
import './import.css';

type Found = Extract<ImportResult, { ok: true }>;

/** How one brush fared, in a word. */
export const verdict = (b: ImportedBrush): 'whole' | 'changed' | 'lost' => (b.dropped.length ? 'lost' : b.changed.length ? 'changed' : 'whole');

const WORDS = { whole: 'Came in whole', changed: 'Came in, slightly changed', lost: 'Came in, without some settings' } as const;

function Row({ b, on, flip }: { b: ImportedBrush; on: boolean; flip: () => void }) {
  const v = verdict(b);
  const spec = useMemo(() => ({ kind: 'dab' as const, dab: b.dab }), [b]);
  const notes = [...b.dropped.map((n) => `Left out: ${n}`), ...b.changed.map((n) => `Changed: ${n}`)];
  return (
    <li className={`bi-row bi-${v}`}>
      <label className="bi-pick">
        <input type="checkbox" checked={on} onChange={flip} aria-label={`Add ${b.name}`} />
        <span className="bi-tip" aria-hidden="true">
          <PixelTip spec={spec} w={44} h={44} />
        </span>
        <span className="bi-name">
          <b>{b.name}</b>
          <small className="bi-verdict">{WORDS[v]}</small>
        </span>
        <span className="bi-stroke" aria-hidden="true">
          <PixelStroke spec={spec} h={34} />
        </span>
      </label>
      {notes.length > 0 && (
        <ul className="bi-notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Dialog({ found, shown, add, close }: { found: Found; shown: string; add: (picked: ImportedBrush[], group: string) => void; close: () => void }) {
  const [on, setOn] = useState<boolean[]>(() => found.brushes.map(() => true));
  const [group, setGroup] = useState(found.setName.slice(0, MAX_GROUP));
  const count = on.filter(Boolean).length;
  const whole = found.brushes.filter((b) => verdict(b) === 'whole').length;
  const app = FORMAT_NAMES[found.format].app;
  const total = found.brushes.length;
  return (
    <Modal title={total === 1 ? 'Add this brush?' : `Add brushes from "${shown.slice(0, 40)}"?`} onClose={close} wide>
      <div className="io-body bi-body">
        <p className="io-muted">
          {plural(total, 'brush', 'brushes')} from {app}. {total > 1 ? (whole === total ? 'Every one came in whole.' : `${whole} came in whole; the rest are missing something, shown under each.`) : ''}
        </p>
        {found.notes.map((n) => (
          <p key={n} className="io-muted">
            {n}
          </p>
        ))}
        {total > 1 && (
          <div className="bi-all">
            <button type="button" className="io-btn" onClick={() => setOn(on.map(() => true))}>
              Tick all
            </button>
            <button type="button" className="io-btn" onClick={() => setOn(on.map(() => false))}>
              Tick none
            </button>
            <button type="button" className="io-btn" onClick={() => setOn(found.brushes.map((b) => verdict(b) === 'whole'))} disabled={!whole || whole === total}>
              Only the whole ones
            </button>
          </div>
        )}
        <ul className="bi-list">
          {found.brushes.map((b, i) => (
            <Row key={i} b={b} on={on[i]} flip={() => setOn(on.map((x, j) => (j === i ? !x : x)))} />
          ))}
        </ul>
        <label className="bi-group">
          <span>Put them in the group</span>
          <input type="text" value={group} maxLength={MAX_GROUP} onChange={(e) => setGroup(e.target.value)} />
        </label>
      </div>
      <div className="io-foot">
        <button type="button" className="io-btn" onClick={close}>
          Cancel
        </button>
        <button
          type="button"
          className="io-btn io-primary"
          data-autofocus=""
          disabled={!count}
          onClick={() => {
            add(found.brushes.filter((_, i) => on[i]), group);
            close();
          }}
        >
          {count === 0 ? 'Add' : `Add ${plural(count, 'brush', 'brushes')}`}
        </button>
      </div>
    </Modal>
  );
}

/** Shows what was found and calls `add` with the brushes you kept. */
export function showBrushImport(found: Found, source: string, add: (picked: ImportedBrush[], group: string) => void): void {
  mountModal((close) => <Dialog found={found} shown={displayFile(source)} add={add} close={close} />);
}
