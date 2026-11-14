// The Artboards panel: every artboard in the document, in order. Click one to open it, double-click to fill the
// window with it, drag to reorder. Below the list: the open artboard's name, export name, size and background.
import { useEffect, useRef, useState } from 'react';
import type { Artboard, Doc, Id } from '../core/format';
import { store, useStore } from '../core/store';
import { renderFrame } from '../core/render';
import { Tip } from '../canvas/controls';
import { Section } from '../symbols/PropertiesPanel';
import { ArtboardFields } from './fields';
import { Icon } from '../ui/icons';
import { ContextMenu, type MenuItem } from '../timeline/Menu';
import { PieceActions, PieceButton, PieceRow, PieceTools, dropIndex, pieceMenuBasics, useRowDrag } from '../timeline/PieceRow';
import { runCmd, tip } from '../timeline/cmd';
import { CLEAN_ROW_H } from '../timeline/layout';
import { activeId, artboardDoc, artboardsOf, findArtboard, hasArtboards, sizeOf } from './model';
import { arrangeAll, deleteArtboardById, duplicateArtboardById, fitAllArtboards, goToArtboard, newArtboard, renameArtboardById, reorderArtboardById, zoomToArtboard } from './ops';
import { openShotsPlayer } from './player';
import { openArtboardExport } from './exportDialog';
import { VariationSection } from './VariationPanel';
import { sourceOf } from './variations';
import { mixedRates, rateOf } from './rates';
import { paintThumbBackdrop } from '../canvas/thumbBackdrop';
import { artPixelOf, artSizeOf } from '../pixel/units';
import '../symbols/symbols.css';
import './artboards.css';
import { stackLook } from '../core/sharedLayers';

/** The length of an artboard, open or not. */
const sizeOfLength = (doc: Doc, id: Id): number => {
  const a = findArtboard(doc, id);
  return a?.content ? a.content.length : doc.length;
};

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
  }, [content, a?.content ? null : doc.drawings, size, doc.sharedLayers ? stackLook(doc.layers) : null, doc.folders]);
  return <canvas ref={ref} className="sy-thumb" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function ArtboardsPanel() {
  const doc = useStore((s) => s.doc);
  const nested = useStore(() => store().nestedTag());
  const [renaming, setRenaming] = useState<Id | null>(null);
  const [menu, setMenu] = useState<{ id: Id; x: number; y: number } | null>(null);
  const dnd = useRowDrag<Id>();
  if (nested)
    return (
      <div className="cv-panel cv-options ab-panel" data-help="artboards">
        <Tip stays>You're painting a tile right now. Press Done above the canvas to get back to your artboards.</Tip>
      </div>
    );
  if (doc.editing?.length)
    return (
      <div className="cv-panel cv-options ab-panel" data-help="artboards">
        <Tip stays>You're inside a symbol. Go back out to switch artboards.</Tip>
      </div>
    );
  const list = artboardsOf(doc);
  const open = activeId(doc);
  const many = hasArtboards(doc);
  // The speed shows on each row only once they differ: a file where every artboard is at 12 fps says nothing.
  const mixed = many && mixedRates(doc);
  const canVary = !doc.sharedLayers;

  const move = (id: Id, to: number) => {
    reorderArtboardById(id, Math.max(0, Math.min(list.length - 1, to)));
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-artboard="${id}"]`)?.focus());
  };
  const drop = (over: Id) => {
    const { node, where } = dnd.take();
    const from = list.findIndex((x) => x.id === node);
    const at = list.findIndex((x) => x.id === over);
    if (node && from >= 0 && at >= 0 && node !== over) reorderArtboardById(node, dropIndex(from, at, where));
  };
  const aboutOf = (a: Artboard) => {
    const px = artPixelOf(artboardDoc(doc, a.id));
    const doc0 = sizeOf(doc, a);
    const { w, h } = artSizeOf(doc0.w, doc0.h, px);
    const len = a.content ? a.content.length : doc.length;
    // Frames are worth saying when this board differs from the one it follows (or has any, on its own).
    const frames = len > 1 && len !== (a.variationOf ? sizeOfLength(doc, a.variationOf) : -1) ? `${len} frames` : '';
    return { w, h, frames, size: `${w} x ${h}` };
  };

  const menuFor = (a: Artboard): MenuItem[] => {
    const i = list.findIndex((x) => x.id === a.id);
    const { size, frames } = aboutOf(a);
    const src = a.variationOf ? sourceOf(doc, a) : undefined;
    return [
      { heading: `${a.name} (artboard, ${size}${frames ? `, ${frames}` : ''}${src ? `, a variation of ${src.name}` : ''})` },
      { separator: true },
      ...pieceMenuBasics({
        thing: 'artboard',
        onRename: () => setRenaming(a.id),
        onDuplicate: () => void duplicateArtboardById(a.id),
        onDelete: () => void deleteArtboardById(a.id),
        canDelete: many,
        up: { label: 'Move up (earlier in Play all)', disabled: i <= 0, run: () => move(a.id, i - 1) },
        down: { label: 'Move down (later in Play all)', disabled: i >= list.length - 1, run: () => move(a.id, i + 1) },
      }),
      { separator: true },
      { label: 'Zoom to this artboard', onClick: () => zoomToArtboard(a.id) },
      ...(src ? [{ label: 'Go to the original', onClick: () => goToArtboard(src.id, true) }] : []),
      ...(canVary && !a.variationOf ? [{ label: 'Make a variation (linked copy)', onClick: () => void import('./variationOps').then((m) => m.makeVariationOf(a.id)) }] : []),
      ...(a.variationOf
        ? [
            { label: 'Reset to the original', onClick: () => void import('./variationOps').then((m) => m.resetVariationById(a.id)) },
            { label: 'Detach (make it a plain artboard)', onClick: () => void import('./variationOps').then((m) => m.detachVariationById(a.id)) },
          ]
        : []),
      { separator: true },
      { label: 'Add an artboard', onClick: () => void newArtboard() },
    ];
  };

  return (
    <div className="ab-panel ab-listed" data-help="artboards">
      <PieceTools
        name="Artboards"
        newWord="New artboard"
        inPanel
        adds={
          <>
            <PieceButton text="Blank" tip={tip('artboards.new', 'A new empty artboard beside the others, the same size as this one')} label="New blank artboard" onClick={() => runCmd('artboards.new')} />
            <PieceButton
              icon="link"
              text="Variation"
              tip={canVary ? tip('artboards.makeVariation', 'A linked copy that follows this artboard: edit the original and it follows along') : 'Variations need layers of their own, so they are off while the frames share one set of layers'}
              label="New variation"
              disabled={!canVary}
              onClick={() => runCmd('artboards.makeVariation')}
            />
          </>
        }
        actions={
          <PieceActions
            thing="artboard"
            duplicate={{ tip: tip('artboards.duplicate', 'Make a copy beside it, with its own copy of every drawing'), run: () => runCmd('artboards.duplicate') }}
            remove={{ tip: tip('artboards.delete', 'Delete this artboard'), run: () => runCmd('artboards.delete'), off: many ? undefined : 'You need at least one artboard' }}
          />
        }
      >
        {many && (
          <span className="tl-layer-new" role="group" aria-label="All artboards">
            <span className="tl-layer-new-label" aria-hidden="true">
              All artboards
            </span>
            <PieceButton icon="zoom" text="Fit all" tip="Show every artboard at once" label="Fit all artboards" onClick={() => fitAllArtboards()} />
            <PieceButton icon="grid" text="Line up" tip="Line them up in a row, in list order" label="Line up artboards" onClick={() => arrangeAll()} />
            <PieceButton icon="play" text="Play all in order" tip="Play every artboard one after another, like shots in a film" label="Play all artboards in order" onClick={() => openShotsPlayer()} />
            <PieceButton icon="export" text="Export artboards" tip="Export each artboard as its own file, or pack them all onto one sprite sheet" label="Export artboards" onClick={() => openArtboardExport()} />
          </span>
        )}
      </PieceTools>
      {!many && (
        <div className="ab-tip">
          <Tip>Every artboard shares your palette, swatches and symbols. Add one, or drag on the empty space round the page with the Artboard tool (Shift+W).</Tip>
        </div>
      )}
      <div className="tl-layers ab-rows" role="tree" aria-label="Artboards, in Play all order">
        {list.map((a, i) => {
          const { size, frames } = aboutOf(a);
          const src = a.variationOf ? sourceOf(doc, a) : undefined;
          const rate = mixed ? `${rateOf(doc, a.id)} fps` : '';
          return (
            <PieceRow
              key={a.id}
              id={a.id}
              attr="data-artboard"
              h={CLEAN_ROW_H}
              active={a.id === open}
              inFolder={!!a.variationOf}
              depth={a.variationOf ? 1 : 0}
              className={a.variationOf ? 'ab-var' : ''}
              label={`${a.name}, artboard ${size}${frames ? `, ${frames}` : ''}${src ? `, variation of ${src.name}` : ''}`}
              drag={{
                dropMark: dnd.mark(a.id, dnd.drag.node === a.id),
                onDragStart: (id) => dnd.start(id),
                onDragOver: (id, where) => dnd.over(id, where),
                onDrop: drop,
                onDragEnd: dnd.end,
              }}
              onSelect={() => a.id !== open && goToArtboard(a.id, true)}
              onDoubleClick={() => zoomToArtboard(a.id)}
              onMenu={(x, y) => setMenu({ id: a.id, x, y })}
              onKey={(e) => {
                if (e.target !== e.currentTarget || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return false;
                e.preventDefault();
                e.stopPropagation();
                move(a.id, i + (e.key === 'ArrowUp' ? -1 : 1));
                return true;
              }}
              lead={
                <span className="tl-kind tl-thumb">
                  <Thumb doc={doc} id={a.id} size={30} />
                </span>
              }
              name={a.name}
              nameLabel="Artboard name"
              nameTitle="Double-click to rename. Click to draw on it, double-click the row to fill the window with it, drag to reorder."
              editing={renaming === a.id}
              onStartRename={() => setRenaming(a.id)}
              onRename={(v) => {
                setRenaming(null);
                if (v) renameArtboardById(a.id, v);
              }}
              tags={
                src ? (
                  <small className="tl-ref-tag" title={`A variation (linked copy) of ${src.name}. It follows ${src.name} except for what you change in it.`}>
                    <Icon name="link" size={10} />
                  </small>
                ) : null
              }
              meta={
                <span className="ab-size" title={[frames, rate].filter(Boolean).join(', ') || undefined}>
                  {size}
                  {rate ? ` · ${rate}` : ''}
                </span>
              }
              moreTitle="More: rename, move up or down, duplicate, delete, zoom to it"
              moreLabel={`More options for ${a.name}`}
            />
          );
        })}
        {menu && findArtboard(doc, menu.id) ? <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={menuFor(findArtboard(doc, menu.id)!)} /> : null}
      </div>
      <div className="cv-panel cv-options ab-rest">
        <VariationSection />
        <Section title="This artboard">
          <ArtboardFields id={open} />
        </Section>
      </div>
    </div>
  );
}
