// Tool options for the pixel art tools, plus the mirror drawing controls every pixel painting tool shows.
import type { ComponentType } from 'react';
import { findLayer } from '../core/doc';
import { useStore } from '../core/store';
import { ActionButton, Choice, Slider, Tip, Toggle } from '../canvas/controls';
import { PlaneOption } from '../tools/options/ShapeOptions';
import { setToolSettings, useToolSettings } from '../tools/settings';
import { setPrefs, usePrefs } from '../ui/prefs';
import { usePaintWells } from '../tools/pixelWells';
import { clampOutline, MAX_OUTLINE, MIN_OUTLINE } from './thick';
import { DITHER_PATTERNS, type DitherPattern } from './dither';
import { setPixelSettings, usePixelSettings, type SymmetryMode } from './settings';
import { PenOptions } from '../tablet/PenOptions';
import './pixel.css';

export function useLayerKind(): 'vector' | 'pixel' {
  return useStore((s) => (findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1])?.kind === 'pixel' ? 'pixel' : 'vector');
}

export { MirrorOptions } from '../tools/options/MirrorOptions';
import { MirrorOptions } from '../tools/options/MirrorOptions';

function PixelPerfectToggle() {
  const perfect = useToolSettings((s) => s.pixelPerfect);
  return <Toggle label="Pixel perfect" checked={perfect} onChange={(v) => setToolSettings({ pixelPerfect: v })} hint="Tidies the corners of hand-drawn lines so they stay one pixel thick (no doubled L-shaped corners)." />;
}

function SizeSlider() {
  const size = useToolSettings((s) => s.pixelBrushSize);
  return <Slider label="Size" value={size} min={1} max={24} format={(v) => `${v} pixel${v === 1 ? '' : 's'}`} onChange={(v) => setToolSettings({ pixelBrushSize: v })} />;
}

export function PixelPencilOptions() {
  return (
    <div className="cv-options">
      <SizeSlider />
      <PixelPerfectToggle />
      <PenOptions tool="shade" size />
      <MirrorOptions />
      <PenOptions tool="pencil" size />
      <Tip>Size 1 is the plain pencil, and bigger sizes are the same pencil with a thicker tip. Hold Shift and click to draw a straight line from where you last stopped.</Tip>
    </div>
  );
}

/**
 * Outline thickness for pixel shapes. These change the same preferences as Preferences > General, so the choice is
 * reachable right where you draw. `show` is false when a shape has no outline to thicken.
 */
export function PixelOutlineOptions({ show = true }: { show?: boolean }) {
  const on = usePrefs((p) => p.pixelThickOutlines);
  const width = usePrefs((p) => p.pixelOutlineWidth);
  if (!show) return null;
  return (
    <>
      <Toggle label="Thicker outline" checked={on} onChange={(v) => setPrefs({ pixelThickOutlines: v })} hint="Gives the outline more than one pixel. Also in Preferences." />
      {on && <Slider label="Outline thickness" value={width} min={MIN_OUTLINE} max={MAX_OUTLINE} format={(v) => `${v} pixel${v === 1 ? '' : 's'}`} onChange={(v) => setPrefs({ pixelOutlineWidth: clampOutline(v) })} />}
    </>
  );
}

export function PixelShapeOptions() {
  const tool = useStore((s) => s.ui.tool);
  const strokeOn = useStore((s) => s.ui.strokeOn);
  const paintWells = usePaintWells();
  const filled = usePixelSettings((s) => s.shapeFilled);
  return (
    <div className="cv-options">
      {paintWells && tool !== 'line' && <Toggle label="Filled" checked={filled} onChange={(v) => setPixelSettings({ shapeFilled: v })} hint="Fills the inside of the shape with Paint too. Off draws just the outline." />}
      <PlaneOption show={tool !== 'line'} />
      <PixelOutlineOptions show={tool === 'line' || strokeOn} />
      <MirrorOptions />
      <Tip>{paintWells ? 'Shapes are drawn in Paint, as an outline, or filled when Filled is on.' : 'On a pixel layer, shapes have a one pixel outline unless you turn on Thicker outline: the stroke colour round the edge and the fill colour inside (set either to none).'} Shift makes a square or a circle, and snaps lines to clean pixel steps. Alt draws from the middle.</Tip>
    </div>
  );
}

export function ShadeOptions() {
  const lighter = usePixelSettings((s) => s.shadeLighter);
  return (
    <div className="cv-options">
      <Choice
        label="Each pass makes it"
        value={lighter ? 'light' : 'dark'}
        options={[
          { value: 'light', label: 'Lighter' },
          { value: 'dark', label: 'Darker' },
        ]}
        onChange={(v) => setPixelSettings({ shadeLighter: v === 'light' })}
      />
      <SizeSlider />
      <PixelPerfectToggle />
      <MirrorOptions />
      <Tip>Shading moves each pixel one step along its colour ramp in the Palette panel. Go over it again to go further. Pixels that aren't palette colours are left alone.</Tip>
    </div>
  );
}

export function SprayOptions() {
  const size = usePixelSettings((s) => s.spraySize);
  return (
    <div className="cv-options">
      <Slider label="Size" value={size} min={2} max={32} format={(v) => `${v} pixels across`} onChange={(v) => setPixelSettings({ spraySize: v })} />
      <MirrorOptions />
      <Tip>A sprinkle of the Paint colour. Drag slowly to build it up, or quickly to keep it light.</Tip>
      <PenOptions tool="spray" size flow />
    </div>
  );
}

function PatternSwatch({ rows }: { rows: string[] }) {
  return (
    <span className="px-pattern" aria-hidden="true">
      {rows.join('').split('').map((c, i) => (
        <span key={i} data-on={c === '1'} />
      ))}
    </span>
  );
}

export function DitherOptions() {
  const pattern = usePixelSettings((s) => s.ditherPattern);
  const size = usePixelSettings((s) => s.ditherSize);
  return (
    <div className="cv-options">
      <div className="cv-field">
        <div className="cv-field-head">
          <span className="cv-field-label">Pattern</span>
        </div>
        <div className="px-patterns" role="radiogroup" aria-label="Dither pattern">
          {DITHER_PATTERNS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={p.id === pattern} data-on={p.id === pattern} className="px-pattern-btn" title={p.label} aria-label={p.label} onClick={() => setPixelSettings({ ditherPattern: p.id as DitherPattern })}>
              <PatternSwatch rows={p.preview} />
            </button>
          ))}
        </div>
      </div>
      <Slider label="Size" value={size} min={1} max={32} format={(v) => `${v} pixel${v === 1 ? '' : 's'}`} onChange={(v) => setPixelSettings({ ditherSize: v })} />
      <MirrorOptions />
      <PenOptions tool="dither" size />
      <Tip>The dark squares above take the stroke colour, the light ones the fill colour. Set the fill to none to leave those pixels as they are.</Tip>
    </div>
  );
}

/** Shows `vector` options on vector layers and `pixel` ones on pixel layers. */
export function byLayerKind(vector: ComponentType | undefined, pixel: ComponentType): ComponentType {
  const Both = () => {
    const kind = useLayerKind();
    if (kind === 'pixel') {
      const P = pixel;
      return <P />;
    }
    const V = vector;
    return V ? <V /> : null;
  };
  return Both;
}

/** A tool's own options with the mirror controls added underneath on pixel layers. */
export function withMirror(own: ComponentType | undefined): ComponentType {
  const With = () => {
    const kind = useLayerKind();
    const O = own;
    return (
      <>
        {O && <O />}
        {kind === 'pixel' && (
          <div className="cv-options px-extra">
            <MirrorOptions />
          </div>
        )}
      </>
    );
  };
  return With;
}
