// The Library: every symbol in the document. Drag one onto the canvas to place it, double-click its name to rename.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Doc, Id } from '../core/format';
import { getCommand } from '../core/registry';
import { store, useStore } from '../core/store';
import { newInstance, poseInstance, symbolContent, symbolUsage } from '../core/symbols';
import { drawInstance } from '../core/render';
import { symbolBounds } from '../canvas/geometry';
import { ActionButton, Tip } from '../canvas/controls';
import { Icon } from '../ui/icons';
import { InlineName } from '../timeline/Menu';
import { toast } from '../ui/toast';
import { deleteUnused, duplicateSymbolById, editSymbol, placeInstance, renameSymbol, wouldNestInItself } from './ops';
import './symbols.css';

/** The drag type a library row carries, read by the canvas when it's dropped there. */
export const SYMBOL_DRAG_TYPE = 'application/x-frameling-symbol';

/** Draws one frame of a symbol (frame 0 unless asked), fitted into a small canvas. Every frame uses the same fit. */
export function SymbolThumb({ doc, id, size = 44, frame = 0, className = 'sy-thumb' }: { doc: Doc; id: Id; size?: number; frame?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const c = symbolContent(doc, id);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !c) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.height = Math.round(size * dpr);
    const g = cv.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    const b = symbolBounds(doc, id);
    if (!b || !b.w || !b.h) return;
    const pad = 3;
    const k = Math.min((size - pad * 2) / b.w, (size - pad * 2) / b.h);
    g.setTransform(k * dpr, 0, 0, k * dpr, (size / 2 - (b.x + b.w / 2) * k) * dpr, (size / 2 - (b.y + b.h / 2) * k) * dpr);
    const inst = { ...newInstance(id, c.def.origin), play: 'single' as const };
    drawInstance(g, poseInstance(doc, inst, frame), { doc, frame });
  });
  return <canvas ref={ref} className={className} style={{ width: size, height: size }} aria-hidden="true" />;
}

export function LibraryPanel() {
  const doc = useStore((s) => s.doc);
  const [renaming, setRenaming] = useState<Id | null>(null);
  const usage = useMemo(() => symbolUsage(doc), [doc]);
  const symbols = Object.values(doc.symbols ?? {}).sort((a, b) => a.name.localeCompare(b.name));
  const unused = symbols.filter((s) => !usage.get(s.id) && !doc.editing?.some((f) => f.symbolId === s.id)).length;
  const make = () => void getCommand('symbols.make')?.run();
  const nested = useStore(() => store().nestedTag());

  if (nested)
    return (
      <div className="cv-options sy-library" data-help="symbols">
        <Tip>You're painting a tile right now. Press Done above the canvas to get back to your symbols.</Tip>
      </div>
    );

  return (
    <div className="cv-options sy-library" data-help="symbols">
      {!symbols.length ? (
        <>
          <Tip>
            No symbols yet. A symbol is a drawing you can reuse: place it many times, give it its own little animation, and make it glide between keys with in-betweens.
          </Tip>
          <Tip>Select something you drew and press F8 (or the button below) to make one.</Tip>
        </>
      ) : (
        <ul className="sy-list" aria-label="Symbols">
          {symbols.map((s) => {
            const n = usage.get(s.id) ?? 0;
            const c = symbolContent(doc, s.id);
            const self = wouldNestInItself(doc, s.id);
            return (
              <li
                key={s.id}
                className="sy-item"
                draggable={!self}
                title={self ? "You're inside this symbol, so it can't be placed here." : 'Drag onto the canvas to place it'}
                onDragStart={(e) => {
                  e.dataTransfer.setData(SYMBOL_DRAG_TYPE, s.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <SymbolThumb doc={doc} id={s.id} />
                <div className="sy-item-text">
                  {renaming === s.id ? (
                    <InlineName
                      value={s.name}
                      label="Symbol name"
                      onDone={(v) => {
                        setRenaming(null);
                        if (v) renameSymbol(s.id, v);
                      }}
                    />
                  ) : (
                    <button type="button" className="sy-item-name" onDoubleClick={() => setRenaming(s.id)} onClick={() => setRenaming(s.id)} title="Rename">
                      {s.name}
                    </button>
                  )}
                  <span className="sy-item-meta">
                    {c && c.length > 1 ? `${c.length} frames, ` : ''}
                    {n ? `used ${n === 1 ? 'once' : `${n} times`}` : 'not used'}
                  </span>
                </div>
                <div className="sy-item-actions">
                  <button type="button" className="sy-icon-btn" aria-label={`Place ${s.name} on the canvas`} title="Place on the canvas" disabled={self} onClick={() => placeInstance(s.id)}>
                    <Icon name="plus" size={15} />
                  </button>
                  <button type="button" className="sy-icon-btn" aria-label={`Draw inside ${s.name}`} title="Draw inside it" onClick={() => editSymbol(s.id)}>
                    <Icon name="pencil" size={15} />
                  </button>
                  <button type="button" className="sy-icon-btn" aria-label={`Duplicate ${s.name}`} title="Make a copy to change separately" onClick={() => duplicateSymbolById(s.id)}>
                    <Icon name="duplicate" size={15} />
                  </button>
                  <button
                    type="button"
                    className="sy-icon-btn"
                    aria-label={`Delete ${s.name}`}
                    title={n ? 'Still in use. Delete its copies on the canvas first.' : 'Delete'}
                    disabled={n > 0}
                    onClick={() => deleteUnused(s.id) && toast(`Deleted "${s.name}".`, { action: { label: 'Undo', run: () => void getCommand('edit.undo')?.run() } })}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="cv-row cv-wrap">
        <ActionButton onClick={make} title="Make the selection into a reusable symbol (F8)">
          Make a symbol
        </ActionButton>
        {unused > 0 && (
          <ActionButton onClick={() => void getCommand('symbols.deleteUnused')?.run()} title="Remove symbols nothing uses">
            Delete {unused} unused
          </ActionButton>
        )}
      </div>
    </div>
  );
}
