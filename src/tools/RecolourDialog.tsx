// "Recolour the whole animation": pick a colour the animation uses, pick what it becomes, see this frame before and
// after, then swap it everywhere in one undo step.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Doc } from '../core/format';
import { renderFrameToCanvas } from '../core/render';
import { store } from '../core/store';
import { mountModal, Modal } from '../io/mount';
import { currentChoice, setChoice } from '../core/choices';
import { celAt, findLayer } from '../core/doc';
import { pixelSelection } from '../select/pixel-state';
import { applyRecolour, hasRecolourSelection, recolourDoc, scopeOf, usedColours, type RecolourPlace, type RecolourWhere } from './recolour';
import { activeColor } from './wells';
import { noteColorUsed } from './recent';
import { isEditingVariation } from '../artboards/variations';
import '../export/export.css';

const PREVIEW = 220;

export function Preview({ doc, frame, label }: { doc: Doc; frame: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || typeof OffscreenCanvas === 'undefined') return;
    // Small (pixel art) documents grow by whole steps so pixels stay crisp.
    const fit = Math.min(PREVIEW / doc.width, PREVIEW / doc.height);
    const k = fit >= 1 ? Math.floor(fit) : fit;
    c.width = Math.max(1, Math.round(doc.width * k));
    c.height = Math.max(1, Math.round(doc.height * k));
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = false;
    g.drawImage(renderFrameToCanvas(doc, frame, k), 0, 0);
  }, [doc, frame]);
  return (
    <figure className="cv-recolour-fig">
      <canvas ref={ref} className="cv-recolour-canvas" role="img" aria-label={label} />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

/** The words for each place a recolour can reach, and for the title that goes with it. */
const WHERE: { id: RecolourWhere; label: string; title: string; tip: string }[] = [
  { id: 'all', label: 'Everything', title: 'Recolour the whole animation', tip: 'Every frame and every layer' },
  { id: 'layer', label: 'This layer', title: 'Recolour this layer', tip: 'Every frame of the layer you are on' },
  { id: 'frame', label: 'This frame', title: 'Recolour this frame', tip: 'The drawing showing on this frame, on every layer' },
  { id: 'selection', label: 'The selection', title: 'Recolour the selection', tip: 'Only the shapes or pixels you have selected' },
];

function RecolourDialog({ close, start }: { close: () => void; start?: RecolourWhere }) {
  const { doc, ui } = store().get();
  const place: RecolourPlace = useMemo(() => ({ frame: ui.frame, layerId: ui.activeLayerId, selection: ui.selection, pixelMask: pixelSelection() }), [ui.frame, ui.activeLayerId, ui.selection]);
  const inVariation = isEditingVariation(doc);
  const layer = findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  const canSelection = hasRecolourSelection(place);
  const available = (w: RecolourWhere): boolean => (w === 'all' ? true : inVariation ? false : w === 'layer' ? !!layer : w === 'frame' ? doc.layers.length > 0 : canSelection);
  // What was picked last time (or what the command that opened this said), unless there is nothing to apply it to now.
  const [picked, setPicked] = useState<RecolourWhere>(() => start ?? currentChoice<RecolourWhere>('recolour.where'));
  const where: RecolourWhere = available(picked) ? picked : 'all';
  const pick = (w: RecolourWhere) => {
    setPicked(w);
    setChoice('recolour.where', w === 'all' ? undefined : w);
  };
  const scope = useMemo(() => scopeOf(doc, where, place), [doc, where, place]);
  const used = useMemo(() => usedColours(doc, 32, scope), [doc, scope]);
  const [from, setFrom] = useState<string>(() => {
    const a = activeColor(ui)?.slice(0, 7).toLowerCase();
    return a && used.includes(a) ? a : (used[0] ?? '#000000');
  });
  const [to, setTo] = useState<string>(() => (from === '#ffffff' ? '#ff6f91' : '#ffffff'));
  const [close_, setClose] = useState(0);
  const [stage, setStage] = useState(false);
  const result = useMemo(() => recolourDoc(doc, from, to, { closeness: close_, background: stage, scope }), [doc, from, to, close_, stage, scope]);
  const nothing = result.colours === 0 && result.pixels === 0;
  const hasVariations = !result.inVariation && !!doc.artboards?.some((a) => a.variationOf);

  const apply = () => {
    if (!nothing) {
      // One undo step: only the drawings that changed are swapped in.
      store().update(WHERE.find((w) => w.id === where)!.title, (d) => applyRecolour(d as Doc, result));
      noteColorUsed(to);
    }
    close();
  };

  const parts: string[] = [];
  if (result.colours) parts.push(`${result.colours} colour${result.colours === 1 ? '' : 's'} in shapes${result.inVariation ? '' : ' and swatches'}`);
  if (result.pixels) parts.push(`${result.pixels.toLocaleString()} pixel${result.pixels === 1 ? '' : 's'}`);

  return (
    <Modal title={WHERE.find((w) => w.id === where)!.title} onClose={close} wide>
      <div className="io-body cv-recolour">
        <p className="io-muted">Swap one colour for another, vector and pixel alike. This is sometimes called a palette swap.</p>
        <div className="cv-recolour-where" role="group" aria-label="Where to recolour">
          <span className="cv-field-label">Where</span>
          <div className="ex-seg">
            {WHERE.map((w) => (
              <button
                key={w.id}
                type="button"
                className={where === w.id ? 'ex-on' : ''}
                aria-pressed={where === w.id}
                disabled={!available(w.id)}
                title={w.id === 'selection' && !canSelection ? 'Select something first' : w.tip}
                data-testid={`recolour.where.${w.id}`}
                onClick={() => pick(w.id)}
              >
                {w.label}
              </button>
            ))}
          </div>
          <span className="io-muted" data-testid="recolour-scope-note">
            {whereNote(where, doc, place, layer?.name)}
          </span>
        </div>
        {(result.inVariation || hasVariations) && (
          <p className="io-muted" data-testid="recolour-where">
            {result.inVariation
              ? 'This is a variation: only this variation changes. The original and the other variations keep their colours.'
              : 'This changes the original, and every variation that follows it (a colour a variation changed on its own stays as it is there).'}
          </p>
        )}
        <div className="cv-field-head">
          <span className="cv-field-label">1. Pick a colour to change</span>
        </div>
        <div className="cv-swatches" role="radiogroup" aria-label="Colours this animation uses">
          {used.map((c) => (
            <button key={c} type="button" role="radio" className="cv-swatch" data-on={c === from} aria-checked={c === from} style={{ backgroundColor: c }} title={c} aria-label={c} onClick={() => setFrom(c)} />
          ))}
          {!used.length && <span className="io-muted">This animation has no colours yet.</span>}
        </div>
        <div className="cv-recolour-pick">
          <label>
            <span className="cv-field-label">2. Change it to</span>
            <input type="color" value={to.slice(0, 7)} onChange={(e) => setTo(e.target.value)} aria-label="New colour" data-autofocus />
          </label>
          <button type="button" className="io-btn" onClick={() => setTo((activeColor(store().get().ui) ?? to).slice(0, 7))} title="Use the colour in the box in front of the Colours panel">
            Use my current colour
          </button>
        </div>
        <label className="cv-recolour-field">
          <span className="cv-field-label">Close colours too</span>
          <input type="range" className="cv-slider" min={0} max={100} step={1} value={close_} onChange={(e) => setClose(Number(e.target.value))} aria-label="How close a colour has to be to change too" />
          <span>{close_ === 0 ? 'Only this exact colour' : close_ < 34 ? 'Very close shades' : close_ < 67 ? 'Nearby shades' : 'Loosely similar'}</span>
        </label>
        <label className="cv-recolour-check">
          <input type="checkbox" checked={stage && where === 'all'} disabled={where !== 'all'} onChange={(e) => setStage(e.target.checked)} /> Change the stage colour too, if it matches
        </label>
        <div className="cv-recolour-previews">
          <Preview doc={doc} frame={ui.frame} label="Now" />
          <Preview doc={result.doc} frame={ui.frame} label="After" />
        </div>
        <p className="io-muted" aria-live="polite">
          {nothing ? 'Nothing uses that colour yet.' : `Changes ${parts.join(' and ')}, across ${result.drawings.length} drawing${result.drawings.length === 1 ? '' : 's'}. One undo puts it all back.`}
        </p>
      </div>
      <div className="io-foot">
        <button type="button" className="io-btn" data-testid="recolour.cancel" onClick={close}>
          Cancel
        </button>
        <button type="button" className="io-btn io-primary" data-testid="recolour.apply" onClick={apply} disabled={nothing}>
          Recolour
        </button>
      </div>
    </Modal>
  );
}

/** One line under the Where buttons: what exactly will change, and when that is more than it sounds. */
export function whereNote(where: RecolourWhere, doc: Doc, place: RecolourPlace, layerName?: string): string {
  if (isEditingVariation(doc)) return 'This is a variation, so its colours change as a whole. Go to the original to limit a recolour.';
  if (where === 'layer') return layerName ? `Every frame of ${layerName}, and its effects.` : 'Every frame of this layer.';
  if (where === 'frame') {
    const held = doc.layers.some((l) => (celAt(l, place.frame)?.length ?? 1) > 1);
    return `Frame ${place.frame + 1}, on every layer.${held ? ' A drawing held for several frames changes on all of them.' : ''}`;
  }
  if (where === 'selection') return 'Only the shapes or pixels you have selected.';
  return 'Every frame and every layer, and the swatches.';
}

export function openRecolourDialog(start?: RecolourWhere): void {
  mountModal((close) => <RecolourDialog close={close} start={start} />);
}
