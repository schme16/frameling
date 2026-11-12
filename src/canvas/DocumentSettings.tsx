// "Canvas size and speed": the page size (in the chosen unit), DPI, frame rate and background, in one dialog.
// Changing the size either makes room round the artwork (canvas size, with an anchor) or scales everything with it
// (image size). Whatever changes lands as one undo step.
import { useMemo, useState } from 'react';
import type { Doc } from '../core/format';
import { store } from '../core/store';
import { cleanDpi, docDpi, formatSize, pxTo, roundIn, toPx, unitInfo, type Unit } from '../core/units';
import { mountModal, Modal } from '../io/mount';
import { getPrefs } from '../ui/prefs';
import { fit, hint } from './controller';
import { ANCHORS, anchorOffset, clampSize, hasPixelArt, MAX_SIZE, NOTE_TEXT, pixelScaleStep, resizeCanvas, scaleArtwork, scaledSize, type Anchor } from './resize';
import { Icon } from '../ui/icons';
import { activeId, findArtboard } from '../artboards/model';
import { reframeVariations, setVariationSize, untouchedFramings } from '../artboards/variations';
import { currentChoice } from '../core/choices';
import type { FitMode } from '../artboards/fit';
import './settings.css';

type Mode = 'canvas' | 'scale';

const ANCHOR_WORDS: Record<Anchor, string> = {
  nw: 'top left',
  n: 'top',
  ne: 'top right',
  w: 'left',
  c: 'middle',
  e: 'right',
  sw: 'bottom left',
  s: 'bottom',
  se: 'bottom right',
};

/** A length typed in the unit. Keeps its own text while typing, so "12." doesn't jump; hands back pixels. */
function LengthInput({ px, unit, dpi, onPx, label }: { px: number; unit: Unit; dpi: number; onPx: (px: number) => void; label: string }) {
  const shown = String(roundIn(pxTo(px, unit, dpi), unit));
  const [text, setText] = useState<string | null>(null);
  return (
    <span className="ds-len">
      <input
        type="number"
        min={0}
        step={unit === 'px' ? 1 : 'any'}
        value={text ?? shown}
        aria-label={`${label} in ${unitInfo(unit).label.toLowerCase()}`}
        onFocus={() => setText(shown)}
        onBlur={() => setText(null)}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v) && v > 0) onPx(toPx(v, unit, dpi));
        }}
      />
      <i>{unit}</i>
    </span>
  );
}

/** Where the old page sits in the new one, as a small picture. */
function Preview({ doc, w, h, mode, anchor }: { doc: Doc; w: number; h: number; mode: Mode; anchor: Anchor }) {
  const box = 120;
  const big = Math.max(w, h, doc.width, doc.height);
  const k = box / big;
  const { dx, dy } = mode === 'canvas' ? anchorOffset(doc.width, doc.height, w, h, anchor) : { dx: 0, dy: 0 };
  const ow = mode === 'canvas' ? doc.width : w;
  const oh = mode === 'canvas' ? doc.height : h;
  // Centre the new page in the box, with the old one placed in it.
  const left = (box - w * k) / 2;
  const top = (box - h * k) / 2;
  return (
    <svg className="ds-preview" viewBox={`-2 -2 ${box + 4} ${box + 4}`} role="img" aria-label={mode === 'canvas' ? `The drawing sits at the ${ANCHOR_WORDS[anchor]} of the new page` : 'Everything scales with the page'}>
      <rect className="ds-new" x={left} y={top} width={w * k} height={h * k} />
      <rect className="ds-old" x={left + dx * k} y={top + dy * k} width={ow * k} height={oh * k} />
    </svg>
  );
}

function DocumentSettings({ close }: { close: () => void }) {
  const doc = store().get().doc;
  const unit = getPrefs().units;
  const [mode, setMode] = useState<Mode>('canvas');
  const [w, setW] = useState(doc.width);
  const [h, setH] = useState(doc.height);
  const [link, setLink] = useState(true);
  const [anchor, setAnchor] = useState<Anchor>('c');
  const [dpi, setDpi] = useState(docDpi(doc));
  const [fps, setFps] = useState(doc.fps);
  const [see, setSee] = useState(doc.background === null);
  const [bg, setBg] = useState(doc.background ?? '#ffffff');
  const pixelArt = hasPixelArt(doc);
  const step = pixelScaleStep(doc);

  // Scaling pixel art keeps its shape, so width and height stay linked.
  const linked = link || (mode === 'scale' && pixelArt);
  const setWidth = (px: number) => {
    const nw = clampSize(px);
    setW(nw);
    if (linked) setH(clampSize((nw * doc.height) / doc.width));
  };
  const setHeight = (px: number) => {
    const nh = clampSize(px);
    setH(nh);
    if (linked) setW(clampSize((nh * doc.width) / doc.height));
  };

  const result = useMemo(() => (mode === 'scale' ? scaledSize(doc, w, h) : { w, h, k: null }), [doc, mode, w, h]);
  const sizeChanged = result.w !== doc.width || result.h !== doc.height;
  const notes: string[] = [];
  if (sizeChanged && mode === 'canvas') {
    if (result.w < doc.width || result.h < doc.height) notes.push(NOTE_TEXT.cropped);
    if (pixelArt) {
      const { dx, dy } = anchorOffset(doc.width, doc.height, w, h, anchor);
      if (dx % step || dy % step) notes.push(NOTE_TEXT['pixel-shift']);
    }
  }
  if (mode === 'scale' && pixelArt && (result.w !== w || result.h !== h)) notes.push(`${NOTE_TEXT.rounded} It will be ${result.w} x ${result.h} px.`);

  const apply = () => {
    const fpsOk = Math.max(1, Math.min(120, Math.round(fps || doc.fps)));
    const background = see ? null : bg;
    const dpiOk = cleanDpi(dpi);
    const nothing = !sizeChanged && fpsOk === doc.fps && background === doc.background && dpiOk === docDpi(doc);
    if (nothing) return close();
    if (doc.editing?.length) {
      hint('Close the symbol you are drawing inside first, then change the page.');
      return close();
    }
    // A variation's size is only its picture (a camera frames the art), so it goes the way dragging its edge does, and its framing stays tracked.
    const open = sizeChanged && doc.artboards?.some((a) => a.variationOf) ? activeId(doc) : '';
    const asVariation = !!open && !!findArtboard(doc, open)?.variationOf;
    const next = sizeChanged && !asVariation ? (mode === 'canvas' ? resizeCanvas(doc, w, h, anchor) : scaleArtwork(doc, w, h)).doc : doc;
    const label = sizeChanged ? (mode === 'canvas' ? 'Canvas size' : 'Scale artwork') : 'Page settings';
    store().update(label, (d) => {
      const keep = open && !asVariation ? untouchedFramings(d as Doc, open) : [];
      if (asVariation) setVariationSize(d as Doc, open, result.w, result.h, currentChoice<FitMode>('variations.frame'));
      else if (sizeChanged) {
        d.width = next.width;
        d.height = next.height;
        d.layers = next.layers as typeof d.layers;
        d.drawings = next.drawings as typeof d.drawings;
        if (next.folders) d.folders = next.folders as typeof d.folders;
        if (next.guides) d.guides = next.guides;
      }
      d.fps = fpsOk;
      d.background = background;
      if (dpiOk === 96) delete d.dpi;
      else d.dpi = dpiOk;
      if (keep.length) reframeVariations(d as Doc, keep);
    });
    close();
    if (sizeChanged) {
      fit();
      hint(`The page is now ${formatSize(asVariation ? result.w : next.width, asVariation ? result.h : next.height, unit, dpiOk)}.`);
    }
  };

  return (
    <Modal title="Canvas size and speed" onClose={close} className="ds-modal">
      <form
        className="io-body ds-body"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
            e.preventDefault();
            apply();
          }
        }}
      >
        <div className="ds-modes" role="radiogroup" aria-label="When the size changes">
          <button type="button" role="radio" aria-checked={mode === 'canvas'} data-on={mode === 'canvas'} onClick={() => setMode('canvas')} data-autofocus>
            <strong>Change the page</strong>
            <span>Your drawing stays the same size. Space is added or removed around it (canvas size).</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'scale'}
            data-on={mode === 'scale'}
            onClick={() => {
              setMode('scale');
              if (pixelArt) setHeight(clampSize((w * doc.height) / doc.width));
            }}
          >
            <strong>Scale everything</strong>
            <span>Your drawing grows or shrinks with the page (image size).</span>
          </button>
        </div>

        <div className="ds-size">
          <div className="ds-fields">
            <label className="ui-field">
              <span>Width</span>
              <LengthInput px={w} unit={unit} dpi={cleanDpi(dpi)} onPx={setWidth} label="Width" />
            </label>
            <button type="button" className="ds-link" aria-pressed={linked} data-on={linked} disabled={mode === 'scale' && pixelArt} onClick={() => setLink(!link)} title={linked ? 'Width and height change together (keep proportions). Press to change them apart.' : 'Width and height change apart. Press to keep proportions.'} aria-label="Keep proportions">
              <Icon name={linked ? 'link' : 'unlink'} size={16} />
            </button>
            <label className="ui-field">
              <span>Height</span>
              <LengthInput px={h} unit={unit} dpi={cleanDpi(dpi)} onPx={setHeight} label="Height" />
            </label>
            {unit !== 'px' && (
              <label className="ui-field" data-tip="Dots per inch (DPI)" data-tip-desc="How many pixels make an inch. 96 matches screens and the web; 300 is sharp for print. The pixels stay the same; only how big it prints changes.">
                <span>Dots per inch (DPI)</span>
                <input type="number" min={1} max={10000} value={dpi} onChange={(e) => setDpi(Number(e.target.value))} />
              </label>
            )}
            <p className="ds-px">
              {result.w} x {result.h} px{unit !== 'px' ? `, ${formatSize(result.w, result.h, unit, cleanDpi(dpi))}` : ''}
              {sizeChanged ? ` (was ${doc.width} x ${doc.height} px)` : ''}
            </p>
          </div>
          <div className="ds-place">
            <Preview doc={doc} w={result.w} h={result.h} mode={mode} anchor={anchor} />
            {mode === 'canvas' && (
              <div className="ds-anchor" role="radiogroup" aria-label="Where your drawing stays (anchor)">
                {ANCHORS.map((a) => (
                  <button key={a} type="button" role="radio" aria-checked={anchor === a} data-on={anchor === a} onClick={() => setAnchor(a)} title={`Keep the drawing at the ${ANCHOR_WORDS[a]}`} aria-label={ANCHOR_WORDS[a]} />
                ))}
              </div>
            )}
            {mode === 'canvas' && <span className="ds-anchor-note">Drawing stays at the {ANCHOR_WORDS[anchor]} (anchor)</span>}
          </div>
        </div>

        {pixelArt && (
          <p className="io-muted">
            {mode === 'scale'
              ? step === 1
                ? 'Pixel layers scale in whole steps only (2x, 3x...), so every pixel stays a crisp square. Nothing is blurred.'
                : `Pixel layers scale in steps of 1/${step} (their pixels are ${step} or more page pixels wide), so every pixel stays a crisp square.`
              : 'Pixel layers keep their pixel size; they gain or lose rows and columns of pixels.'}
          </p>
        )}
        {notes.map((n) => (
          <p key={n} className="ds-note">
            {n}
          </p>
        ))}

        <div className="ds-row">
          <label className="ui-field" data-tip="Frames per second (fps)" data-tip-desc="How many drawings show each second. 12 is classic hand-drawn, 24 is film, 30 or 60 is smooth for games.">
            <span>Speed (frames per second)</span>
            <input type="number" min={1} max={120} value={fps || ''} onChange={(e) => setFps(Number(e.target.value))} />
          </label>
          <div className="ui-field">
            <span>Background</span>
            <div className="ds-bg">
              <input type="color" value={bg} disabled={see} onChange={(e) => setBg(e.target.value)} aria-label="Background colour" />
              <label className="ui-check">
                <input type="checkbox" checked={see} onChange={(e) => setSee(e.target.checked)} />
                <span>See-through (transparent)</span>
              </label>
            </div>
          </div>
        </div>
        {sizeChanged && w > MAX_SIZE - 1 && <p className="ds-note">That's the biggest page Frameling can make.</p>}
      </form>
      <div className="io-foot">
        <button type="button" className="io-btn" onClick={close}>
          Cancel
        </button>
        <button type="button" className="io-btn io-primary" onClick={apply}>
          {sizeChanged ? (mode === 'canvas' ? 'Change the page' : 'Scale everything') : 'Done'}
        </button>
      </div>
    </Modal>
  );
}

export function openDocumentSettings(): void {
  if (store().get().doc.editing?.length) {
    hint('Close the symbol you are drawing inside first, then change the page.');
    return;
  }
  mountModal((close) => <DocumentSettings close={close} />);
}
