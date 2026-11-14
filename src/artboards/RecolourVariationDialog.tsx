// "Recolour this variation": every colour the open variation shows, each with a box to change it to. All the changes
// land in one undo step, across every frame, and only in the variation (see recolourOpenVariation).
import { useMemo, useState } from 'react';
import { produce } from 'immer';
import type { Doc } from '../core/format';
import { store } from '../core/store';
import { mountModal, Modal } from '../io/mount';
import { Preview } from '../tools/RecolourDialog';
import { noteColorUsed } from '../tools/recent';
import { drawingColours, rgbKey } from './paletteOverride';
import { isEditingVariation, paletteScope, recolourOpenVariation, sourceOf } from './variations';
import { activeId, findArtboard } from './model';

/** The colours the open variation shows in its drawings, in the order they are met. */
export function variationColours(doc: Doc, limit = 40): string[] {
  const scope = paletteScope(doc);
  const seen = new Map<number, string>();
  for (const [id, d] of Object.entries(doc.drawings)) if (scope(id)) drawingColours(d, seen);
  return [...seen.values()].slice(0, limit);
}

function RecolourVariationDialog({ close }: { close: () => void }) {
  const { doc, ui } = store().get();
  const colours = useMemo(() => variationColours(doc), [doc]);
  const [to, setTo] = useState<Record<string, string>>({});
  const open = findArtboard(doc, activeId(doc));
  const root = open && sourceOf(doc, open);
  const swaps = colours.filter((c) => to[c] && rgbKey(to[c]) !== rgbKey(c)).map((c) => ({ from: c, to: to[c] }));
  const after = useMemo(() => (swaps.length ? produce(doc, (d) => void recolourOpenVariation(d as Doc, swaps)) : doc), [doc, JSON.stringify(swaps)]);

  const apply = () => {
    if (swaps.length) {
      store().update('Recolour this variation', (d) => void recolourOpenVariation(d as Doc, swaps));
      for (const s of swaps) noteColorUsed(s.to);
    }
    close();
  };

  return (
    <Modal title="Recolour this variation" onClose={close} wide>
      <div className="io-body cv-recolour">
        <p className="io-muted">
          Change colours on every frame of this variation. {root ? `The original (${root.name}) and the other variations` : 'The original and the other variations'} keep theirs. Each colour you change is one line in the variation's Differences, with a Reset.
        </p>
        <div className="cv-field-head">
          <span className="cv-field-label">Pick a new colour for each one you want to change</span>
        </div>
        <ul className="ab-recolour-list" aria-label="Colours in this variation">
          {colours.map((c) => {
            const on = !!to[c] && rgbKey(to[c]) !== rgbKey(c);
            return (
              <li key={c} className="ab-recolour-row" data-changed={on}>
                <span className="ab-recolour-chip" style={{ background: c }} aria-hidden="true" />
                <span className="ab-recolour-code">{c}</span>
                <span aria-hidden="true">becomes</span>
                <input type="color" value={to[c] ?? c} onChange={(e) => setTo({ ...to, [c]: e.target.value })} aria-label={`New colour for ${c}`} />
                <button type="button" className="io-btn" disabled={!on} onClick={() => setTo({ ...to, [c]: c })} aria-label={`Keep ${c} as it is`}>
                  Keep
                </button>
              </li>
            );
          })}
          {!colours.length && <li className="io-muted">This variation has no colours yet.</li>}
        </ul>
        <div className="cv-recolour-previews">
          <Preview doc={doc} frame={ui.frame} label="Now" />
          <Preview doc={after} frame={ui.frame} label="After" />
        </div>
        <p className="io-muted" aria-live="polite">
          {swaps.length ? `Changes ${swaps.length} colour${swaps.length === 1 ? '' : 's'} on every frame. One undo puts it all back.` : 'Pick a new colour for at least one of them.'}
        </p>
      </div>
      <div className="io-foot">
        <button type="button" className="io-btn" onClick={close}>
          Cancel
        </button>
        <button type="button" className="io-btn io-primary" onClick={apply} disabled={!swaps.length}>
          Recolour
        </button>
      </div>
    </Modal>
  );
}

/** Opens the dialog for the open variation (says so in a note when the open artboard is not one). */
export function openRecolourVariation(): void {
  if (!isEditingVariation(store().get().doc)) return;
  mountModal((close) => <RecolourVariationDialog close={close} />);
}
