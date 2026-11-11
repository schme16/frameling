// The drawing canvas. Owned by the canvas area; the UI shell places it in the middle of the workspace.
import { useEffect, useRef, useState } from 'react';
import './canvas.css';
import { CanvasEngine } from './engine';
import { EditBar, onCanvasDoubleClick, onCanvasDragLeave, onCanvasDragOver, onCanvasDrop } from '../symbols/EditBar';
import { TileEditBanner } from '../tiles/TileEditBanner';
import { Rulers } from './Rulers';
import { useViewSettings } from './viewSettings';
import { onTextDoubleClick, TextEditor } from '../text/TextEditor';

export function CanvasView() {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [hint, setHint] = useState<{ text: string; id: number } | null>(null);
  const rulers = useViewSettings((v) => v.rulers);

  useEffect(() => {
    const engine = new CanvasEngine({ root: rootRef.current!, stage: stageRef.current!, main: mainRef.current!, overlay: overlayRef.current! });
    let timer = 0;
    let n = 0;
    engine.onHint = (text) => {
      clearTimeout(timer);
      setHint({ text, id: ++n });
      timer = window.setTimeout(() => setHint(null), 3200);
    };
    const unmount = engine.mount();
    return () => {
      clearTimeout(timer);
      unmount();
    };
  }, []);

  return (
    <div className={`cv-root${rulers ? ' has-rulers' : ''}`} ref={rootRef} tabIndex={-1} aria-label="Drawing canvas" role="application" onDoubleClick={(e) => void (onTextDoubleClick(e) || onCanvasDoubleClick(e))} onDragOver={onCanvasDragOver} onDragLeave={onCanvasDragLeave} onDrop={onCanvasDrop}>
      <div className="cv-stage" ref={stageRef} />
      <canvas className="cv-layer" ref={mainRef} />
      <canvas className="cv-layer cv-overlay" ref={overlayRef} />
      <TextEditor />
      <EditBar />
      <TileEditBanner />
      {rulers && <Rulers root={rootRef} />}
      {hint && (
        <div className="cv-hint" key={hint.id} role="status" aria-live="polite">
          {hint.text}
        </div>
      )}
    </div>
  );
}
