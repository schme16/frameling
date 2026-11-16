// "Grow, shrink or feather the selection": a small card with the three ways, a slider and a live look at the edge.
import { useEffect, useMemo, useRef, useState } from 'react';
import { mountModal, Modal } from '../io/mount';
import { activePixelDrawing, activePixelGrid, pixelSelection } from './pixel-state';
import { gridPixels } from '../core/pixelBounds';
import { applyEdge, edgeOf, edgeReach, rememberReach, type EdgeWay } from './edge';
import { maskCount, type Mask } from './mask';
import '../pixel/pixel.css';

const WAYS: { way: EdgeWay; label: string; term: string; pixel: string; shapes: string }[] = [
  { way: 'grow', label: 'Grow', term: 'expand', pixel: 'Pushes the edge out, so a bit more is picked all the way round.', shapes: 'Makes each picked shape a bit bigger all the way round.' },
  { way: 'shrink', label: 'Shrink', term: 'contract', pixel: 'Pulls the edge in, so a bit less is picked all the way round.', shapes: 'Makes each picked shape a bit smaller all the way round.' },
  { way: 'feather', label: 'Feather', term: 'soft edge', pixel: 'Fades the edge, so a paste, a fill or a delete blends in instead of looking cut out.', shapes: 'Softens the edges of the picked shapes (the Soften effect).' },
];

function Preview({ w, h, base, mask }: { w: number; h: number; base: Uint8ClampedArray; mask: Mask }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = w;
    c.height = h;
    const out = new Uint8ClampedArray(base);
    const cover = mask.soft;
    for (let i = 0; i < mask.bits.length; i++) {
      const k = (cover ? cover[i] : mask.bits[i] * 255) / 255;
      // What is outside the selection is dimmed; what is in it gets a blue tint that thins out along a soft edge.
      out[i * 4 + 3] = Math.round(base[i * 4 + 3] * (0.3 + 0.7 * k));
      if (k > 0) {
        const t = 0.3 * k;
        out[i * 4] = out[i * 4] * (1 - t) + 74 * t;
        out[i * 4 + 1] = out[i * 4 + 1] * (1 - t) + 163 * t;
        out[i * 4 + 2] = out[i * 4 + 2] * (1 - t) + 255 * t;
        out[i * 4 + 3] = Math.max(out[i * 4 + 3], Math.round(255 * t));
      }
    }
    c.getContext('2d')?.putImageData(new ImageData(out, w, h), 0, 0);
  }, [w, h, base, mask]);
  return <canvas ref={ref} className="px-rotate-preview" role="img" aria-label="The selection with its edge changed: what is picked is tinted blue, the rest is dimmed" />;
}

function EdgeDialog({ close }: { close: () => void }) {
  const grid = activePixelGrid();
  const m = grid ? pixelSelection() : null;
  const onShapes = !m;
  const [way, setWay] = useState<EdgeWay>('feather');
  const [px, setPx] = useState(edgeReach());
  const drawing = grid ? activePixelDrawing() : null;
  const base = useMemo(() => (grid && drawing ? gridPixels(drawing, grid.width, grid.height) : new Uint8ClampedArray((grid?.width ?? 0) * (grid?.height ?? 0) * 4)), [grid, drawing]);
  const after = useMemo(() => (m ? edgeOf(m, way, px) : null), [m, way, px]);
  const gone = !!after && maskCount(after) === 0;
  const apply = () => {
    rememberReach(px);
    if (applyEdge(way, px)) close();
  };
  const cur = WAYS.find((x) => x.way === way)!;
  return (
    <Modal title="Grow, shrink or feather the selection" onClose={close}>
      <div className="io-body px-rotate">
        {grid && m && after && <Preview w={grid.width} h={grid.height} base={base} mask={after} />}
        <div className="px-rotate-quick" role="group" aria-label="What to do to the edge">
          {WAYS.map((x) => (
            <button key={x.way} type="button" className={`io-btn${x.way === way ? ' io-primary' : ''}`} aria-pressed={x.way === way} onClick={() => setWay(x.way)} data-autofocus={x.way === way ? true : undefined}>
              {x.label}
            </button>
          ))}
        </div>
        <label className="px-rotate-field">
          <span className="cv-field-label">Amount</span>
          <input type="range" className="cv-slider" min={1} max={onShapes ? 60 : 40} step={1} value={px} onChange={(e) => setPx(Number(e.target.value))} aria-label="Amount in pixels" />
          <span className="px-rotate-value">{px} px</span>
        </label>
        <p className="io-muted">
          {onShapes ? cur.shapes : cur.pixel}
          {gone ? ' That is more than the selection has, so it would be gone. Try less.' : ''}
          {way === 'feather' && !onShapes ? ' Grow and Shrink make the edge sharp again, so feather last.' : ''}
        </p>
      </div>
      <div className="io-foot">
        <button type="button" className="io-btn" onClick={close}>
          Cancel
        </button>
        <button type="button" className="io-btn io-primary" onClick={apply} disabled={gone}>
          {cur.label}
        </button>
      </div>
    </Modal>
  );
}

export function openEdgeDialog(): void {
  mountModal((close) => <EdgeDialog close={close} />);
}
