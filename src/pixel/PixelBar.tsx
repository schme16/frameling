// The pixel bar: a slim strip over the canvas in the Pixel workspace with what pixel art reaches for all the time.
// Brush size and shape, pixel perfect, the select modes, mirror drawing, onion skin, tile mode, the pixel grid, and
// which palette colour you're painting with when the layer is locked to the palette.
import type { ReactNode } from 'react';
import { findLayer } from '../core/doc';
import { getCommand } from '../core/registry';
import { store, useStore } from '../core/store';
import { useViewSettings } from '../canvas/viewSettings';
import { setSelectSettings, useSelectSettings, type SelectMode } from '../select/settings';
import { useTileUi } from '../tiles/state';
import { setToolSettings, useToolSettings } from '../tools/settings';
import { activeColor } from '../tools/wells';
import { dock, inPixelWorkspace, showPanel } from '../ui/dock';
import { Icon } from '../ui/icons';
import { BAR_SIZES, hasMirror, hasPerfect, hasShape, paletteIndexOf, sizeSettingFor } from './bar';
import { docPalette } from './palette';
import { setPixelSettings, usePixelSettings, type SymmetryMode } from './settings';
import './pixel.css';

const run = (id: string) => void getCommand(id)?.run();

function Btn({ on, title, onClick, children, label, command, wide }: { on?: boolean; title: string; onClick: () => void; children: ReactNode; label?: string; command?: string; wide?: boolean }) {
  return (
    <button type="button" className={`px-bar-btn${wide ? ' is-wide' : ''}`} data-on={on ? 'true' : undefined} aria-pressed={on === undefined ? undefined : on} aria-label={label ?? title} title={title} data-command={command} onClick={onClick}>
      {children}
    </button>
  );
}

const Sep = () => <span className="px-bar-sep" aria-hidden="true" />;

function SizeButtons({ tool }: { tool: string }) {
  const which = sizeSettingFor(tool);
  const brush = useToolSettings((s) => s.pixelBrushSize);
  const eraser = useToolSettings((s) => s.eraserPixelSize);
  const dither = usePixelSettings((s) => s.ditherSize);
  const spray = usePixelSettings((s) => s.spraySize);
  if (!which) return null;
  const value = which === 'pixelBrushSize' ? brush : which === 'eraserPixelSize' ? eraser : which === 'spraySize' ? spray : dither;
  const pick = (n: number) => {
    if (which === 'ditherSize' || which === 'spraySize') setPixelSettings({ [which]: n });
    else setToolSettings({ [which]: n });
  };
  return (
    <div className="px-bar-group" role="radiogroup" aria-label="Brush size in pixels">
      <span className="px-bar-label">Size</span>
      {BAR_SIZES.map((n) => (
        <button key={n} type="button" role="radio" className="px-bar-size" aria-checked={value === n} data-on={value === n ? 'true' : undefined} title={`${n} pixel${n === 1 ? '' : 's'}${tool === 'pencil' && n === 1 ? ' (the plain pencil)' : ''}`} onClick={() => pick(n)}>
          {n}
        </button>
      ))}
      {value > 8 && <span className="px-bar-more">{value}</span>}
    </div>
  );
}

function ShapeButtons() {
  const shape = useToolSettings((s) => s.pixelBrushShape);
  return (
    <div className="px-bar-group" role="radiogroup" aria-label="Brush shape">
      <Btn on={shape === 'square'} title="Square brush" onClick={() => setToolSettings({ pixelBrushShape: 'square' })}>
        <span className="px-bar-shape is-square" aria-hidden="true" />
      </Btn>
      <Btn on={shape === 'round'} title="Round brush (shows from size 3)" onClick={() => setToolSettings({ pixelBrushShape: 'round' })}>
        <span className="px-bar-shape is-round" aria-hidden="true" />
      </Btn>
    </div>
  );
}

const SELECT_MODES: { mode: SelectMode; icon: string; title: string; command: string }[] = [
  { mode: 'box', icon: 'select', title: 'Select with a box', command: 'select.box' },
  { mode: 'lasso', icon: 'lasso', title: 'Lasso: draw round what you want', command: 'select.lasso' },
  { mode: 'wand', icon: 'wand', title: 'Magic wand: pick pixels by colour', command: 'select.wand' },
];

function SelectModes() {
  const mode = useSelectSettings((s) => s.mode);
  return (
    <div className="px-bar-group" role="radiogroup" aria-label="How to select">
      {SELECT_MODES.map((m) => (
        <Btn key={m.mode} on={mode === m.mode} title={m.title} command={m.command} onClick={() => setSelectSettings({ mode: m.mode })}>
          <Icon name={m.icon} size={16} />
        </Btn>
      ))}
    </div>
  );
}

const MIRRORS: { value: SymmetryMode; text: string; title: string }[] = [
  { value: 'h', text: '⇆', title: 'Mirror left and right' },
  { value: 'v', text: '⇅', title: 'Mirror top and bottom' },
  { value: 'both', text: '✛', title: 'Mirror both ways' },
];

function MirrorButtons() {
  const sym = usePixelSettings((s) => s.symmetry);
  return (
    <div className="px-bar-group" role="group" aria-label="Mirror drawing">
      <Icon name="mirror" size={16} />
      {MIRRORS.map((m) => (
        <Btn key={m.value} on={sym === m.value} title={`${m.title} (click again to turn off). Shift+M cycles.`} label={m.title} onClick={() => setPixelSettings({ symmetry: sym === m.value ? 'off' : m.value })}>
          <span className="px-bar-glyph" aria-hidden="true">{m.text}</span>
        </Btn>
      ))}
    </div>
  );
}

function PaletteIndex() {
  const locked = useStore((s) => {
    const l = findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
    return l?.kind === 'pixel' && !!l.paletteLock;
  });
  const palette = useStore((s) => docPalette(s.doc));
  const color = useStore((s) => activeColor(s.ui) ?? s.ui.color);
  if (!locked) return null;
  const at = paletteIndexOf(palette, color);
  if (!at) return null;
  const swatch = palette.colors[at.index];
  const text = at.exact ? `Colour ${at.index + 1}/${palette.colors.length}` : `Snaps to ${at.index + 1}`;
  return (
    <span className="px-bar-index" role="status" title={at.exact ? `You're painting with palette colour ${at.index + 1} (index ${at.index}). This layer is locked to the palette.` : `This colour isn't in the palette, so on this locked layer it paints as colour ${at.index + 1} (index ${at.index}), the nearest one.`} data-help="palette-lock">
      <span className="px-bar-chip" style={{ backgroundColor: swatch }} aria-hidden="true" />
      {text}
    </span>
  );
}

export function PixelBar() {
  const wsId = dock.use((d) => d.workspaceId);
  const pixelLayer = useStore((s) => (findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1])?.kind === 'pixel');
  const tool = useStore((s) => s.ui.tool);
  const perfect = useToolSettings((s) => s.pixelPerfect);
  const onion = useStore((s) => s.ui.onion.enabled);
  const tiles = useTileUi((s) => s.tileMode);
  const grid = useViewSettings((v) => v.pixelGrid);
  if (!wsId || !inPixelWorkspace() || !pixelLayer) return null;
  return (
    <div className="px-bar" role="toolbar" aria-label="Pixel art options" data-help="pixel-bar">
      <SizeButtons tool={tool} />
      {hasShape(tool) && <ShapeButtons />}
      {hasPerfect(tool) && (
        <Btn on={perfect} wide title="Pixel perfect: tidies corners so hand-drawn lines stay one pixel thick" label="Pixel perfect" onClick={() => setToolSettings({ pixelPerfect: !perfect })}>
          Pixel perfect
        </Btn>
      )}
      {tool === 'pixel-select' && <SelectModes />}
      {hasMirror(tool) && (
        <>
          <Sep />
          <MirrorButtons />
        </>
      )}
      <Sep />
      <Btn on={onion} title="Onion skin: see the frames before and after (Shift+O)" label="Onion skin" command="timeline.toggleOnion" onClick={() => run('timeline.toggleOnion')}>
        <Icon name="onion" size={16} />
      </Btn>
      <Btn on={tiles} title="Tile mode: repeat the drawing round the edges, for seamless tiles (Shift+T)" label="Tile mode" command="tiles.tileMode" onClick={() => run('tiles.tileMode')}>
        <Icon name="tile-mode" size={16} />
      </Btn>
      <Btn on={grid} title="Pixel grid: lines between pixels when you zoom in" label="Pixel grid" command="view.pixelGrid" onClick={() => run('view.pixelGrid')}>
        <Icon name="grid" size={16} />
      </Btn>
      <PaletteIndex />
      <span className="px-bar-fill" />
      <Btn title="All the options for this tool" label="More tool options" onClick={() => showPanel('tool-options')}>
        <Icon name="sliders" size={16} />
      </Btn>
    </div>
  );
}
