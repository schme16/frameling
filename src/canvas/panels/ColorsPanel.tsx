import { useEffect, useRef, useState } from 'react';
import { uid } from '../../core/doc';
import { store, useStore } from '../../core/store';
import { noteColorUsed, useRecentColors } from '../../tools/recent';
import '../canvas.css';
import { activeColor, setActiveColor } from '../../tools/wells';
import { Wells } from './Wells';
import { GradientEditor } from './GradientEditor';
import { endGradientGesture, paintView, setStopColor, stopColor, usePaintView, useGradientWells } from '../../tools/gradient-wells';
import { openRecolour } from '../../tools/recolour-open';
import { usePopover } from '../../ui/popover';
import { ColourPicker } from '../../ui/colour/ColourPicker';
import { chipBackground } from '../../ui/colour/chip';
import { usePaintRules } from '../../pixel/colourRules';

// Every colour change goes to whichever box is in front (fill or stroke), and to selected shapes. When the picked
// shapes share a gradient, or the box holds one, it changes the gradient colour being edited instead (the picked
// shapes' own gradient is theirs to change: the box is left as it was). A picked shape's plain colour is shown the same
// way, and a change to it goes to the shape and then the box.
function setColor(c: string): void {
  const w = store().get().ui.activeWell;
  const v = paintView(w);
  if (v.from === 'differ') return;
  if ('style' in v && v.style) setStopColor(w, c);
  else setActiveColor(c);
}

function noteNow(): void {
  const w = store().get().ui.activeWell;
  const c = stopColor(w) ?? activeColor();
  if (c) noteColorUsed(c);
  endGradientGesture();
}

interface MenuState {
  id: string;
  x: number;
  y: number;
}

function SwatchMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const sw = useStore((s) => s.doc.swatches.find((x) => x.id === menu.id));
  const [name, setName] = useState(sw?.name ?? '');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [onClose]);
  usePopover(ref, onClose);
  if (!sw) return null;
  const rename = () => {
    const n = name.trim();
    if (n && n !== sw.name) store().update('Rename swatch', (d) => void (d.swatches.find((x) => x.id === sw.id)!.name = n));
  };
  return (
    <div className="cv-menu" ref={ref} style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 130) }} role="group" aria-label="Swatch options">
      <label className="cv-menu-field">
        <span className="cv-field-label">Name</span>
        <input
          className="cv-hex-input"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              rename();
              onClose();
            }
          }}
          onBlur={rename}
        />
      </label>
      <button
        type="button"
        className="cv-menu-item cv-danger"
        onClick={() => {
          store().update('Remove swatch', (d) => void (d.swatches = d.swatches.filter((x) => x.id !== sw.id)));
          onClose();
        }}
      >
        Remove from swatches
      </button>
    </div>
  );
}

export function ColorsPanel() {
  // The picker shows the box in front. When that box is "none", show the stroke colour so the picker has a
  // starting point; picking any colour turns "none" off.
  const plain = useStore((s) => activeColor(s.ui) ?? s.ui.color);
  const well = useStore((s) => s.ui.activeWell);
  // Re-read when the gradient changes, so the picker follows the marker being edited.
  const view = usePaintView(well);
  useGradientWells((s) => s.stop[well]);
  const color = stopColor(well) ?? (view.from === 'colour' ? view.color : plain);
  const swatches = useStore((s) => s.doc.swatches);
  const recent = useRecentColors();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const rules = usePaintRules();
  const has = swatches.some((s) => s.color.toLowerCase() === color.toLowerCase());
  return (
    <div className="cv-panel cv-colors">
      <Wells />
      {view.from !== 'differ' && view.from !== 'colours' && <ColourPicker value={color} onChange={setColor} onEnd={noteNow} alpha={rules.alpha} why={rules.why} note={rules.note} />}
      <GradientEditor />

      <div className="cv-field-head">
        <span className="cv-field-label">Swatches</span>
      </div>
      <div className="cv-swatches">
        {swatches.map((s) => (
          <button
            key={s.id}
            type="button"
            className="cv-swatch"
            data-on={s.color.toLowerCase() === color.toLowerCase()}
            aria-pressed={s.color.toLowerCase() === color.toLowerCase()}
            style={chipBackground(s.color)}
            title={`${s.name} (${s.color}). Right-click to rename or remove.`}
            aria-label={`${s.name}, ${s.color}`}
            onClick={() => {
              setColor(s.color);
              noteColorUsed(s.color);
              endGradientGesture();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ id: s.id, x: e.clientX, y: e.clientY });
            }}
          />
        ))}
        <button
          type="button"
          className="cv-swatch cv-swatch-add"
          title={has ? 'This colour is already in your swatches' : 'Add the current colour to your swatches'}
          aria-label="Add current colour to swatches"
          disabled={has}
          onClick={() => store().update('Add swatch', (d) => void d.swatches.push({ id: uid('s'), name: color, color }))}
        >
          +
        </button>
      </div>

      {recent.length > 0 && (
        <>
          <div className="cv-field-head">
            <span className="cv-field-label">Recently used</span>
          </div>
          <div className="cv-swatches">
            {recent.map((c) => (
              <button key={c} type="button" className="cv-swatch" data-on={c === color.toLowerCase()} aria-pressed={c === color.toLowerCase()} style={chipBackground(c)} title={c} aria-label={`Recent colour ${c}`} onClick={() => {
                  setColor(c);
                  endGradientGesture();
                }} />
            ))}
          </div>
        </>
      )}
      <button type="button" className="cv-action cv-recolour-open" title="Recolour the whole animation: swap one colour for another everywhere, on every frame and every layer, vector and pixel (palette swap)" aria-label="Recolour the whole animation" onClick={() => openRecolour()}>
        <span className="cv-words-long">Recolour the whole animation...</span>
        <span className="cv-words-short" aria-hidden="true">
          Recolour all...
        </span>
      </button>
      {menu && <SwatchMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
