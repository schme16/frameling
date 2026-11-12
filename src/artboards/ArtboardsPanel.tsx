// The Artboards panel: every artboard in the document, in order. Click one to open it, double-click to fill the
// window with it, drag to reorder. Below the list: the open artboard's name, export name, size and background.
import { useEffect, useRef, useState } from 'react';
import type { Doc, Id } from '../core/format';
import { store, useStore } from '../core/store';
import { renderFrame } from '../core/render';
import { ActionButton, Tip } from '../canvas/controls';
import { Section } from '../symbols/PropertiesPanel';
import { ArtboardFields } from './fields';
import { Icon } from '../ui/icons';
import { InlineName } from '../timeline/Menu';
import { activeId, artboardDoc, artboardsOf, findArtboard, hasArtboards, sizeOf } from './model';
import { arrangeAll, deleteArtboardById, duplicateArtboardById, fitAllArtboards, goToArtboard, newArtboard, renameArtboardById, reorderArtboardById, zoomToArtboard } from './ops';
import { openShotsPlayer } from './player';
import { openArtboardExport } from './exportDialog';
import { VariationBadge, VariationSection } from './VariationPanel';
import { sourceOf } from './variations';
import { paintThumbBackdrop } from '../canvas/thumbBackdrop';
import '../symbols/symbols.css';
import './artboards.css';

/** The length of an artboard, open or not. */
const sizeOfLength = (doc: Doc, id: Id): number => {
  const a = findArtboard(doc, id);
  return a?.content ? a.content.length : doc.length;
};

const DRAG_TYPE = 'application/x-frameling-artboard';

/** Frame 0 of an artboard, fitted into a small box. */
function Thumb({ doc, id, size = 40 }: { doc: Doc; id: Id; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const a = findArtboard(doc, id);
  const content = a?.content ?? doc.layers;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ad = artboardDoc(doc, id);
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.height = Math.round(size * dpr);
    const g = cv.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    const k = Math.min((size - 4) / ad.width, (size - 4) / ad.height) * dpr;
    const ox = (cv.width - ad.width * k) / 2;
    const oy = (cv.height - ad.height * k) / 2;
    g.setTransform(k, 0, 0, k, ox, oy);
    g.imageSmoothingEnabled = false;
    renderFrame(g, ad, 0, { camera: !!a?.variationOf });
    g.setTransform(1, 0, 0, 1, 0, 0);
    paintThumbBackdrop(cv, { x: ox, y: oy, w: ad.width * k, h: ad.height * k });
    g.strokeStyle = 'rgba(128,128,128,0.5)';
    g.strokeRect(ox + 0.5, oy + 0.5, ad.width * k - 1, ad.height * k - 1);
    // Only redraw when this artboard's content (or the drawings, for the open one) changes.
  }, [content, a?.content ? null : doc.drawings, size]);
  return <canvas ref={ref} className="sy-thumb" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function ArtboardsPanel() {
  const doc = useStore((s) => s.doc);
  const nested = useStore(() => store().nestedTag());
  const [renaming, setRenaming] = useState<Id | null>(null);
  const [over, setOver] = useState<number | null>(null);
  if (nested)
    return (
      <div className="cv-panel cv-options ab-panel" data-help="artboards">
        <Tip>You're painting a tile right now. Press Done above the canvas to get back to your artboards.</Tip>
      </div>
    );
  if (doc.editing?.length)
    return (
      <div className="cv-panel cv-options ab-panel" data-help="artboards">
        <Tip>You're inside a symbol. Go back out to switch artboards.</Tip>
      </div>
    );
  const list = artboardsOf(doc);
  const open = activeId(doc);
  const many = hasArtboards(doc);
  return (
    <div className="cv-panel cv-options ab-panel" data-help="artboards">
      {!many && <Tip>Artboards are separate canvases in one file: a sprite each, or a shot each. They share your palette, swatches and symbols. Add one, or drag on the empty space round the page with the Artboard tool (Shift+W).</Tip>}
      <ul className="sy-list ab-list" aria-label="Artboards">
        {list.map((a, i) => {
          const { w, h } = sizeOf(doc, a);
          const len = a.content ? a.content.length : doc.length;
          return (
            <li
              key={a.id}
              className={`sy-item ab-item${a.id === open ? ' ab-open' : ''}${over === i ? ' ab-over' : ''}${a.variationOf ? ' ab-var' : ''}`}
              draggable={renaming !== a.id}
              aria-current={a.id === open ? 'true' : undefined}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, a.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                e.preventDefault();
                setOver(i);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                const id = e.dataTransfer.getData(DRAG_TYPE);
                setOver(null);
                if (id) reorderArtboardById(id, i);
              }}
              onClick={() => a.id !== open && goToArtboard(a.id, true)}
              onDoubleClick={() => zoomToArtboard(a.id)}
              title="Click to draw on it, double-click to fill the window with it, drag to reorder. Double-click the name to rename it."
            >
              <Thumb doc={doc} id={a.id} />
              <div className="sy-item-text">
                {renaming === a.id ? (
                  <InlineName
                    value={a.name}
                    label="Artboard name"
                    onDone={(v) => {
                      setRenaming(null);
                      if (v) renameArtboardById(a.id, v);
                    }}
                  />
                ) : (
                  <span className="sy-item-name ab-name" onDoubleClick={(e) => (e.stopPropagation(), setRenaming(a.id))}>
                    {a.name}
                  </span>
                )}
                <span className="sy-item-meta">
                  {a.variationOf && <VariationBadge of={sourceOf(doc, a)?.name ?? 'its original'} />}
                  <span className="ab-size">
                    {w} x {h}
                    {len > 1 && len !== (a.variationOf ? sizeOfLength(doc, a.variationOf) : -1) ? `, ${len} frames` : ''}
                  </span>
                </span>
              </div>
              <div className="sy-item-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="sy-icon-btn ab-move" aria-label={`Move ${a.name} up`} title="Earlier in the list (and in Play all)" disabled={i === 0} onClick={() => reorderArtboardById(a.id, i - 1)}>
                  <Icon name="chevron-up" size={15} />
                </button>
                <button type="button" className="sy-icon-btn ab-move" aria-label={`Move ${a.name} down`} title="Later in the list (and in Play all)" disabled={i === list.length - 1} onClick={() => reorderArtboardById(a.id, i + 1)}>
                  <Icon name="chevron-down" size={15} />
                </button>
                <button type="button" className="sy-icon-btn" aria-label={`Duplicate ${a.name}`} title="Make a copy beside it" onClick={() => duplicateArtboardById(a.id)}>
                  <Icon name="duplicate" size={15} />
                </button>
                <button type="button" className="sy-icon-btn" aria-label={`Delete ${a.name}`} title={many ? 'Delete' : 'The only artboard stays'} disabled={!many} onClick={() => deleteArtboardById(a.id)}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="cv-row cv-wrap">
        <ActionButton onClick={() => newArtboard()} title="A new empty artboard beside the others, the same size as this one">
          New artboard
        </ActionButton>
        {many && (
          <>
            <ActionButton onClick={() => fitAllArtboards()} title="Show every artboard at once">
              Fit all
            </ActionButton>
            <ActionButton onClick={() => openShotsPlayer()} title="Play every artboard one after another, like shots in a film">
              Play all in order
            </ActionButton>
            <ActionButton onClick={() => openArtboardExport()} title="Export each artboard as its own file, or pack them all onto one sprite sheet">
              Export artboards
            </ActionButton>
            <ActionButton onClick={() => arrangeAll()} title="Line them up in a row, in list order">
              Line up
            </ActionButton>
          </>
        )}
      </div>
      <VariationSection />
      <Section title="This artboard">
        <ArtboardFields id={open} />
      </Section>
    </div>
  );
}
