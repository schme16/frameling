// "Turn into pixels" and "Turn into shapes": one dialog for both ways. It says what you are about to lose, lets you
// set the few things that matter, shows this frame before and after, and then does it in one undo step.
import { produce } from 'immer';
import { useEffect, useMemo, useRef, useState } from 'react';
import { currentChoice, setChoice } from '../core/choices';
import { celAt } from '../core/doc';
import type { Doc } from '../core/format';
import { drawingBox, renderFrame } from '../core/render';
import { store } from '../core/store';
import { mountModal, Modal } from '../io/mount';
import { openHelp } from '../ui/overlays';
import { toast } from '../ui/toast';
import { applyToPixels, applyToShapes, doneWords, type LandsWhere } from './apply';
import { framesOpen, hasPick, isSource, makePictures, makeShapes, nameOf, sourceNow, startPixels, startShapes, turnIntoPixels, turnIntoShapes, type PixelSettings, type ShapeSettings, type Source, type Way } from './ops';
import { bakesFor, coversLayer, pictureCount, type FramesWhere } from './scope';
import { MAX_TRACE_COLOURS, MIN_TRACE_COLOURS, traceAdvice, type TraceOptions } from './shapes';
import { bytesWords, clampPixelSize, edgesForPixels, gridBytes, gridOf, MAX_PIXEL_SIZE, sizeChoices } from './size';
import '../export/export.css';
import './convert.css';

const BOX = 300;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The part of the page the art covers, with a little room round it, so a small sprite is not a speck on a big page. */
function artBox(doc: Doc, src: Source): Box {
  const cel = celAt(src.layer, src.frame);
  const d = cel ? doc.drawings[cel.drawingId] : undefined;
  const whole: Box = { x: 0, y: 0, w: doc.width, h: doc.height };
  if (!d) return whole;
  const b = drawingBox(d, src.layer.kind === 'pixel' ? src.layer.pixelSize : 1, doc);
  if (!(b.x1 > b.x0 && b.y1 > b.y0)) return whole;
  const pad = Math.max(2, Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.06);
  const x0 = Math.max(0, b.x0 - pad);
  const y0 = Math.max(0, b.y0 - pad);
  const x1 = Math.min(doc.width, b.x1 + pad);
  const y1 = Math.min(doc.height, b.y1 + pad);
  return x1 - x0 < 4 || y1 - y0 < 4 ? whole : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function Pic({ doc, frame, box, label }: { doc: Doc | null; frame: number; box: Box; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !doc || typeof OffscreenCanvas === 'undefined') return;
    // Whole steps up when it fits, so chunky pixels stay crisp.
    const fit = Math.min(BOX / box.w, BOX / box.h);
    const k = fit >= 1 ? Math.floor(fit) : fit;
    c.width = Math.max(1, Math.round(box.w * k));
    c.height = Math.max(1, Math.round(box.h * k));
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(k, 0, 0, k, -box.x * k, -box.y * k);
    renderFrame(g, doc, frame, { camera: false });
  }, [doc, frame, box]);
  return (
    <figure className="cv-recolour-fig cvt-fig">
      <canvas ref={ref} className="cv-recolour-canvas cvt-canvas" role="img" aria-label={label} data-testid={`convert.pic.${label.toLowerCase()}`} />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

interface SegOption<T> {
  value: T;
  label: string;
  title?: string;
  disabled?: boolean;
}

function Seg<T extends string | number>({ label, value, options, onChange, id }: { label: string; value: T; options: SegOption<T>[]; onChange: (v: T) => void; id: string }) {
  return (
    <div className="cvt-row" role="group" aria-label={label}>
      <span className="cv-field-label">{label}</span>
      <div className="ex-seg">
        {options.map((o) => (
          <button key={String(o.value)} type="button" className={value === o.value ? 'ex-on' : ''} aria-pressed={value === o.value} disabled={o.disabled} title={o.title} data-testid={`convert.${id}.${o.value}`} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

interface Preview {
  now: Doc;
  after: Doc | null;
  /** Plain-words lines about this conversion. */
  note: string;
  /** How many colours the picture has, for the Colours slider (shapes only). */
  colours: string;
  /** What to say before the work, when it needs saying. */
  warn: { level: 'mess' | 'heavy' | 'many'; words: string } | null;
}

function ConvertDialog({ way, src, close }: { way: Way; src: Source; close: () => void }) {
  const doc = store().get().doc;
  const [px, setPx] = useState<PixelSettings | null>(() => (src && way === 'pixels' ? startPixels(src, doc) : null));
  const [sh, setSh] = useState<ShapeSettings | null>(() => (src && way === 'shapes' ? startShapes(src, doc) : null));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(true);
  // Until Edges is picked by hand, it follows the pixel size (chunky pixels want hard edges).
  const [edgesPicked, setEdgesPicked] = useState(false);
  const setSize = (n: number) => setPx((p) => ({ ...p!, pixelSize: n, edges: edgesPicked ? p!.edges : edgesForPixels(doc, n, currentChoice('convert.edges.pixels')) }));
  const open = framesOpen(src);
  const common = way === 'pixels' ? px! : sh!;
  const box = useMemo(() => artBox(doc, src), [doc, src]);
  const pick = hasPick(src);

  // What each choice reaches, for the buttons and for the warnings.
  const bakes = useMemo(() => bakesFor(src.layer, common.frames, src.frame, src.clip), [src, common.frames]);
  const pictures = pictureCount(bakes);
  const whole = !pick && coversLayer(src.layer, bakes);

  // The preview is worked out a moment after the last change, so dragging a slider stays smooth.
  const dep = JSON.stringify(way === 'pixels' ? px : sh);
  useEffect(() => {
    setBusy(true);
    const t = setTimeout(() => {
      try {
        const one = bakesFor(src.layer, 'this', src.frame, src.clip);
        if (way === 'pixels' && px) {
          const pics = makePictures(doc, src, one, px);
          const after = produce(doc, (d) => {
            applyToPixels(d as Doc, { layerId: src.layer.id, bakes: one, where: px.where, pixelSize: px.pixelSize, pictures: pics, shapeIds: src.selection, whole });
          });
          const g = gridOf(doc.width, doc.height, px.pixelSize);
          const bytes = gridBytes(g.width, g.height, pictures);
          const words: string[] = [`Makes a grid of ${g.width.toLocaleString()} by ${g.height.toLocaleString()} pixels${pictures > 1 ? ` for each of ${plural(pictures, 'drawing')}` : ''}.`];
          let warn: Preview['warn'] = null;
          if (bytes > 400 * 1024 * 1024) warn = { level: 'heavy', words: `That is a lot of pixels: about ${bytesWords(bytes)} of memory. A bigger pixel size, or fewer frames, will be much quicker.` };
          else if (g.width * g.height > 2_000_000) warn = { level: 'heavy', words: `${(g.width * g.height / 1e6).toFixed(1)} million pixels in every drawing is slow to paint on. A bigger pixel size makes it lighter.` };
          else if (pictures > 60) warn = { level: 'heavy', words: `${plural(pictures, 'drawing')} will take a little while.` };
          setPreview({ now: doc, after, note: words.join(' '), colours: '', warn });
        } else if (sh) {
          const { traced, stats } = makeShapes(doc, src, one, sh.trace);
          const after = produce(doc, (d) => {
            applyToShapes(d as Doc, { layerId: src.layer.id, bakes: one, where: sh.where, traced, mask: src.mask, whole });
          });
          const advice = traceAdvice({ distinct: stats.distinct, exact: stats.exact, points: stats.points, shapes: [...traced.values()].flat() });
          const base = `${plural(stats.shapes, 'shape')} with ${plural(stats.points, 'point')}${pictures > 1 ? ` on this frame, and ${plural(pictures, 'drawing')} in all` : ''}.`;
          setPreview({ now: doc, after, note: base, colours: stats.exact ? `All ${plural(stats.distinct, 'colour')}, as drawn` : `Picked from about ${stats.distinct.toLocaleString()}`, warn: advice });
        }
      } catch (e) {
        setPreview({ now: doc, after: null, note: `Could not work out a preview: ${e instanceof Error ? e.message : 'something went wrong'}.`, colours: '', warn: null });
      }
      setBusy(false);
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep, way]);

  const set = (patch: Partial<PixelSettings & ShapeSettings>) => {
    if (way === 'pixels') setPx((p) => ({ ...p!, ...(patch as Partial<PixelSettings>) }));
    else setSh((p) => ({ ...p!, ...(patch as Partial<ShapeSettings>) }));
  };
  const setTrace = (patch: Partial<TraceOptions>) => setSh((p) => ({ ...p!, trace: { ...p!.trace, ...patch } }));

  const lands = (w: LandsWhere) => {
    set({ where: w });
    setChoice('convert.where', w === 'beside' ? undefined : w);
  };
  const framesTo = (f: FramesWhere) => {
    set({ frames: f });
    setChoice('convert.frames', f === 'this' ? undefined : f);
  };

  const go = () => {
    // The few things that are a taste, not a one-off, are remembered for next time.
    if (way === 'pixels' && px) setChoice('convert.edges.pixels', px.edges);
    if (way === 'shapes' && sh) {
      setChoice('convert.edges.shapes', sh.trace.edges);
      setChoice('convert.layering', sh.trace.layering === 'stacked' ? undefined : sh.trace.layering);
      setChoice('convert.split', sh.trace.split === 'colour' ? undefined : sh.trace.split);
    }
    const applied = way === 'pixels' ? turnIntoPixels(src, px!) : turnIntoShapes(src, sh!);
    close();
    if (applied) toast(doneWords(way, applied), { kind: 'success', action: { label: 'Undo', run: () => store().undo() } });
  };

  const sizes = sizeChoices(doc.width, doc.height);
  const label = (f: FramesWhere, words: string) => `${words}${open[f].open ? ` (${open[f].drawings})` : ''}`;
  const verb = way === 'pixels' ? 'Turn into pixels' : 'Turn into shapes';
  const warn = preview?.warn;

  return (
    <Modal title={`${verb} (${way === 'pixels' ? 'rasterize' : 'trace'})`} onClose={close} wide>
      <div className="io-body cv-recolour cvt" data-way={way}>
        <p className="io-muted cvt-lose" data-testid="convert.lose">
          {way === 'pixels'
            ? 'Your shapes become a grid of coloured squares. You can then paint them like pixel art, but you can no longer reshape them, and they will not stay sharp when you zoom in or resize.'
            : 'Your pixels become flat-colour shapes you can reshape and resize without going blocky. In return, soft shading and tiny details are simplified, and a busy picture makes a lot of shapes.'}
        </p>

        <Seg
          id="where"
          label="Where it goes"
          value={common.where}
          onChange={lands}
          options={[
            { value: 'beside', label: 'A new layer beside it', title: 'The original stays. It is hidden when all of it was turned.' },
            { value: 'replace', label: 'In its place', title: way === 'pixels' ? 'The shapes you turned come out of the original, and the pixels take their place.' : 'The pixels you turned come out of the original, and the shapes take their place.' },
          ]}
        />
        <Seg
          id="frames"
          label="How many frames"
          value={common.frames}
          onChange={framesTo}
          options={[
            { value: 'this', label: label('this', 'This drawing'), disabled: !open.this.open, title: open.this.why },
            { value: 'clip', label: label('clip', 'This clip'), disabled: !open.clip.open, title: open.clip.why },
            { value: 'all', label: label('all', 'Every frame'), disabled: !open.all.open, title: open.all.why ?? 'Every drawing on this layer. Slow for a long animation.' },
          ]}
        />
        {pick && (
          <p className="io-muted cvt-small">
            {way === 'pixels' ? `Just the ${plural(src.selection.length, 'shape')} you picked.` : 'Just the pixels you selected.'}
          </p>
        )}

        {way === 'pixels' && px && (
          <>
            <div className="cvt-row" role="group" aria-label="Pixel size">
              <span className="cv-field-label">Pixel size</span>
              <div className="ex-seg">
                {sizes.map((s) => (
                  <button key={s} type="button" className={px.pixelSize === s ? 'ex-on' : ''} aria-pressed={px.pixelSize === s} data-testid={`convert.size.${s}`} title={s === 1 ? 'The page’s own pixels' : `Each pixel is ${s} by ${s} page pixels`} onClick={() => setSize(s)}>
                    {s === 1 ? 'Finest' : `${s}×`}
                  </button>
                ))}
              </div>
              <input type="number" className="cvt-num" min={1} max={MAX_PIXEL_SIZE} step={1} value={px.pixelSize} aria-label="Pixel size, in page pixels" data-testid="convert.size.number" onChange={(e) => setSize(clampPixelSize(Number(e.target.value), px.pixelSize))} />
            </div>
            <Seg
              id="edges"
              label="Edges"
              value={px.edges}
              onChange={(v) => {
                setEdgesPicked(true);
                setPx({ ...px, edges: v });
              }}
              options={[
                { value: 'hard', label: 'Hard', title: 'Every pixel is fully painted or empty: the pixel art look' },
                { value: 'smooth', label: 'Soft', title: 'Edge pixels are partly see-through, so shapes look smooth' },
              ]}
            />
          </>
        )}

        {way === 'shapes' && sh && (
          <>
            <label className="cv-recolour-field">
              <span className="cv-field-label">Colours</span>
              <input type="range" className="cv-slider" min={MIN_TRACE_COLOURS} max={MAX_TRACE_COLOURS} step={1} value={sh.trace.colours} onChange={(e) => setTrace({ colours: Number(e.target.value) })} aria-label="How many colours to keep" data-testid="convert.colours" />
              <span>{sh.trace.colours}{preview && !busy && preview.colours ? ` (${preview.colours})` : ''}</span>
            </label>
            <Seg
              id="edges"
              label="Edges"
              value={sh.trace.edges}
              onChange={(v) => setTrace({ edges: v })}
              options={[
                { value: 'hug', label: 'Keep the pixel steps', title: 'Straight edges exactly where the pixels were: right for pixel art' },
                { value: 'smooth', label: 'Round into curves', title: 'The steps are rounded off, with far fewer points: right for a scanned drawing' },
              ]}
            />
            {sh.trace.edges === 'smooth' && (
              <label className="cv-recolour-field">
                <span className="cv-field-label">Smoothness</span>
                <input type="range" className="cv-slider" min={0} max={100} step={1} value={Math.round(sh.trace.smooth * 100)} onChange={(e) => setTrace({ smooth: Number(e.target.value) / 100 })} aria-label="How much to smooth the curves" data-testid="convert.smooth" />
                <span>{sh.trace.smooth < 0.34 ? 'Close to the pixels' : sh.trace.smooth < 0.67 ? 'Balanced' : 'Very smooth'}</span>
              </label>
            )}
            <details className="cvt-more">
              <summary>More ways to tune it</summary>
              <Seg
                id="layering"
                label="Stacking"
                value={sh.trace.layering}
                onChange={(v) => setTrace({ layering: v })}
                options={[
                  { value: 'stacked', label: 'Stacked, no gaps', title: 'Each colour also sits under the ones above it, so there are no thin gaps' },
                  { value: 'pieces', label: 'Side by side', title: 'Each shape is only its own colour' },
                ]}
              />
              <Seg
                id="split"
                label="One shape for"
                value={sh.trace.split}
                onChange={(v) => setTrace({ split: v })}
                options={[
                  { value: 'colour', label: 'Each colour' },
                  { value: 'blob', label: 'Each blob', title: 'Every separate piece is its own shape' },
                ]}
              />
              <label className="cv-recolour-field">
                <span className="cv-field-label">Leave out bits smaller than</span>
                <input type="range" className="cv-slider" min={1} max={64} step={1} value={sh.trace.speck} onChange={(e) => setTrace({ speck: Number(e.target.value) })} aria-label="Smallest bit to keep, in pixels" data-testid="convert.speck" />
                <span>{plural(sh.trace.speck, 'pixel')}</span>
              </label>
            </details>
          </>
        )}

        <div className="cv-recolour-previews cvt-previews" aria-busy={busy}>
          <Pic doc={preview?.now ?? doc} frame={src.frame} box={box} label="Now" />
          <Pic doc={preview?.after ?? null} frame={src.frame} box={box} label="After" />
        </div>

        <p className="io-muted" aria-live="polite" data-testid="convert.note">
          {busy ? 'Working out the preview...' : preview?.note}
        </p>
        {warn && !busy && (
          <p className={`cvt-warn cvt-${warn.level}`} role="note" data-testid="convert.warn">
            {warn.words}
          </p>
        )}
        <p className="io-muted cvt-small">One undo puts it all back.</p>
      </div>
      <div className="io-foot">
        <button type="button" className="io-btn" onClick={() => openHelp(way === 'pixels' ? 'convert-to-pixels' : 'convert-to-shapes')}>
          How this works
        </button>
        <span className="cvt-spacer" />
        <button type="button" className="io-btn" data-testid="convert.cancel" onClick={close}>
          Cancel
        </button>
        <button type="button" className="io-btn io-primary" data-testid="convert.apply" onClick={go} disabled={busy || (way === 'shapes' && !preview?.after)}>
          {warn?.level === 'mess' ? `${verb} anyway` : verb}
        </button>
      </div>
    </Modal>
  );
}

/** Opens the dialog for a way, or says why it can't be done right now. */
export function openConvertDialog(way: Way): void {
  const s = sourceNow(way);
  if (!isSource(s)) {
    toast(s.why, { kind: 'warn' });
    return;
  }
  mountModal((close) => <ConvertDialog way={way} src={s} close={close} />);
}

export { nameOf };
