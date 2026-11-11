import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { uid } from '../../core/doc';
import { store, useStore } from '../../core/store';
import { noteColorUsed, useRecentColors } from '../../tools/recent';
import { hexToHsv, hsvToHex, parseHex, toHex, type HSV } from '../colors';
import '../canvas.css';
import { activeColor, setActiveColor } from '../../tools/wells';
import { Wells } from './Wells';
import { GradientEditor } from './GradientEditor';
import { setStopColor, stopColor, useGradientWells, wellGradient } from '../../tools/gradient-wells';
import { openRecolour } from '../../tools/recolour-open';
import { usePopover } from '../../ui/popover';

// Every colour change goes to whichever box is in front (fill or stroke), and to selected shapes. When that box
// holds a gradient, it changes the gradient colour being edited instead.
function setColor(c: string): void {
  const w = store().get().ui.activeWell;
  if (wellGradient(w)) setStopColor(w, c);
  else setActiveColor(c);
}

/** Turns a drag on an element into 0..1 positions, with pointer capture so it keeps working outside the box. */
function useDrag(onMove: (x: number, y: number) => void, onEnd?: () => void) {
  const drag = useRef(false);
  const read = (e: RPointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onMove(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
  };
  return {
    onPointerDown: (e: RPointerEvent<HTMLElement>) => {
      drag.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      read(e);
    },
    onPointerMove: (e: RPointerEvent<HTMLElement>) => {
      if (drag.current) read(e);
    },
    onPointerUp: () => {
      if (drag.current) onEnd?.();
      drag.current = false;
    },
  };
}

function noteNow(): void {
  const c = activeColor();
  if (c) noteColorUsed(c);
}

function Picker({ color }: { color: string }) {
  // The hue and saturation are kept here because greys and blacks have no hue of their own: dragging down to black
  // shouldn't throw the hue away.
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(color) ?? { h: 0, s: 0, v: 0 });
  useEffect(() => {
    if (hsvToHex(hsv).toLowerCase() !== color.slice(0, 7).toLowerCase()) {
      const next = hexToHsv(color);
      if (next) setHsv(next);
    }
    // only when the colour changes from outside
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);
  const apply = (n: HSV) => {
    setHsv(n);
    setColor(hsvToHex(n));
  };
  const sv = useDrag(
    (x, y) => apply({ ...hsv, s: x, v: 1 - y }),
    () => noteNow(),
  );
  const hue = useDrag(
    (x) => apply({ ...hsv, h: x * 360 }),
    () => noteNow(),
  );
  const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  return (
    <div className="cv-picker">
      <div className="cv-sv" style={{ backgroundColor: pure }} {...sv} role="slider" aria-label="Saturation and brightness" aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`} tabIndex={0}
        onKeyDown={(e) => {
          const d = e.shiftKey ? 0.1 : 0.02;
          const m: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] };
          const k = m[e.key];
          if (!k) return;
          e.preventDefault();
          apply({ ...hsv, s: Math.min(1, Math.max(0, hsv.s + k[0])), v: Math.min(1, Math.max(0, hsv.v + k[1])) });
        }}>
        <div className="cv-sv-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: hsvToHex(hsv) }} />
      </div>
      <div className="cv-hue" {...hue} role="slider" aria-label="Hue" aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv.h)} tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          apply({ ...hsv, h: (hsv.h + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 20 : 4) + 360) % 360 });
        }}>
        <div className="cv-hue-knob" style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: pure }} />
      </div>
    </div>
  );
}

function HexField({ color }: { color: string }) {
  const [text, setText] = useState(color);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(color);
    setBad(false);
  }, [color]);
  const commit = (v: string) => {
    const c = parseHex(v);
    if (!c) return setBad(true);
    setBad(false);
    const hex = toHex(c[0], c[1], c[2], c[3]);
    setColor(hex);
    setText(hex);
    noteColorUsed(hex);
  };
  return (
    <label className="cv-hex">
      <span className="cv-field-label">Hex</span>
      <input
        className="cv-hex-input"
        value={text}
        spellCheck={false}
        aria-invalid={bad}
        aria-label="Colour as hex, like #ff9e6d"
        data-bad={bad}
        onChange={(e) => {
          setText(e.target.value);
          const c = parseHex(e.target.value);
          setBad(!c && e.target.value.length > 3);
          if (c && /^#?([0-9a-f]{6}|[0-9a-f]{8})$/i.test(e.target.value.trim())) setColor(toHex(c[0], c[1], c[2], c[3]));
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        }}
      />
    </label>
  );
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
    <div className="cv-menu" ref={ref} style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 130) }} role="menu">
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
        role="menuitem"
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
  useGradientWells((s) => s[well]);
  useGradientWells((s) => s.stop[well]);
  const color = stopColor(well) ?? plain;
  const swatches = useStore((s) => s.doc.swatches);
  const recent = useRecentColors();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const has = swatches.some((s) => s.color.toLowerCase() === color.toLowerCase());
  return (
    <div className="cv-panel cv-colors">
      <Wells />
      <Picker color={color} />
      <HexField color={color} />
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
            style={{ backgroundColor: s.color }}
            title={`${s.name} (${s.color}). Right-click to rename or remove.`}
            aria-label={`${s.name}, ${s.color}`}
            onClick={() => {
              setColor(s.color);
              noteColorUsed(s.color);
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
              <button key={c} type="button" className="cv-swatch" data-on={c === color.toLowerCase()} aria-pressed={c === color.toLowerCase()} style={{ backgroundColor: c }} title={c} aria-label={`Recent colour ${c}`} onClick={() => setColor(c)} />
            ))}
          </div>
        </>
      )}
      <button type="button" className="cv-action cv-recolour-open" title="Swap one colour for another everywhere: every frame, every layer, vector and pixel (palette swap)" onClick={openRecolour}>
        Recolour the whole animation...
      </button>
      {menu && <SwatchMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
