// The Palette panel: the document's pixel art palette, laid out in ramps. Click a colour to paint with it; drag to
// reorder; right-click for more. Also the palette lock for the active pixel layer, starter palettes and palette files.
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { findLayer } from '../core/doc';
import type { DocPalette } from '../core/format';
import { store, useStore } from '../core/store';
import { ActionButton, Toggle } from '../canvas/controls';
import { activeColor, setActiveColor } from '../tools/wells';
import { noteColorUsed } from '../tools/recent';
import { STARTER_PALETTES } from './builtin';
import { changePaletteColor, reduceActiveToPalette, setDocPalette, togglePaletteLock } from './commands';
import { exportPalette, importPalette, paletteFromDrawing } from './palette-files';
import { colorUse, docPalette, insertColor, makeRamp, moveColor, paletteRgb, ramps, removeColor, toggleRampStart } from './palette';
import type { PaletteFormat } from './palette-io';
import '../canvas/canvas.css';
import './pixel.css';
import { usePopover } from '../ui/popover';

interface Menu {
  index: number;
  x: number;
  y: number;
}

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.slice(0, 7).toLowerCase() === b.slice(0, 7).toLowerCase();

function useActivePixelLayer() {
  return useStore((s) => {
    const l = findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
    return l?.kind === 'pixel' ? l : null;
  });
}

/** Opens the system colour picker on a palette colour; the pixels follow when it closes (one undo step). */
function editColor(index: number, current: string): void {
  const input = document.createElement('input');
  input.type = 'color';
  input.value = current.slice(0, 7);
  input.style.position = 'fixed';
  input.style.opacity = '0';
  input.style.pointerEvents = 'none';
  input.addEventListener('change', () => {
    changePaletteColor(index, input.value);
    input.remove();
  });
  input.addEventListener('blur', () => setTimeout(() => input.remove(), 500));
  document.body.appendChild(input);
  input.click();
}

function ChipMenu({ menu, palette, onClose }: { menu: Menu; palette: DocPalette; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const color = palette.colors[menu.index];
  const front = useStore((s) => activeColor(s.ui) ?? s.ui.color);
  useEffect(() => {
    const away = (e: Event) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [onClose]);
  usePopover(ref, onClose);
  if (!color) return null;
  const startsRamp = (palette.ramps ?? []).includes(menu.index);
  const item = (label: string, run: () => void, danger = false, disabled = false) => (
    <button
      type="button"
      role="menuitem"
      className={`cv-menu-item${danger ? ' cv-danger' : ''}`}
      disabled={disabled}
      onClick={() => {
        run();
        onClose();
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="cv-menu px-menu" ref={ref} role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 280) }}>
      <div className="px-menu-head">
        <span className="px-menu-chip" style={{ backgroundColor: color }} />
        <span>{color}</span>
      </div>
      {item('Use for lines (stroke)', () => {
        store().setUi({ color, strokeOn: true });
        noteColorUsed(color);
      })}
      {item('Use for the bucket (fill)', () => {
        store().setUi({ fillColor: color });
        noteColorUsed(color);
      })}
      {item('Change colour...', () => editColor(menu.index, color))}
      {item(`Set to the current colour (${front})`, () => changePaletteColor(menu.index, front), false, same(front, color))}
      {menu.index > 0 && item(startsRamp ? 'Join the ramp before' : 'Start a new ramp here', () => setDocPalette(toggleRampStart(palette, menu.index), 'Change ramps'))}
      {item('Remove from palette', () => setDocPalette(removeColor(palette, menu.index), 'Remove palette colour'), true, palette.colors.length <= 1)}
    </div>
  );
}

export function PalettePanel() {
  const doc = useStore((s) => s.doc);
  const palette = docPalette(doc);
  const stroke = useStore((s) => s.ui.color);
  const fill = useStore((s) => s.ui.fillColor);
  const front = useStore((s) => activeColor(s.ui) ?? s.ui.color);
  const layer = useActivePixelLayer();
  const frame = useStore((s) => s.ui.frame);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [name, setName] = useState(palette.name);
  useEffect(() => setName(palette.name), [palette.name]);

  // Which palette colours the current frame uses, for the little dots.
  const drawing = layer ? (() => {
    const cel = layer.cels.find((c) => frame >= c.start && frame < c.start + c.length);
    const d = cel ? doc.drawings[cel.drawingId] : undefined;
    return d?.kind === 'pixel' ? d : null;
  })() : null;
  const used = useMemo(() => {
    const counts = new Uint32Array(palette.colors.length);
    if (drawing) colorUse(drawing.pixels, paletteRgb(palette.colors), counts);
    return counts;
  }, [drawing, palette.colors]);

  const has = palette.colors.some((c) => same(c, front));
  const onDrop = (to: number) => (e: DragEvent) => {
    e.preventDefault();
    if (drag !== null && drag !== to) setDocPalette(moveColor(palette, drag, to), 'Move palette colour');
    setDrag(null);
    setOver(null);
  };
  const renameTo = () => {
    const n = name.trim();
    if (n && n !== palette.name) setDocPalette({ ...palette, name: n }, 'Rename palette');
    else setName(palette.name);
  };

  return (
    <div className="cv-panel px-palette" data-help="palette">
      <div className="px-palette-top">
        <input className="cv-hex-input px-palette-name" value={name} aria-label="Palette name" spellCheck={false} onChange={(e) => setName(e.target.value)} onBlur={renameTo} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        <span className="px-palette-count" title="Colours in this palette">
          {palette.colors.length}
        </span>
      </div>

      <div className="px-ramps" role="list" aria-label="Palette colours, in ramps">
        {ramps(palette).map(([s, e]) => (
          <div className="px-ramp" role="listitem" key={s}>
            {palette.colors.slice(s, e).map((c, k) => {
              const i = s + k;
              return (
                <button
                  key={i}
                  type="button"
                  className="px-chip"
                  style={{ backgroundColor: c }}
                  draggable
                  data-on={same(c, front)}
                  aria-pressed={same(c, front)}
                  data-over={over === i}
                  title={`${c}. Click to paint with it, double-click to change it, right-click for more.`}
                  aria-label={`Palette colour ${i + 1}, ${c}${same(c, stroke) ? ', the stroke colour' : ''}${same(c, fill) ? ', the fill colour' : ''}`}
                  onClick={() => {
                    setActiveColor(c);
                    noteColorUsed(c);
                  }}
                  onDoubleClick={() => editColor(i, c)}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    setMenu({ index: i, x: ev.clientX, y: ev.clientY });
                  }}
                  onDragStart={(ev) => {
                    setDrag(i);
                    ev.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(ev) => {
                    if (drag === null) return;
                    ev.preventDefault();
                    setOver(i);
                  }}
                  onDragLeave={() => setOver((o) => (o === i ? null : o))}
                  onDrop={onDrop(i)}
                  onDragEnd={() => {
                    setDrag(null);
                    setOver(null);
                  }}
                >
                  {same(c, stroke) && <span className="px-chip-mark px-chip-s" aria-hidden="true">S</span>}
                  {same(c, fill) && <span className="px-chip-mark px-chip-f" aria-hidden="true">F</span>}
                  {used[i] > 0 && <span className="px-chip-used" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="px-row">
        <ActionButton disabled={has || palette.colors.length >= 256} title={has ? 'The current colour is already in the palette' : 'Add the current colour to the end of the palette'} onClick={() => setDocPalette(insertColor(palette, front), 'Add palette colour')}>
          + Add colour
        </ActionButton>
        <ActionButton
          disabled={palette.colors.length > 251}
          title="Add five shades of the current colour, dark to light, as a new ramp"
          onClick={() => {
            const start = palette.colors.length;
            const next: DocPalette = { ...palette, colors: [...palette.colors, ...makeRamp(front, 5)], ramps: [...(palette.ramps ?? []), ...(start > 0 ? [start] : [])] };
            setDocPalette(next, 'Add ramp');
          }}
        >
          + Add ramp
        </ActionButton>
      </div>

      <div className="px-row px-wrap">
        <select
          className="px-select"
          aria-label="Starter palettes"
          value=""
          onChange={(e) => {
            const p = STARTER_PALETTES.find((x) => x.id === e.target.value);
            if (p) setDocPalette(structuredClone(p.palette), 'Use starter palette');
          }}
        >
          <option value="">Starter palettes...</option>
          {STARTER_PALETTES.map((p) => (
            <option key={p.id} value={p.id} title={p.blurb}>
              {p.palette.name} ({p.palette.colors.length}): {p.blurb}
            </option>
          ))}
        </select>
        <ActionButton onClick={() => void importPalette()} title="Load a .gpl, .hex or .pal palette, or take the colours from a picture">
          Load...
        </ActionButton>
        <select
          className="px-select"
          aria-label="Save palette as"
          value=""
          onChange={(e) => {
            if (e.target.value) void exportPalette(e.target.value as PaletteFormat);
          }}
        >
          <option value="">Save as...</option>
          <option value="gpl">GIMP palette (.gpl)</option>
          <option value="hex">Hex list (.hex)</option>
          <option value="pal">JASC palette (.pal)</option>
        </select>
        <ActionButton disabled={!drawing} onClick={paletteFromDrawing} title="Make a palette from the colours in the drawing on this frame">
          From drawing
        </ActionButton>
      </div>

      {layer ? (
        <div className="px-lock">
          <Toggle label="Lock this layer to the palette" checked={!!layer.paletteLock} onChange={togglePaletteLock} hint="Everything you paint on this layer snaps to the nearest palette colour." />
          <ActionButton disabled={!drawing} onClick={() => void reduceActiveToPalette()} title="Change every pixel on this frame to its nearest palette colour">
            Reduce this frame to the palette
          </ActionButton>
        </div>
      ) : (
        <p className="cv-tip">The palette lock and shading work on pixel layers. Pick or add a pixel layer to use them.</p>
      )}
      {!doc.palette && <p className="cv-tip">This is the starter palette. Change anything and it's saved with your document.</p>}

      {menu && <ChipMenu menu={menu} palette={palette} onClose={() => setMenu(null)} />}
    </div>
  );
}
