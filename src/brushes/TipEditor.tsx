// The picture tip editor: draw a brush tip on a little grid (up to 32 by 32), or start from a picture file or the pixels you
// have selected, and see the real brush (one dab and a stroke) as you go. Nothing leaves the window until you press the
// button, and Escape throws the changes away.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionButton, Choice, Slider } from '../canvas/controls';
import { store } from '../core/store';
import { Modal, mountModal } from '../io/mount';
import { cleanDab, DEFAULT_DAB } from '../dab/maths';
import { getDab } from '../dab/settings';
import type { PixelSpec } from '../dab/spec';
import { PixelStroke, PixelTip } from './PixelSample';
import { pickPictureTip } from './tipEdit';
import {
  cellAt, copyGrid, flipAcross, flipDown, fillFrom, gridFromStamp, harden, invertShape, isEmpty, MAX_GRID, newGrid, paintLine, resizeGrid, setCell, shift, stampFromGrid, turnRight, colourCount,
  type Cell, type TipGrid,
} from './tipGrid';
import { MAX_STAMP, type PixelStamp } from './stamps';
import { makePixelBrush } from './tips';
import './tipEditor.css';

type Tool = 'draw' | 'erase' | 'fill';

/** What the editor hands back. `size` is the brush size that puts the picture down pixel for pixel. */
export interface EditedTip {
  stamp: PixelStamp;
  size: number;
}

const HISTORY = 60;
const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (r: number, g: number, b: number): string => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** The grid drawn big, with a checkerboard under it where it is empty. */
function GridCanvas({ grid, k, colour, onStart, onMove, onEnd }: { grid: TipGrid; k: number; colour: boolean; onStart: (x: number, y: number, erase: boolean) => void; onMove: (x: number, y: number) => void; onEnd: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = grid.w * k;
    c.height = grid.h * k;
    const g = c.getContext('2d');
    if (!g) return;
    const ink = getComputedStyle(c).color;
    for (let y = 0; y < grid.h; y++)
      for (let x = 0; x < grid.w; x++) {
        g.globalAlpha = 1;
        g.fillStyle = (x + y) % 2 ? 'rgba(128,128,128,0.16)' : 'rgba(128,128,128,0.08)';
        g.fillRect(x * k, y * k, k, k);
        const p = cellAt(grid, x, y);
        if (p[3] <= 0) continue;
        g.fillStyle = colour ? `rgb(${p[0]} ${p[1]} ${p[2]})` : ink;
        g.globalAlpha = p[3] / 255;
        g.fillRect(x * k, y * k, k, k);
      }
  }, [grid, k, colour]);
  const cell = (e: React.PointerEvent): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * grid.w), Math.floor(((e.clientY - r.top) / r.height) * grid.h)];
  };
  return (
    <canvas
      ref={ref}
      className="te-grid"
      data-testid="tip-editor-grid"
      role="img"
      aria-label={`The brush picture, ${grid.w} by ${grid.h} cells. Click or drag to paint.`}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const [x, y] = cell(e);
        onStart(x, y, e.button === 2);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 0) return;
        const [x, y] = cell(e);
        onMove(x, y);
      }}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
    />
  );
}

function Editor({ start, startColour, onDone, close }: { start: TipGrid; startColour: boolean; onDone: (t: EditedTip) => void; close: () => void }) {
  const [grid, setGrid] = useState<TipGrid>(start);
  const [past, setPast] = useState<TipGrid[]>([]);
  const [future, setFuture] = useState<TipGrid[]>([]);
  const [tool, setTool] = useState<Tool>('draw');
  const [colour, setColour] = useState(startColour);
  const [strength, setStrength] = useState(100);
  const [hex, setHex] = useState(() => (/^#[0-9a-f]{6}$/i.test(store().get().ui.color) ? store().get().ui.color : '#1d1b26'));
  const drag = useRef<{ g: TipGrid; x: number; y: number; erase: boolean; before: TipGrid } | null>(null);

  const commit = (g: TipGrid) => {
    setPast((p) => [...p.slice(-(HISTORY - 1)), grid]);
    setFuture([]);
    setGrid(g);
  };
  const undo = () => {
    const p = past[past.length - 1];
    if (!p) return;
    setPast(past.slice(0, -1));
    setFuture([grid, ...future]);
    setGrid(p);
  };
  const redo = () => {
    const f = future[0];
    if (!f) return;
    setFuture(future.slice(1));
    setPast([...past, grid]);
    setGrid(f);
  };

  const paintCell = (): Cell => {
    const a = Math.round((strength / 100) * 255);
    return colour ? [...hexToRgb(hex), a] : [0, 0, 0, a];
  };
  const ink = (erase: boolean): Cell => (erase || tool === 'erase' ? [0, 0, 0, 0] : paintCell());

  const onStart = (x: number, y: number, erase: boolean) => {
    const g = copyGrid(grid);
    if (tool === 'fill' && !erase) {
      if (fillFrom(g, x, y, paintCell())) commit(g);
      return;
    }
    setCell(g, x, y, ink(erase));
    drag.current = { g, x, y, erase, before: grid };
    setGrid(g);
  };
  const onMove = (x: number, y: number) => {
    const d = drag.current;
    if (!d || (d.x === x && d.y === y)) return;
    const g = copyGrid(d.g);
    paintLine(g, d.x, d.y, x, y, ink(d.erase));
    drag.current = { ...d, g, x, y };
    setGrid(g);
  };
  const onEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    // The grid has been painted on as the pointer moved; what it was before the stroke is what undo goes back to.
    setPast((p) => [...p.slice(-(HISTORY - 1)), d.before]);
    setFuture([]);
  };

  const made = useMemo(() => stampFromGrid(grid, colour), [grid, colour]);
  const spec = useMemo<PixelSpec | null>(() => {
    if (!made) return null;
    const base = getDab();
    // A plain brush of the person's own, with just the picture changed, so what they see is what they will draw with.
    return { kind: 'dab', dab: cleanDab({ ...DEFAULT_DAB, ...base, tip: 'picture', picture: made.stamp, size: made.size, spacing: 1, scatter: 0, dynamics: [], grain: null, dual: null, wet: 0, blend: 'normal' }) };
  }, [made]);

  const k = Math.max(6, Math.floor(352 / Math.max(grid.w, grid.h)));
  const several = colourCount(grid) > 1;

  return (
    <Modal title="Draw a picture tip" onClose={close} wide>
      <div
        className="io-body te-body"
        onKeyDown={(e) => {
          if (!(e.ctrlKey || e.metaKey)) return;
          const key = e.key.toLowerCase();
          if (key === 'z') {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
          } else if (key === 'y') {
            e.preventDefault();
            redo();
          }
        }}
      >
        <div className="te-stage">
          <div className="te-canvas">
            <GridCanvas grid={grid} k={k} colour={colour} onStart={onStart} onMove={onMove} onEnd={onEnd} />
          </div>
          <div className="te-side">
            <div className="te-preview" aria-label="How the brush looks">
              {spec ? (
                <>
                  <span className="te-tip">
                    <PixelTip spec={spec} w={32} h={32} />
                  </span>
                  <span className="te-stroke">
                    <PixelStroke spec={spec} h={64} />
                  </span>
                </>
              ) : (
                <span className="io-muted">Draw something to see the brush.</span>
              )}
            </div>
            <Choice<Tool>
              label="Tool"
              value={tool}
              options={[
                { value: 'draw', label: 'Draw', title: 'Click or drag to paint cells. Right-click to rub one out.' },
                { value: 'erase', label: 'Rub out', title: 'Click or drag to clear cells.' },
                { value: 'fill', label: 'Fill', title: 'Fill the patch of matching cells you click.' },
              ]}
              onChange={setTool}
            />
            <Choice<'shape' | 'colours'>
              label="Paints"
              value={colour ? 'colours' : 'shape'}
              options={[
                { value: 'shape', label: 'In my colour', title: 'Only the shape counts. The brush paints it in the colour you have picked, so it works like any other brush.' },
                { value: 'colours', label: 'Its own colours', title: 'The brush stamps the picture as drawn here. It needs two or more colours to look different from the other choice.' },
              ]}
              onChange={(v) => setColour(v === 'colours')}
            />
            {colour && (
              <label className="te-colour">
                <span>Colour to draw with</span>
                <input type="color" value={hex} onChange={(e) => setHex(rgbToHex(...hexToRgb(e.target.value)))} aria-label="Colour to draw with" />
              </label>
            )}
            <Slider label="Paint strength" value={strength} min={5} max={100} format={(v) => (v === 100 ? 'Full' : `${v}%`)} onChange={setStrength} hint="How much paint a cell lays down. Below full it is a soft shade, so a tip can have a gentle edge." />
            <Slider label="Width" value={grid.w} min={1} max={MAX_GRID} format={(v) => `${v} cells`} onChange={(v) => commit(resizeGrid(grid, v, grid.h))} />
            <Slider label="Height" value={grid.h} min={1} max={MAX_GRID} format={(v) => `${v} cells`} onChange={(v) => commit(resizeGrid(grid, grid.w, v))} />
            {colour && !several && <p className="io-muted te-note">One colour only, so it paints in your colour. Add a second to keep them.</p>}
          </div>
        </div>
        <div className="te-tools" role="toolbar" aria-label="Change the whole picture">
          <ActionButton onClick={() => commit(flipAcross(grid))} title="Flip left to right">Flip across</ActionButton>
          <ActionButton onClick={() => commit(flipDown(grid))} title="Flip top to bottom">Flip down</ActionButton>
          <ActionButton onClick={() => commit(turnRight(grid))} title="Turn a quarter clockwise">Turn</ActionButton>
          <ActionButton onClick={() => commit(shift(grid, -1, 0))} title="Move everything one cell left">Left</ActionButton>
          <ActionButton onClick={() => commit(shift(grid, 1, 0))} title="Move everything one cell right">Right</ActionButton>
          <ActionButton onClick={() => commit(shift(grid, 0, -1))} title="Move everything one cell up">Up</ActionButton>
          <ActionButton onClick={() => commit(shift(grid, 0, 1))} title="Move everything one cell down">Down</ActionButton>
          <ActionButton onClick={() => commit(invertShape(grid, paintCell()))} title="Swap paint and empty, so the shape becomes the gap">Swap paint and gaps</ActionButton>
          <ActionButton onClick={() => commit(harden(grid))} title="Make every shade full or empty, for crisp edges">Crisp edges</ActionButton>
          <ActionButton onClick={() => commit(newGrid(grid.w, grid.h))} title="Empty the whole grid">Clear</ActionButton>
          <ActionButton onClick={undo} disabled={!past.length} title="Undo the last change (Ctrl+Z)">Undo</ActionButton>
          <ActionButton onClick={redo} disabled={!future.length} title="Put back what you undid (Ctrl+Shift+Z)">Redo</ActionButton>
        </div>
        <div className="te-tools" role="toolbar" aria-label="Start from something else">
          <ActionButton
            onClick={() => void pickPictureTip((g, c) => { commit(g); setColour(c); })}
            title="Use a picture file (PNG, GIF, JPEG, WebP or BMP) as the start. It is shrunk to fit."
          >
            Start from a picture file...
          </ActionButton>
          <ActionButton onClick={() => makePixelBrush((s) => { commit(gridFromStamp(s)); setColour(s.keep); })} title="Use the pixels you have selected on the layer (up to 32 by 32)">
            Start from the selection
          </ActionButton>
        </div>
      </div>
      <div className="io-foot">
        <span className="io-muted te-size">{made ? `${made.stamp.w} by ${made.stamp.h} pixels` : 'Nothing drawn yet'}</span>
        <button type="button" className="io-btn" onClick={close}>
          Cancel
        </button>
        <button
          type="button"
          className="io-btn io-primary"
          data-autofocus=""
          disabled={!made || isEmpty(grid)}
          onClick={() => {
            if (!made) return;
            onDone(made);
            close();
          }}
        >
          Use this tip
        </button>
      </div>
    </Modal>
  );
}

/** Opens the editor on a tip (or a blank 16 by 16 grid). `onDone` gets the tip when you press the button. Returns a way to close it. */
export function openTipEditor(onDone: (t: EditedTip) => void, from?: PixelStamp | null, grid?: { grid: TipGrid; colour: boolean }): () => void {
  const start = grid?.grid ?? (from && from.w <= MAX_STAMP && from.h <= MAX_STAMP ? gridFromStamp(from) : newGrid(16, 16));
  const colour = grid?.colour ?? !!from?.keep;
  return mountModal((close) => <Editor start={start} startColour={colour} onDone={onDone} close={close} />);
}
