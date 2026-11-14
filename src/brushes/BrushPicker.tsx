// The brush picker: one button in the Brush options that drops a panel with the live controls, a search box, groups and
// every brush as a row with a stroke across it. The rules for what it lists are in library.ts, what it remembers is in
// picker.ts. Keyboard: arrows move the highlight, Enter picks, typing goes to the search box, Escape closes.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKey, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Slider } from '../canvas/controls';
import type { BrushSettings } from '../core/format';
import { store, useStore } from '../core/store';
import { usePopover } from '../ui/popover';
import {
  BOX,
  buildSections,
  flatten,
  foldableKeys,
  groupOf,
  moveHot,
  ROW_SCALE,
  rowKey,
  SMALL_LIBRARY,
  startKey,
  type Item,
  type RowStyle,
  type Section,
} from './library';
import {
  favouriteIds,
  flipRowStyle,
  openGroups,
  panelBox,
  pickerRequests,
  recentIds,
  rowScale,
  setOpenGroups,
  setPanelBox,
  setRowScale,
  takePickerRequest,
  toggleFavourite,
  usePicker,
  pickerVersion,
  useRowStyle,
} from './picker';
import { applyPreset, brushesVersion, currentBrushState, everyBrush, startNaming, useBrushPresets } from './presets';
import { Stroke } from './Stroke';
import './picker.css';

// ---------------------------------------------------------------- small pieces

const Svg = ({ children, size = 14 }: { children: ReactNode; size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const Chevron = ({ open }: { open: boolean }) => (
  <Svg>
    <path d={open ? 'M4 6l4 4 4-4' : 'M6 4l4 4-4 4'} />
  </Svg>
);
const Star = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
    <path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);
const Clock = () => (
  <Svg>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 5v3.2l2 1.3" />
  </Svg>
);
const Folder = () => (
  <Svg>
    <path d="M2 4.5a1 1 0 0 1 1-1h3l1.4 1.5H13a1 1 0 0 1 1 1V11.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
  </Svg>
);
const sectionIcon = (s: Section): ReactNode => (s.kind === 'favourites' ? <Star on /> : s.kind === 'recent' ? <Clock /> : <Folder />);

/** The round tip, as wide as the brush (up to a point), with the real size under it. */
export const tipDot = (size: number): number => Math.round(Math.min(26, Math.max(4, size * 0.9)));
const Tip = ({ size }: { size: number }) => (
  <span className="pk-tip" aria-hidden="true">
    <i style={{ width: tipDot(size), height: tipDot(size) }} />
    <b>{size}</b>
  </span>
);

// ---------------------------------------------------------------- the rows

interface RowProps {
  b: import('./model').BrushPreset;
  idx: number;
  on: boolean;
  hot: boolean;
  fav: boolean;
  rows: RowStyle;
  scale: number;
  /** The brush as it is now, for the row of the brush in use only, so its sample follows the sliders. */
  live?: BrushSettings;
  showGroup: boolean;
  onPick: (id: string) => void;
  onStar: (id: string) => void;
}

const Row = memo(function Row({ b, idx, on, hot, fav, rows, scale, live, showGroup, onPick, onStar }: RowProps) {
  const brush = live ?? b.brush;
  const tip = rows === 'tip';
  return (
    <div
      id={`pk-i${idx}`}
      role="option"
      aria-selected={on}
      className={`pk-row pk-row-${rows}`}
      data-on={on}
      data-hot={hot}
      title={`${b.name}, ${groupOf(b)}${b.builtin ? ', comes with Frameling' : ''}`}
      onClick={() => onPick(b.id)}
    >
      {tip && <Tip size={brush.size} />}
      <span className="pk-main">
        <Stroke brush={brush} h={Math.round((tip ? 30 : 26) * scale)} />
        <span className="pk-name">
          <span className="pk-name-text">{b.name}</span>
          {showGroup && <em>{groupOf(b)}</em>}
          {!tip && <b className="pk-size">{brush.size}</b>}
        </span>
      </span>
      <button
        type="button"
        tabIndex={-1}
        className="pk-star"
        data-on={fav}
        aria-label={fav ? `Take ${b.name} out of Favourites` : `Add ${b.name} to Favourites`}
        aria-pressed={fav}
        title={fav ? 'Take out of Favourites' : 'Add to Favourites'}
        onClick={(e) => {
          e.stopPropagation();
          onStar(b.id);
        }}
      >
        <Star on={fav} />
      </button>
    </div>
  );
});

// ---------------------------------------------------------------- the panel

const LIVE_SIZE = (size: number): number => Math.min(54, Math.max(3, Math.round(size * 1.35)));
const setBrush = (patch: Partial<BrushSettings>): void => store().setUi((u) => ({ brush: { ...u.brush, ...patch } }));

function Panel({ anchor, onClose, onPicked }: { anchor: HTMLElement; onClose: (refocus: boolean) => void; onPicked: () => void }) {
  useBrushPresets(brushesVersion);
  usePicker(pickerVersion);
  const live = useStore((st) => st.ui.brush);
  const rows = useRowStyle();
  const scale = rowScale();
  const all = everyBrush();
  const { activeId } = currentBrushState();
  const big = all.length > SMALL_LIBRARY;
  const favs = favouriteIds();
  const favSet = useMemo(() => new Set(favs), [favs]);
  const opened = openGroups();
  const recent = recentIds();
  const [query, setQuery] = useState('');
  const [hot, setHot] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const spot = () => {
    const r = anchor.getBoundingClientRect();
    return { top: r.bottom + 6, right: r.right };
  };
  const [pos, setPos] = useState<{ top: number; right: number }>(spot);
  const [box, setBox] = useState<{ w: number; h: number | null }>(() => panelBox() ?? { w: 380, h: null });
  const grip = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const searching = query.trim().length > 0;

  const shut = useCallback(() => onClose(true), [onClose]);
  usePopover(ref, shut);

  // Under the button, growing left and down: the panel hangs off the right-hand dock.
  const place = useCallback(() => {
    const r = anchor.getBoundingClientRect();
    setPos((p) => (p.top === r.bottom + 6 && p.right === r.right ? p : { top: r.bottom + 6, right: r.right }));
  }, [anchor]);
  useLayoutEffect(() => {
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [place]);
  // Focus goes to the search box (or the list when there is none) before the popover looks for somewhere to put it.
  useLayoutEffect(() => {
    (searchRef.current ?? listRef.current)?.focus();
  }, []);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [anchor, onClose]);

  const sections = useMemo(() => buildSections({ all, favourites: favs, recent, activeId, opened, query }), [all, favs, recent, activeId, opened, query]);
  const items = useMemo<Item[]>(() => (big ? flatten(sections) : all.map((b) => ({ key: rowKey('flat', b.id), kind: 'row' as const, section: 'flat', brush: b }))), [big, sections, all]);
  const index = useMemo(() => new Map(items.map((i, n) => [i.key, n])), [items]);
  const hotKey = hot && index.has(hot) ? hot : startKey(items, searching ? null : activeId);
  const hotIdx = hotKey ? index.get(hotKey) : undefined;
  const hotItem: Item | undefined = hotIdx === undefined ? undefined : items[hotIdx];

  useEffect(() => {
    if (hotIdx !== undefined) document.getElementById(`pk-i${hotIdx}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [hotIdx]);

  const pick = useCallback(
    (id: string) => {
      if (applyPreset(id)) onPicked();
    },
    [onPicked],
  );
  const star = useCallback((id: string) => void toggleFavourite(id), []);
  const toggleSection = (key: string, to?: boolean) => {
    const now = sections.filter((s) => s.open).map((s) => s.key);
    const open = to ?? !now.includes(key);
    setOpenGroups(open ? [...now.filter((k) => k !== key), key] : now.filter((k) => k !== key));
  };

  const onKeyDown = (e: ReactKey<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    const inSearch = t === searchRef.current;
    const driving = inSearch || t === listRef.current;
    const mod = e.ctrlKey || e.metaKey;
    if (driving) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp' || (!inSearch && (e.key === 'Home' || e.key === 'End'))) {
        e.preventDefault();
        setHot(moveHot(items, hotKey, e.key));
      } else if (e.key === 'Enter' && !mod) {
        e.preventDefault();
        if (hotItem?.kind === 'row' && hotItem.brush) pick(hotItem.brush.id);
        else if (hotItem) toggleSection(hotItem.section);
      } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && hotItem?.kind === 'head' && !searching) {
        e.preventDefault();
        toggleSection(hotItem.section, e.key === 'ArrowRight');
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (hotItem?.kind === 'row' && hotItem.brush) star(hotItem.brush.id);
      } else if (!inSearch && searchRef.current && e.key.length === 1 && !mod && !e.altKey) {
        // Typing with the list focused goes to the search box.
        searchRef.current.focus();
      }
    }
    // Nothing typed in here reaches the shortcuts underneath (a "b" or an "e" is for the search box, not a tool).
    if (e.key !== 'Tab' && e.key !== 'Escape') e.stopPropagation();
  };

  const allKeys = foldableKeys({ all });
  const allOpen = allKeys.every((k) => sections.find((s) => s.key === k)?.open);
  const hint: Record<string, string> = { favourites: 'Star a brush and it shows up here.', recent: 'The brushes you use show up here.' };
  const firstGroup = sections.findIndex((s) => s.kind === 'group');

  const rowFor = (s: Section, b: import('./model').BrushPreset) => {
    const key = rowKey(s.key, b.id);
    const on = b.id === activeId;
    return <Row key={key} b={b} idx={index.get(key) ?? -1} on={on} hot={key === hotKey} fav={favSet.has(b.id)} rows={rows} scale={scale} live={on ? live : undefined} showGroup={s.kind === 'found'} onPick={pick} onStar={star} />;
  };

  let body: ReactNode;
  if (!big) {
    body = (
      <div className={`pk-rows pk-rows-${rows}`}>
        {all.map((b) => {
          const key = rowKey('flat', b.id);
          const on = b.id === activeId;
          return <Row key={key} b={b} idx={index.get(key) ?? -1} on={on} hot={key === hotKey} fav={favSet.has(b.id)} rows={rows} scale={scale} live={on ? live : undefined} showGroup={false} onPick={pick} onStar={star} />;
        })}
      </div>
    );
  } else {
    body = sections.map((s, n) => (
      <section key={s.key} role="presentation">
        {n === firstGroup && (
          <p className="pk-label">
            All brushes <span>{all.length}</span>
          </p>
        )}
        {s.kind === 'found' ? (
          <p className="pk-found">{s.count ? `${s.count} found` : ''}</p>
        ) : (
          <button
            type="button"
            tabIndex={-1}
            id={`pk-i${index.get(`head|${s.key}`) ?? -1}`}
            className="pk-group"
            data-hot={`head|${s.key}` === hotKey}
            aria-expanded={s.open}
            onClick={() => {
              toggleSection(s.key);
              (searchRef.current ?? listRef.current)?.focus();
            }}
          >
            <Chevron open={s.open} />
            <span className="pk-group-icon">{sectionIcon(s)}</span>
            <span className="pk-group-name">{s.name}</span>
            {s.here && <i className="pk-here" title="Your brush is in here" />}
            <span className="pk-count">{s.count}</span>
          </button>
        )}
        {s.kind === 'found' && !s.count && <p className="pk-empty">No brush called that. Try a shorter word, like &quot;pen&quot;.</p>}
        {s.open && s.count === 0 && s.kind !== 'found' && <p className="pk-empty pk-empty-in">{hint[s.kind]}</p>}
        {s.open && s.count > 0 && (
          <div className={`pk-rows pk-rows-${rows}`} role="group" aria-label={s.name}>
            {s.brushes.map((b) => rowFor(s, b))}
          </div>
        )}
      </section>
    ));
  }

  const width = Math.min(box.w, pos.right - 8);
  const maxH = window.innerHeight - pos.top - 10;
  const height = big ? Math.min(box.h ?? 580, maxH) : undefined;
  const activeRow = hotIdx !== undefined ? `pk-i${hotIdx}` : undefined;
  return createPortal(
    <div ref={ref} className="pk-pop" data-big={big} role="dialog" aria-label="Pick a brush" style={{ top: pos.top, left: pos.right - width, width, height, maxHeight: maxH }} onKeyDown={onKeyDown}>
      <div className="pk-live">
        <div className="pk-dial" aria-hidden="true">
          <i style={{ width: LIVE_SIZE(live.size), height: LIVE_SIZE(live.size) }} />
        </div>
        <div className="pk-sliders">
          <Slider label="Size" value={live.size} min={1} max={120} format={(v) => `${v}px`} onChange={(v) => setBrush({ size: v })} />
          <Slider label="Smoothing" value={Math.round(live.streamline * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => setBrush({ streamline: v / 100, smoothing: v / 100 })} />
        </div>
      </div>
      {big && (
        <div className="pk-tools">
          <label className="pk-search">
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls="pk-list"
              aria-activedescendant={activeRow}
              aria-label="Search brushes"
              autoComplete="off"
              spellCheck={false}
              value={query}
              placeholder="Search brushes"
              onChange={(e) => {
                setQuery(e.target.value);
                setHot(null);
              }}
            />
          </label>
          <button type="button" className="pk-icon" title={allOpen ? 'Fold every group' : 'Open every group'} aria-label={allOpen ? 'Fold every group' : 'Open every group'} onClick={() => setOpenGroups(allOpen ? [] : allKeys)}>
            <Svg>{allOpen ? <path d="M3 6l5-3 5 3M3 10l5 3 5-3" /> : <path d="M3 3l5 3 5-3M3 13l5-3 5 3" />}</Svg>
          </button>
          <button type="button" className="pk-icon" title={rows === 'tip' ? 'Two columns, denser' : 'One column'} aria-label={rows === 'tip' ? 'Show two columns' : 'Show one column'} onClick={() => void flipRowStyle()}>
            <Svg>{rows === 'two' ? <path d="M2.5 4h11M2.5 8h11M2.5 12h11" /> : <path d="M2.5 3.5h4.5v4.5H2.5zM9 3.5h4.5v4.5H9zM2.5 10h4.5M9 10h4.5" />}</Svg>
          </button>
          <button
            type="button"
            className="pk-icon"
            title="Save the brush you are using"
            aria-label="Save the brush you are using"
            onClick={() => {
              onClose(false);
              startNaming('save');
            }}
          >
            <Svg>
              <path d="M8 3v10M3 8h10" />
            </Svg>
          </button>
        </div>
      )}
      <div
        id="pk-list"
        ref={listRef}
        className="pk-list"
        role={big ? 'tree' : 'listbox'}
        aria-label="Brushes"
        tabIndex={big ? -1 : 0}
        aria-activedescendant={big ? undefined : activeRow}
        onMouseDown={(e) => {
          // Clicking a row keeps focus where it was, so typing still goes to the search box.
          if ((e.target as HTMLElement).closest('.pk-row, .pk-group')) e.preventDefault();
        }}
      >
        {body}
      </div>
      <div className="pk-foot">
        <span className="pk-foot-label">Row size</span>
        <input
          type="range"
          className="cv-slider"
          min={ROW_SCALE.min}
          max={ROW_SCALE.max}
          step={0.05}
          value={scale}
          aria-label="Row size"
          onChange={(e) => setRowScale(Number(e.target.value))}
        />
      </div>
      {big && (
        <div
          className="pk-grip"
          title="Drag to make the list bigger"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            grip.current = { x: e.clientX, y: e.clientY, w: width, h: height ?? 580 };
          }}
          onPointerMove={(e) => {
            const g = grip.current;
            if (g) setBox({ w: Math.max(BOX.minW, Math.min(BOX.maxW, g.w + (g.x - e.clientX))), h: Math.max(BOX.minH, g.h + (e.clientY - g.y)) });
          }}
          onPointerUp={() => {
            grip.current = null;
            if (box.h !== null) setPanelBox({ w: box.w, h: box.h });
          }}
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M1 4l7 7M1 8l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- what sits in the brush options, all the time

export function BrushPicker() {
  const live = useStore((st) => st.ui.brush);
  useBrushPresets(brushesVersion);
  const all = everyBrush();
  const { activeId, changed } = currentBrushState();
  const active = all.find((p) => p.id === activeId);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const big = all.length > SMALL_LIBRARY;
  const asks = usePicker(pickerRequests);

  // A command asked for the picker (Ctrl+K, a menu).
  useEffect(() => {
    if (takePickerRequest()) setOpen(true);
  }, [asks]);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    // Focus goes back to the button unless it went somewhere on purpose.
    if (refocus)
      requestAnimationFrame(() => {
        const now = document.activeElement;
        if (!now || now === document.body) btn.current?.focus();
      });
  }, []);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="pk-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Pick a brush by what it draws"
        onClick={() => (open ? close(true) : setOpen(true))}
      >
        <span className="pk-btn-sample">
          <Stroke brush={live} h={30} />
        </span>
        <span className="pk-btn-text">
          <span className="pk-btn-name">
            {active ? active.name : 'Custom brush'}
            {active && changed && <i className="bp-changed" aria-label="changed" />}
          </span>
          <span className="pk-btn-sub">{active && big ? `${groupOf(active)} · ${all.length} brushes` : `${all.length} brushes`}</span>
        </span>
        <span className="pk-caret" aria-hidden="true">
          <Svg>
            <path d="M4 6l4 4 4-4" />
          </Svg>
        </span>
      </button>
      {open && btn.current && <Panel anchor={btn.current} onClose={close} onPicked={() => close(true)} />}
    </>
  );
}
