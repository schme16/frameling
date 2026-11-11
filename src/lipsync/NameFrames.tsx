// "Name a symbol's frames": gives each frame of a symbol a name (A, E, O...), which is what makes it a mouth.
import { useState } from 'react';
import { store } from '../core/store';
import { symbolContent } from '../core/symbols';
import { selectedInstances } from '../symbols/ops';
import { mountModal, Modal } from '../io/mount';
import { toast } from '../ui/toast';
import { CHART } from './chart';
import './lipsync.css';

/** The labels to save for a symbol: trailing blanks dropped, nothing at all when every name is empty. */
export function cleanLabels(labels: string[]): string[] | undefined {
  const out = labels.map((l) => l.trim());
  while (out.length && !out[out.length - 1]) out.pop();
  return out.length ? out : undefined;
}

function Dialog({ close }: { close: () => void }) {
  const doc = store().get().doc;
  const ids = Object.keys(doc.symbols ?? {});
  const first = selectedInstances()[0]?.symbolId ?? ids[0];
  const [id, setId] = useState(first);
  const length = symbolContent(doc, id)?.length ?? 1;
  const [names, setNames] = useState<string[]>(() => Array.from({ length }, (_, i) => doc.symbols?.[first]?.frameLabels?.[i] ?? ''));
  const pickSymbol = (to: string) => {
    setId(to);
    const n = symbolContent(doc, to)?.length ?? 1;
    setNames(Array.from({ length: n }, (_, i) => doc.symbols?.[to]?.frameLabels?.[i] ?? ''));
  };
  const save = () => {
    const labels = cleanLabels(names);
    store().update('Name symbol frames', (d) => {
      const def = d.symbols?.[id];
      if (!def) return;
      if (labels) def.frameLabels = labels;
      else delete def.frameLabels;
    });
    close();
    toast(labels ? 'Frames named. If this symbol is on a layer, Auto lip sync can use it now.' : 'Frame names cleared.', { kind: 'success' });
  };
  return (
    <Modal title="Name the frames of a symbol" onClose={close}>
      <div className="io-body ls-dialog">
        <label className="ls-field">
          <span>Symbol</span>
          <select value={id} onChange={(e) => pickSymbol(e.target.value)}>
            {ids.map((s) => (
              <option key={s} value={s}>
                {doc.symbols![s].name}
              </option>
            ))}
          </select>
        </label>
        <p className="io-muted">Give each frame the name of the mouth it shows: {CHART.map((m) => m.label).join(', ')}. Capital letters and spaces don't matter.</p>
        <div className="ls-names">
          {names.map((n, i) => (
            <label key={i} className="ls-name">
              <span>{i + 1}</span>
              <input value={n} placeholder={CHART[i]?.label ?? ''} onChange={(e) => setNames(names.map((x, k) => (k === i ? e.target.value : x)))} onKeyDown={(e) => e.stopPropagation()} aria-label={`Name of frame ${i + 1}`} />
            </label>
          ))}
        </div>
      </div>
      <div className="io-foot">
        <button type="button" className="io-btn" onClick={() => setNames(names.map((_, i) => CHART[i]?.label ?? ''))}>
          Use the chart names
        </button>
        <button type="button" className="io-btn" onClick={close}>
          Cancel
        </button>
        <button type="button" className="io-btn io-primary" onClick={save}>
          Save names
        </button>
      </div>
    </Modal>
  );
}

export function openNameFrames(): void {
  const doc = store().get().doc;
  if (!Object.keys(doc.symbols ?? {}).length) {
    toast('There are no symbols yet. Draw a mouth, select it and press F8 to make a symbol, give it one frame per mouth, then name the frames.', { kind: 'warn' });
    return;
  }
  mountModal((close) => <Dialog close={close} />);
}
