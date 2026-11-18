// The brush picker's panel: the live controls, a search box, groups and every brush as a row with a stroke across it.
// It loads the first time the picker opens (and in idle time after start-up); the button is in BrushPicker.tsx. The rules for what it lists are in library.ts, what it remembers is in
// picker.ts. Keyboard: arrows move the highlight, Enter picks, typing goes to the search box, Escape closes.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKey, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { flyoutLayer } from '../ui/layers';
import { Slider } from '../canvas/controls';
import { typedSize } from '../tools/brushRange';
import { useBrushRange } from '../tools/options/useBrushRange';
import type { BrushSettings } from '../core/format';
import { store, useStore } from '../core/store';
import { usePopover } from '../ui/popover';
import { placePopup, type PopupPlace } from '../ui/placePopup';
import {
  BOX,
  buildSections,
  groupKey,
  groupsOf,
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
import { applyPreset, brushesOnSide, brushesVersion, startNaming, stateFor, useBrushPresets } from './presets';
import { customOf, fixedActiveId, fixedHint, fixedRows, FIXED_WORDS, isFixedSide, parseTipId, type PickerSide } from './tipList';
import { pickStick, pickTip } from './tips';
import { usePixelLive } from './usePixelLive';
import { currentSpec, putSpec } from '../dab/live';
import { SIZE_RANGE as DAB_SIZE } from '../dab/maths';
import { specSize, withSize, type PixelSpec } from '../dab/spec';
import { SIZE_RANGE as SOFT_SIZE } from '../soft/settings';
import { SIZE_RANGE as DRY_SIZE } from '../dry/settings';
import { PixelStroke, PixelTip } from './PixelSample';
import { Stroke, TipThumb } from './Stroke';
import { StickPicture, TipPicture } from './pictures';
import { parseStickId } from './stickList';
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

/** The picture of the brush's real tip (chalk grain, a wash, its stamps) and its size under it. */
export const TIP_W = 44;
export const tipHeight = (scale: number): number => Math.max(20, Math.round(30 * scale));
const Tip = ({ brush, spec, scale, on, size = true }: { brush: BrushSettings; spec?: PixelSpec; scale: number; on: boolean; size?: boolean }) => (
  <span className="pk-tip" aria-hidden="true">
    {spec ? <PixelTip spec={spec} w={TIP_W} h={tipHeight(scale)} on={on} /> : <TipThumb brush={brush} w={TIP_W} h={tipHeight(scale)} on={on} />}
    {size && <b>{spec ? specSize(spec) : brush.size}</b>}
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
  /** The same for a pixel brush. */
  liveSpec?: PixelSpec | null;
  showGroup: boolean;
  /** A line about the brush, for a tooltip (the pen tips have no size or group worth showing). */
  hint?: string;
  /** A pen tip row: no star (a short fixed list needs no favourites) and no size number. */
  tips?: boolean;
  onPick: (id: string) => void;
  onStar: (id: string) => void;
}

const Row = memo(function Row({ b, idx, on, hot, fav, rows, scale, live, liveSpec, showGroup, hint, tips = false, onPick, onStar }: RowProps) {
  const brush = live ?? b.brush;
  const spec = b.tool === 'pixel' ? (liveSpec ?? b.pixel) : undefined;
  const tip = rows === 'tip';
  // A pen tip row does what the Brush tip command of the same name does (every stamp shape is the Stamp tip).
  const tipKind = tips ? parseTipId(b.id) : null;
  const stickDry = tips ? parseStickId(b.id) : null;
  const command = tipKind ? `brush.tip.${tipKind.kind ?? 'plain'}` : undefined;
  return (
    <div
      id={`pk-i${idx}`}
      role="option"
      aria-selected={on}
      className={`pk-row pk-row-${rows}`}
      data-on={on}
      data-hot={hot}
      data-command={command}
      title={hint ?? `${b.name}, ${groupOf(b)}${b.builtin ? ', comes with Frameling' : ''}`}
      onClick={() => onPick(b.id)}
    >
      {tip && !tips && <Tip brush={brush} spec={spec} scale={scale} on={on} size />}
      <span className="pk-main">
        {spec ? <PixelStroke spec={spec} h={Math.round((tip ? 30 : 26) * scale)} on={on} /> : tips ? (stickDry ? <StickPicture dry={stickDry} h={Math.round((tip ? 30 : 26) * scale)} /> : <TipPicture tip={b.brush.tip} h={Math.round((tip ? 30 : 26) * scale)} />) : <Stroke brush={brush} h={Math.round((tip ? 30 : 26) * scale)} on={on} />}
        <span className="pk-name">
          <span className="pk-name-text">{b.name}</span>
          {showGroup && <em>{groupOf(b)}</em>}
          {!tip && !tips && <b className="pk-size">{spec ? specSize(spec) : brush.size}</b>}
        </span>
      </span>
      {!tips && (
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
      )}
    </div>
  );
});

// ---------------------------------------------------------------- the panel

/** How wide each kind of pixel brush can be. */
const sizeRange = (s: PixelSpec): { min: number; max: number } => (s.kind === 'dab' ? DAB_SIZE : s.kind === 'soft' ? SOFT_SIZE : DRY_SIZE);
const LIVE_SIZE = (size: number): number => Math.min(54, Math.max(3, Math.round(size * 1.35)));
const setBrush = (patch: Partial<BrushSettings>): void => store().setUi((u) => ({ brush: { ...u.brush, ...patch } }));

export function Panel({ anchor, side = 'vector', onClose, onPicked }: { anchor: HTMLElement; side?: PickerSide; onClose: (refocus: boolean) => void; onPicked: () => void }) {
  useBrushPresets(brushesVersion);
  usePicker(pickerVersion);
  const live = useStore((st) => st.ui.brush);
  useStore((st) => st.ui.tool);
  const range = useBrushRange(false);
  const rows = useRowStyle();
  const scale = rowScale();
  const tips = isFixedSide(side);
  const words = side === 'stick' ? FIXED_WORDS.stick : FIXED_WORDS.tip;
  const custom = customOf(live.tip);
  const pixelLive = usePixelLive();
  const pixel = tips ? pixelLive : null;
  const tipList = useMemo(() => (tips ? fixedRows(side, live, custom, pixel) : []), [tips, side, live, custom, pixel]);
  const all = tips ? tipList : brushesOnSide(side);
  const { activeId } = tips ? { activeId: fixedActiveId(side, live, pixel) } : stateFor(side);
  const liveSpec = side === 'pixel' ? currentSpec() : null;
  const big = all.length > SMALL_LIBRARY;
  // The tips have no favourites or recent: it is a short list, shown with every group open at once.
  const favs = tips ? [] : favouriteIds();
  const favSet = useMemo(() => new Set(favs), [favs]);
  // The sticks keep their own folds for as long as the list is open, so folding a group of tips never closes them.
  const [stickOpen, setStickOpen] = useState<readonly string[] | null>(null);
  const setOpen = side === 'stick' ? setStickOpen : setOpenGroups;
  const opened = side === 'stick' ? (stickOpen ?? groupsOf(all).map((g) => groupKey(g.name))) : tips ? (openGroups() ?? groupsOf(all).map((g) => groupKey(g.name))) : openGroups();
  const recent = tips ? [] : recentIds();
  const noun = tips ? words.noun : 'brush';
  // "brush" needs an "es", so the list never says "brushs".
  const nouns = /(s|sh|ch|x|z)$/.test(noun) ? `${noun}es` : `${noun}s`;
  const [query, setQuery] = useState('');
  const [hot, setHot] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number | null }>(() => panelBox() ?? { w: 380, h: null });
  const grip = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const searching = query.trim().length > 0;
  // Where it goes: under the button or over it, whichever has room, and always inside the window (see placePopup).
  // A short list is as tall as its rows come to, so that is measured; a big one asks for the size it was left at.
  const spot = useCallback((): PopupPlace => {
    const el = ref.current;
    const list = listRef.current;
    const natural = el && list ? el.offsetHeight - list.clientHeight + list.scrollHeight : 420;
    return placePopup({ anchor: anchor.getBoundingClientRect(), win: { w: window.innerWidth, h: window.innerHeight }, width: box.w, height: big ? (box.h ?? 580) : natural });
  }, [anchor, box.w, box.h, big]);
  const [pos, setPos] = useState<PopupPlace>(spot);
  const place = useCallback(() => {
    const n = spot();
    setPos((p) => (p.left === n.left && p.width === n.width && p.top === n.top && p.bottom === n.bottom && p.maxHeight === n.maxHeight && p.opens === n.opens ? p : n));
  }, [spot]);

  const shut = useCallback(() => onClose(true), [onClose]);
  usePopover(ref, shut);

  // Placed again after each draw (the rows can change its height) unless the grip is being dragged, and when the window
  // is resized or anything scrolls (the options panel the button is in, say).
  useLayoutEffect(() => {
    if (!grip.current) place();
  });
  useLayoutEffect(() => {
    const moved = (e: Event) => {
      if (!(e.target instanceof Node && ref.current?.contains(e.target))) place();
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', moved, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', moved, true);
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

  const sections = useMemo(() => {
    const built = buildSections({ all, favourites: favs, recent, activeId, opened, query });
    return tips ? built.filter((s) => s.kind === 'group' || s.kind === 'found') : built;
  }, [all, favs, recent, activeId, opened, query, tips]);
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
      if ((side === 'stick' ? pickStick(id) : tips ? pickTip(id) : applyPreset(id))) onPicked();
    },
    [onPicked, tips, side],
  );
  const star = useCallback((id: string) => void toggleFavourite(id), []);
  const toggleSection = (key: string, to?: boolean) => {
    const now = sections.filter((s) => s.open).map((s) => s.key);
    const open = to ?? !now.includes(key);
    setOpen(open ? [...now.filter((k) => k !== key), key] : now.filter((k) => k !== key));
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

  const allKeys = foldableKeys({ all }).filter((k) => !tips || k.startsWith('group:'));
  const allOpen = allKeys.every((k) => sections.find((s) => s.key === k)?.open);
  const hintFor = (b: import('./model').BrushPreset): string | undefined => (tips ? fixedHint(side, b.id) : undefined);
  const hint: Record<string, string> = { favourites: 'Star a brush and it shows up here.', recent: 'The brushes you use show up here.' };
  const firstGroup = sections.findIndex((s) => s.kind === 'group');

  const rowFor = (s: Section, b: import('./model').BrushPreset) => {
    const key = rowKey(s.key, b.id);
    const on = b.id === activeId;
    return <Row key={key} b={b} idx={index.get(key) ?? -1} on={on} hot={key === hotKey} fav={favSet.has(b.id)} rows={rows} scale={scale} live={on ? live : undefined} liveSpec={on ? liveSpec : undefined} showGroup={s.kind === 'found'} hint={hintFor(b)} tips={tips} onPick={pick} onStar={star} />;
  };

  let body: ReactNode;
  if (!big) {
    body = (
      <div className={`pk-rows pk-rows-${rows}`}>
        {all.map((b) => {
          const key = rowKey('flat', b.id);
          const on = b.id === activeId;
          return <Row key={key} b={b} idx={index.get(key) ?? -1} on={on} hot={key === hotKey} fav={favSet.has(b.id)} rows={rows} scale={scale} live={on ? live : undefined} liveSpec={on ? liveSpec : undefined} showGroup={false} hint={hintFor(b)} tips={tips} onPick={pick} onStar={star} />;
        })}
      </div>
    );
  } else {
    body = sections.map((s, n) => (
      <section key={s.key} role="presentation">
        {n === firstGroup && (
          <p className="pk-label">
            All {nouns} <span>{all.length}</span>
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
        {s.kind === 'found' && !s.count && <p className="pk-empty">{tips ? words.none : 'No brush called that. Try a shorter word, like "pen".'}</p>}
        {s.open && s.count === 0 && s.kind !== 'found' && <p className="pk-empty pk-empty-in">{hint[s.kind]}</p>}
        {s.open && s.count > 0 && (
          <div className={`pk-rows pk-rows-${rows}`} role="group" aria-label={s.name}>
            {s.brushes.map((b) => rowFor(s, b))}
          </div>
        )}
      </section>
    ));
  }

  const width = pos.width;
  const maxH = pos.maxHeight;
  const height = big ? Math.min(box.h ?? 580, maxH) : undefined;
  // Opening upward grows up from the button; a big list has its height, so it is placed by its top and the grip follows the pointer.
  const edge = pos.top !== undefined ? { top: pos.top } : height !== undefined ? { top: window.innerHeight - (pos.bottom ?? 0) - height } : { bottom: pos.bottom };
  const activeRow = hotIdx !== undefined ? `pk-i${hotIdx}` : undefined;
  return createPortal(
    <div ref={ref} className="pk-pop" data-big={big} role="dialog" aria-label={tips ? words.dialog : side === 'pixel' ? 'Pick a pixel brush' : 'Pick a brush'} style={{ ...edge, left: pos.left, width, height, maxHeight: maxH, zIndex: flyoutLayer(anchor) }} onKeyDown={onKeyDown}>
      {!tips && (
        <div className="pk-live">
          <div className="pk-dial" aria-hidden="true">
            <i style={{ width: LIVE_SIZE(liveSpec ? specSize(liveSpec) : live.size), height: LIVE_SIZE(liveSpec ? specSize(liveSpec) : live.size) }} />
          </div>
          <div className="pk-sliders">
            {liveSpec ? (
              <Slider control="picker-size" label="Size" value={specSize(liveSpec)} min={sizeRange(liveSpec).min} max={sizeRange(liveSpec).max} curve format={(v) => `${v}px`} onChange={(v) => putSpec(withSize(liveSpec, v))} />
            ) : (
              <>
                <Slider control="picker-size" label="Size" value={live.size} min={range.min} max={range.max} typeMax={range.typedMax} curve format={(v) => `${v}px`} onChange={(v) => setBrush({ size: typedSize(v) })} />
                <Slider control="picker-smoothing" label="Smoothing" value={Math.round(live.streamline * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => setBrush({ streamline: v / 100, smoothing: v / 100 })} />
              </>
            )}
          </div>
        </div>
      )}
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
              aria-label={`Search ${nouns}`}
              autoComplete="off"
              spellCheck={false}
              value={query}
              placeholder={`Search ${nouns}`}
              onChange={(e) => {
                setQuery(e.target.value);
                setHot(null);
              }}
            />
          </label>
          <button type="button" className="pk-icon" title={allOpen ? 'Fold every group' : 'Open every group'} aria-label={allOpen ? 'Fold every group' : 'Open every group'} onClick={() => setOpen(allOpen ? [] : allKeys)}>
            <Svg>{allOpen ? <path d="M3 6l5-3 5 3M3 10l5 3 5-3" /> : <path d="M3 3l5 3 5-3M3 13l5-3 5 3" />}</Svg>
          </button>
          <button type="button" className="pk-icon" title={rows === 'tip' ? 'Two columns, denser' : 'One column'} aria-label={rows === 'tip' ? 'Show two columns' : 'Show one column'} onClick={() => void flipRowStyle()}>
            <Svg>{rows === 'two' ? <path d="M2.5 4h11M2.5 8h11M2.5 12h11" /> : <path d="M2.5 3.5h4.5v4.5H2.5zM9 3.5h4.5v4.5H9zM2.5 10h4.5M9 10h4.5" />}</Svg>
          </button>
          {!tips && (
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
          )}
        </div>
      )}
      <div
        id="pk-list"
        ref={listRef}
        className="pk-list"
        role={big ? 'tree' : 'listbox'}
        aria-label={tips ? words.list : 'Brushes'}
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
