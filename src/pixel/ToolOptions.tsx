// Tool options for the pixel art tools, plus the mirror drawing controls every pixel painting tool shows.
import type { ComponentType } from 'react';
import { findLayer } from '../core/doc';
import { useStore } from '../core/store';
import { ActionButton, Choice, Slider, Tip, Toggle } from '../canvas/controls';
import { setToolSettings, useToolSettings } from '../tools/settings';
import { DITHER_PATTERNS, type DitherPattern } from './dither';
import { setPixelSettings, usePixelSettings, type SymmetryMode } from './settings';
import './pixel.css';

function useLayerKind(): 'vector' | 'pixel' {
  return useStore((s) => (findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1])?.kind === 'pixel' ? 'pixel' : 'vector');
}

function useGrid(): { w: number; h: number } {
  const w = useStore((s) => {
    const l = findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
    return l?.kind === 'pixel' ? Math.ceil(s.doc.width / l.pixelSize) : 0;
  });
  const h = useStore((s) => {
    const l = findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
    return l?.kind === 'pixel' ? Math.ceil(s.doc.height / l.pixelSize) : 0;
  });
  return { w, h };
}

/** Mirror drawing: off, left and right, top and bottom, or all four ways, and where the mirror lines sit. */
export function MirrorOptions() {
  const mode = usePixelSettings((s) => s.symmetry);
  const ax = usePixelSettings((s) => s.axisX);
  const ay = usePixelSettings((s) => s.axisY);
  const { w, h } = useGrid();
  const fmt = (v: number) => (Number.isInteger(v) ? `${v}` : `${Math.floor(v)}½`);
  return (
    <div className="px-mirror">
      <Choice<SymmetryMode>
        label="Mirror drawing"
        value={mode}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'h', label: 'Left and right', title: 'Whatever you draw on one side appears flipped on the other (a mirror line down the middle).' },
          { value: 'v', label: 'Top and bottom', title: 'A mirror line across the middle.' },
          { value: 'both', label: 'Both ways', title: 'Four ways at once, like a snowflake.' },
        ]}
        onChange={(v) => setPixelSettings({ symmetry: v })}
      />
      {mode !== 'off' && w > 0 && (
        <>
          {(mode === 'h' || mode === 'both') && (
            <Slider label="Mirror line across" value={ax ?? w / 2} min={0.5} max={w - 0.5} step={0.5} format={(v) => (ax === null ? `Middle (${fmt(v)})` : fmt(v))} onChange={(v) => setPixelSettings({ axisX: v })} />
          )}
          {(mode === 'v' || mode === 'both') && (
            <Slider label="Mirror line down" value={ay ?? h / 2} min={0.5} max={h - 0.5} step={0.5} format={(v) => (ay === null ? `Middle (${fmt(v)})` : fmt(v))} onChange={(v) => setPixelSettings({ axisY: v })} />
          )}
          {(ax !== null || ay !== null) && <ActionButton onClick={() => setPixelSettings({ axisX: null, axisY: null })}>Back to the middle</ActionButton>}
        </>
      )}
    </div>
  );
}

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
      <PixelPerfectToggle />
      <MirrorOptions />
      <Tip>The pencil always draws one pixel. Hold Shift and click to draw a straight line from where you last stopped.</Tip>
    </div>
  );
}

export function PixelShapeOptions() {
  return (
    <div className="cv-options">
      <MirrorOptions />
      <Tip>On a pixel layer, shapes are one pixel thick: the stroke colour round the edge and the fill colour inside (set either to none). Shift makes a square or a circle, and snaps lines to clean pixel steps. Alt draws from the middle.</Tip>
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
