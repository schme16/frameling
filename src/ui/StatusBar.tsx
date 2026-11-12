import { useEffect, useState } from 'react';
import { getCommand } from '../core/registry';
import { useStore } from '../core/store';
import { findLayer } from '../core/doc';
import { Icon } from './icons';
import { usePrefs, reducedMotion } from './prefs';
import { runCommand } from './palette';
import { TIPS, tipText } from './tips';
import { docDpi, formatSize } from '../core/units';
import { drawingAt } from '../core/doc';
import { shapesBounds } from '../canvas/geometry';
import { SnapButton } from '../canvas/SnapOptions';
import { artSizeOf, artZoomPercent } from '../pixel/units';
import { dock, inPixelWorkspace } from './dock';

export function StatusBar() {
  const zoom = useStore((s) => s.ui.zoom);
  const w = useStore((s) => s.doc.width);
  const h = useStore((s) => s.doc.height);
  const fps = useStore((s) => s.doc.fps);
  const dpi = useStore((s) => docDpi(s.doc));
  const units = usePrefs((p) => p.units);
  const frame = useStore((s) => s.ui.frame);
  const length = useStore((s) => s.doc.length);
  const pixel = useStore((s) => {
    const l = findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
    return l?.kind === 'pixel' ? l.pixelSize : 0;
  });
  // The selected shapes' size, as text (a string, so the bar only redraws when it changes).
  const selSize = useStore((s) => {
    if (!s.ui.selection.length) return '';
    const l = findLayer(s.doc, s.ui.activeLayerId);
    const d = l && drawingAt(s.doc, l, s.ui.frame);
    if (!d || d.kind !== 'vector') return '';
    const ids = new Set(s.ui.selection);
    const b = shapesBounds(d.shapes.filter((x) => ids.has(x.id)));
    return b ? formatSize(b.w, b.h, units, docDpi(s.doc)) : '';
  });
  // In the Pixel workspace, sizes and zoom are in art pixels: 32 x 32 and 800%, not the stage's own units.
  const wsId = dock.use((d) => d.workspaceId);
  const pixelWs = !!wsId && inPixelWorkspace() && pixel > 0;
  const art = artSizeOf(w, h, pixel);
  const showTips = usePrefs((p) => p.showTips);
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));
  const [fade, setFade] = useState(false);

  useEffect(() => {
    if (!showTips) return;
    const id = window.setInterval(() => next(), 14000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTips]);

  const next = () => {
    if (reducedMotion()) return setTip((t) => (t + 1) % TIPS.length);
    setFade(true);
    window.setTimeout(() => {
      setTip((t) => (t + 1) % TIPS.length);
      setFade(false);
    }, 220);
  };

  const zoomCmd = getCommand('view.zoom100') ?? getCommand('view.zoomFit');

  return (
    <footer className="ui-status" data-help="status-bar">
      <button type="button" className="ui-status-item ui-status-btn" data-tip="Zoom" data-tip-desc={zoomCmd ? 'Press to jump back to a good size.' : 'How big the canvas looks.'} onClick={() => zoomCmd && runCommand(zoomCmd)}>
        <Icon name="zoom" size={14} />
        {pixelWs ? artZoomPercent(zoom, pixel) : Math.round(zoom * 100)}%
      </button>
      <span className="ui-status-item" data-tip="Drawing size" data-tip-desc={pixelWs ? `Pixels in your sprite. Each one is drawn ${pixel} times bigger on the page, which is ${w} x ${h}.` : units === 'px' ? undefined : `${w} x ${h} px at ${dpi} DPI. Change units in Preferences.`}>
        <Icon name={pixel ? 'pixel' : 'image'} size={14} />
        {pixelWs ? `${art.w} x ${art.h} pixels` : units === 'px' ? `${w} x ${h}` : formatSize(w, h, units, dpi)}
        {pixel && !pixelWs ? ` (${art.w} x ${art.h} pixels)` : ''}
      </span>
      {selSize && (
        <span className="ui-status-item" data-tip="Selection size" data-tip-desc="How big the selected shapes are, outlines included.">
          <Icon name="select" size={14} />
          {selSize}
        </span>
      )}
      <span className="ui-status-item" data-tip="Frames per second">
        <Icon name="film" size={14} />
        {fps} fps
      </span>
      <span className="ui-status-item" data-tip="Current frame">
        <Icon name="timeline" size={14} />
        Frame {frame + 1} of {length}
      </span>
      <SnapButton />
      <span className="ui-status-spacer" />
      {showTips && (
        <button type="button" className={`ui-status-tip${fade ? ' is-fading' : ''}`} onClick={next} data-tip="Show another tip" aria-label={`Tip: ${tipText(TIPS[tip])}. Press for another.`}>
          <Icon name="tip" size={14} />
          <span>{tipText(TIPS[tip])}</span>
        </button>
      )}
    </footer>
  );
}
