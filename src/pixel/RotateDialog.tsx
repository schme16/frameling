// "Turn by any angle": a small dialog with a slider and a live, crisp preview of the turned drawing.
import { useEffect, useMemo, useRef, useState } from 'react';
import { mountModal, Modal } from '../io/mount';
import { activeDrawing, activeGrid } from '../tools/edit';
import { gridPixels } from '../core/pixelBounds';
import { editPixels, pixelsAfter } from './commands';
import { contentBounds, rotateSmooth, type Img } from './transform';
import { hint } from '../canvas/controller';
import './pixel.css';

function Preview({ d, pixels }: { d: Img; pixels: Uint8ClampedArray }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = d.width;
    c.height = d.height;
    const g = c.getContext('2d');
    g?.putImageData(new ImageData(new Uint8ClampedArray(pixels), d.width, d.height), 0, 0);
  }, [d, pixels]);
  return <canvas ref={ref} className="px-rotate-preview" role="img" aria-label="Preview of the turned drawing" />;
}

function RotateDialog({ d, close }: { d: Img; close: () => void }) {
  const [angle, setAngle] = useState(15);
  const turned = useMemo(() => pixelsAfter(d, (img, box) => rotateSmooth(img, angle, box), 'transform')?.pixels ?? d.pixels, [d, angle]);
  const apply = () => {
    if (angle % 360 !== 0) editPixels(`Turn ${angle}°`, (img, box) => rotateSmooth(img, angle, box), 'transform');
    close();
  };
  return (
    <Modal title="Turn the drawing" onClose={close}>
      <div className="io-body px-rotate">
        <Preview d={d} pixels={turned} />
        <label className="px-rotate-field">
          <span className="cv-field-label">Angle</span>
          <input type="range" className="cv-slider" min={-180} max={180} step={1} value={angle} onChange={(e) => setAngle(Number(e.target.value))} aria-label="Angle in degrees" data-autofocus />
          <span className="px-rotate-value">{angle}°</span>
        </label>
        <div className="px-rotate-quick">
          {[-90, -45, -15, 15, 45, 90, 180].map((a) => (
            <button key={a} type="button" className="io-btn" onClick={() => setAngle(a)}>
              {a > 0 ? `+${a}` : a}°
            </button>
          ))}
        </div>
        <p className="io-muted">Turned without blur: every pixel keeps one of the drawing's own colours. Small angles on small sprites look best; for 90° turns use Turn right or Turn left, which are exact.</p>
      </div>
      <div className="io-foot">
        <button type="button" className="io-btn" onClick={close}>
          Cancel
        </button>
        <button type="button" className="io-btn io-primary" onClick={apply}>
          Turn it
        </button>
      </div>
    </Modal>
  );
}

export function openRotateDialog(): void {
  const d = activeDrawing();
  const g = activeGrid();
  const img = d && d.kind === 'pixel' && g ? { width: g.width, height: g.height, pixels: gridPixels(d, g.width, g.height) } : null;
  if (!img || !contentBounds(img)) {
    hint('There is nothing drawn on this frame to turn. Pick a pixel layer with a drawing first.');
    return;
  }
  mountModal((close) => <RotateDialog d={img} close={close} />);
}
