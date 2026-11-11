import { useEffect, useState } from 'react';
import { getCommand } from '../core/registry';
import { useStore } from '../core/store';
import { findLayer } from '../core/doc';
import { Icon } from './icons';
import { usePrefs, reducedMotion } from './prefs';
import { runCommand } from './palette';
import { TIPS, tipText } from './tips';

export function StatusBar() {
  const zoom = useStore((s) => s.ui.zoom);
  const w = useStore((s) => s.doc.width);
  const h = useStore((s) => s.doc.height);
  const fps = useStore((s) => s.doc.fps);
  const frame = useStore((s) => s.ui.frame);
  const length = useStore((s) => s.doc.length);
  const pixel = useStore((s) => {
    const l = findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
    return l?.kind === 'pixel' ? l.pixelSize : 0;
  });
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
        {Math.round(zoom * 100)}%
      </button>
      <span className="ui-status-item" data-tip="Drawing size">
        <Icon name={pixel ? 'pixel' : 'image'} size={14} />
        {w} x {h}
        {pixel ? ` (${Math.ceil(w / pixel)} x ${Math.ceil(h / pixel)} pixels)` : ''}
      </span>
      <span className="ui-status-item" data-tip="Frames per second">
        <Icon name="film" size={14} />
        {fps} fps
      </span>
      <span className="ui-status-item" data-tip="Current frame">
        <Icon name="timeline" size={14} />
        Frame {frame + 1} of {length}
      </span>
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
