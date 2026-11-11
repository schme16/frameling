// "Recolour the whole animation": pick a colour the animation uses, pick what it becomes, see this frame before and
// after, then swap it everywhere in one undo step.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Doc } from '../core/format';
import { renderFrameToCanvas } from '../core/render';
import { store } from '../core/store';
import { mountModal, Modal } from '../io/mount';
import { recolourDoc, usedColours } from './recolour';
import { activeColor } from './wells';
import { noteColorUsed } from './recent';

const PREVIEW = 220;

function Preview({ doc, frame, label }: { doc: Doc; frame: number; label: string }) {
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

function RecolourDialog({ close }: { close: () => void }) {
  const { doc, ui } = store().get();
  const used = useMemo(() => usedColours(doc), [doc]);
  const [from, setFrom] = useState<string>(() => {
    const a = activeColor(ui)?.slice(0, 7).toLowerCase();
    return a && used.includes(a) ? a : (used[0] ?? '#000000');
  });
  const [to, setTo] = useState<string>(() => (from === '#ffffff' ? '#ff6f91' : '#ffffff'));
  const [close_, setClose] = useState(0);
  const [stage, setStage] = useState(false);
  const result = useMemo(() => recolourDoc(doc, from, to, { closeness: close_, background: stage }), [doc, from, to, close_, stage]);
  const nothing = result.colours === 0 && result.pixels === 0;

  const apply = () => {
    if (!nothing) {
      // One undo step: only the drawings that changed are swapped in.
      store().update('Recolour the whole animation', (d) => {
        for (const id of result.drawings) d.drawings[id] = result.doc.drawings[id] as never;
        d.swatches = result.doc.swatches as never;
        d.background = result.doc.background;
      });
      noteColorUsed(to);
    }
    close();
  };

  const parts: string[] = [];
  if (result.colours) parts.push(`${result.colours} colour${result.colours === 1 ? '' : 's'} in shapes and swatches`);
  if (result.pixels) parts.push(`${result.pixels.toLocaleString()} pixel${result.pixels === 1 ? '' : 's'}`);

  return (
    <Modal title="Recolour the whole animation" onClose={close} wide>
      <div className="io-body cv-recolour">
        <p className="io-muted">Swap one colour for another on every frame and every layer, vector and pixel alike. This is sometimes called a palette swap.</p>
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
          <input type="checkbox" checked={stage} onChange={(e) => setStage(e.target.checked)} /> Change the stage colour too, if it matches
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
        <button type="button" className="io-btn" onClick={close}>
          Cancel
        </button>
        <button type="button" className="io-btn io-primary" onClick={apply} disabled={nothing}>
          Recolour
        </button>
      </div>
    </Modal>
  );
}

export function openRecolourDialog(): void {
  mountModal((close) => <RecolourDialog close={close} />);
}
