// Round two of the brush library mockups (brand/ab/brush-library-v2): a dropdown picker you choose from by seeing what each
// brush draws. Scratch code, ?debug only, nothing here is saved. Real controls (Slider, ActionButton), real stroke drawing
// (buildStroke + drawShape), the real theme tokens.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ActionButton, Slider } from '../../canvas/controls';
import type { BrushSettings } from '../../core/format';
import { drawShape } from '../../core/render';
import { store, useStore } from '../../core/store';
import { buildStroke } from '../../tools/vectorStroke';
import type { MockBrush } from './library';
import { favouritesOf, libraryOf, matches, pick, recentsOf, setMock, useMock, type Rows } from './state';
import './picker.css';

const SMALL = 8;

const sameBrush = (a: BrushSettings, b: BrushSettings): boolean => (Object.keys(b) as (keyof BrushSettings)[]).every((k) => a[k] === b[k]);

// ---------------------------------------------------------------- a stroke sample, as wide as the box it sits in

/** A sample stroke drawn with the brush's own settings, so size, pressure and pointy ends show. Fills its box. */
function Stroke({ brush, h }: { brush: BrushSettings; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const watch = new ResizeObserver(() => setW(Math.round(c.clientWidth)));
    watch.observe(c);
    setW(Math.round(c.clientWidth));
    return () => watch.disconnect();
  }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c || !w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const pts = [];
    const pad = Math.min(14, w * 0.06);
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      pts.push({ x: pad + t * (w - pad * 2), y: h / 2 + Math.sin(t * Math.PI * 2) * h * 0.2, p: 0.25 + 0.6 * Math.sin(t * Math.PI) });
    }
    // Size as the brush draws it, scaled down to fit the row and capped so a fat brush stays inside it.
    const size = Math.min(brush.size * 0.6, h * 0.66);
    drawShape(g, buildStroke(pts, { ...brush, size: Math.max(1.2, size), taperStart: brush.taperStart * 0.5, taperEnd: brush.taperEnd * 0.5 }, getComputedStyle(c).color));
  }, [brush, w, h]);
  return <canvas ref={ref} className="pk-stroke" style={{ height: h }} aria-hidden="true" />;
}

/** The round tip, as wide as the brush (up to a point), with the real size under it. */
const Tip = ({ size }: { size: number }) => (
  <span className="pk-tip" aria-hidden="true">
    <i style={{ width: Math.round(Math.min(26, Math.max(4, size * 0.9))), height: Math.round(Math.min(26, Math.max(4, size * 0.9))) }} />
    <b>{size}</b>
  </span>
);

// ---------------------------------------------------------------- small icons

const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

// ---------------------------------------------------------------- the rows

interface RowProps {
  b: MockBrush;
  on: boolean;
  fav: boolean;
  rows: Rows;
  scale: number;
  live: BrushSettings;
  showGroup?: boolean;
  onHover: (b: MockBrush | null) => void;
  onPick: (b: MockBrush) => void;
}

function Row({ b, on, fav, rows, scale, live, showGroup, onHover, onPick }: RowProps) {
  const brush = on ? live : b.brush;
  const common = {
    type: 'button' as const,
    className: `pk-row pk-row-${rows}`,
    'data-on': on,
    title: `${b.name}, ${b.group}`,
    onClick: () => onPick(b),
    onMouseEnter: () => onHover(b),
    onMouseLeave: () => onHover(null),
  };
  const name = (
    <span className="pk-name">
      <span className="pk-name-text">{b.name}</span>
      {showGroup && <em>{b.group}</em>}
      {fav && <Star on />}
    </span>
  );
  if (rows === 'sample') {
    return (
      <button {...common} aria-label={b.name}>
        <Stroke brush={brush} h={Math.round(32 * scale)} />
        {fav && <span className="pk-fav"><Star on /></span>}
      </button>
    );
  }
  if (rows === 'two') {
    return (
      <button {...common}>
        <Stroke brush={brush} h={Math.round(26 * scale)} />
        <span className="pk-name pk-name-small">
          <span className="pk-name-text">{b.name}</span>
          {fav && <Star on />}
          <b className="pk-size">{brush.size}</b>
        </span>
      </button>
    );
  }
  return (
    <button {...common}>
      <Tip size={brush.size} />
      <span className="pk-main">
        <Stroke brush={brush} h={Math.round(30 * scale)} />
        {name}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- the panel

function Panel({ anchor, big, onClose }: { anchor: HTMLElement; big: boolean; onClose: () => void }) {
  const s = useMock();
  const live = useStore((st) => st.ui.brush);
  const lib = libraryOf(s.n);
  const active = lib.find((b) => b.id === s.activeId) ?? lib[0];
  const favs = favouritesOf(lib);
  const recents = recentsOf(lib, s.recent);
  const favIds = new Set(favs.map((b) => b.id));
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<MockBrush | null>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  // The panel hangs off the right-hand dock, so it grows to the left and down: the grip is the bottom-left corner.
  const [box, setBox] = useState<{ w: number; h: number | null }>({ w: 380, h: null });
  const grip = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    setPos({ top: r.bottom + 6, right: r.right });
  }, [anchor]);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [anchor, onClose]);

  const groups: [string, MockBrush[]][] = [];
  lib.forEach((b) => {
    const g = groups.find((x) => x[0] === b.group);
    if (g) g[1].push(b);
    else groups.push([b.group, [b]]);
  });
  const first = (n: string) => (n === 'My brushes' ? 0 : n === 'Starters' ? 1 : 2);
  groups.sort((a, b) => first(a[0]) - first(b[0]));
  const searching = s.query.trim().length > 0;
  const found = matches(lib, s.query);
  const opened = s.opened ?? [active.group];
  const toggle = (name: string) => setMock({ opened: opened.includes(name) ? opened.filter((x) => x !== name) : [...opened, name] });
  const allNames = ['Favourites', 'Recent', ...groups.map((g) => g[0])];
  const allOpen = allNames.every((n) => opened.includes(n));
  const cycle: Rows[] = ['tip', 'two', 'sample'];
  const nextRows = cycle[(cycle.indexOf(s.rows) + 1) % cycle.length];

  const row = (b: MockBrush, showGroup = false) => (
    <Row key={b.id} b={b} on={b.id === active.id} fav={favIds.has(b.id)} rows={s.rows} scale={s.rowScale} live={live} showGroup={showGroup} onHover={setHover} onPick={(x) => { pick(x); onClose(); }} />
  );
  const list = (bs: MockBrush[], showGroup = false) => <div className={`pk-rows pk-rows-${s.rows}`}>{bs.map((b) => row(b, showGroup))}</div>;
  const head = (name: string, count: number, icon: ReactNode, key = name) => (
    <button key={`h-${key}`} type="button" className="pk-group" aria-expanded={opened.includes(name)} onClick={() => toggle(name)}>
      <Chevron open={opened.includes(name)} />
      <span className="pk-group-icon">{icon}</span>
      <span className="pk-group-name">{name}</span>
      {groups.find((g) => g[0] === name)?.[1].some((b) => b.id === active.id) && <i className="pk-here" title="Your brush is in here" />}
      <span className="pk-count">{count}</span>
    </button>
  );

  let body: ReactNode;
  if (!big) body = list(lib);
  else if (searching)
    body = found.length ? (
      <>
        <p className="pk-found">{found.length} found</p>
        {list(found, true)}
      </>
    ) : (
      <p className="pk-empty">No brush called that. Try a shorter word, like "pen".</p>
    );
  else
    body = (
      <>
        {[['Favourites', favs, <Star key="s" on />] as const, ['Recent', recents.slice(0, 5), <Clock key="c" />] as const].map(([name, bs, icon]) => (
          <section key={name}>
            {head(name, bs.length, icon)}
            {opened.includes(name) && list(bs)}
          </section>
        ))}
        <p className="pk-label">All brushes <span>{lib.length}</span></p>
        {groups.map(([name, bs]) => (
          <section key={name}>
            {head(name, bs.length, <Folder />)}
            {opened.includes(name) && list(bs)}
          </section>
        ))}
      </>
    );

  if (!pos) return null;
  const shown = hover ?? active;
  const width = Math.min(box.w, pos.right - 8);
  const maxH = window.innerHeight - pos.top - 10;
  const height = big ? Math.min(box.h ?? 580, maxH) : undefined;
  return createPortal(
    <div ref={ref} className="pk-pop" data-big={big} role="dialog" aria-label="Pick a brush" style={{ top: pos.top, left: pos.right - width, width, height }}>
      <div className="pk-live">
        <div className="pk-dial" aria-label="Size of the tip">
          <i style={{ width: Math.min(54, Math.max(3, Math.round(live.size * 1.35))), height: Math.min(54, Math.max(3, Math.round(live.size * 1.35))) }} />
        </div>
        <div className="pk-sliders">
          <Slider label="Size" value={live.size} min={1} max={120} format={(v) => `${v}px`} onChange={(v) => store().setUi((u) => ({ brush: { ...u.brush, size: v } }))} />
          <Slider label="Smoothing" value={Math.round(live.streamline * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => store().setUi((u) => ({ brush: { ...u.brush, streamline: v / 100, smoothing: v / 100 } }))} />
        </div>
      </div>
      {big && (
        <div className="pk-tools">
          <label className="pk-search">
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input type="text" value={s.query} placeholder="Search brushes" onChange={(e) => setMock({ query: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
          </label>
          <button type="button" className="pk-icon" title={allOpen ? 'Fold every group' : 'Open every group'} aria-label={allOpen ? 'Fold every group' : 'Open every group'} onClick={() => setMock({ opened: allOpen ? [] : allNames })}>
            <Svg>{allOpen ? <path d="M3 6l5-3 5 3M3 10l5 3 5-3" /> : <path d="M3 3l5 3 5-3M3 13l5-3 5 3" />}</Svg>
          </button>
          <button type="button" className="pk-icon" title="Change how the rows look" aria-label="Change how the rows look" onClick={() => setMock({ rows: nextRows })}>
            <Svg>{s.rows === 'two' ? <path d="M2.5 3.5h4.5v4.5H2.5zM9 3.5h4.5v4.5H9zM2.5 10h4.5M9 10h4.5" /> : <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />}</Svg>
          </button>
          <button type="button" className="pk-icon" title="Save the brush you are using" aria-label="Save the brush you are using">
            <Svg><path d="M8 3v10M3 8h10" /></Svg>
          </button>
        </div>
      )}
      <div className="pk-list">{body}</div>
      {s.rows === 'sample' && (
        <p className="pk-now">
          <b>{shown.name}</b> <span>{shown.group}</span>
        </p>
      )}
      <div className="pk-foot">
        <span className="pk-foot-label">Row size</span>
        <input type="range" className="cv-slider" min={0.6} max={1.5} step={0.05} value={s.rowScale} aria-label="Row size" onChange={(e) => setMock({ rowScale: Number(e.target.value) })} />
      </div>
      {big && (
        <div
          className="pk-grip"
          title="Drag to make the list bigger"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            grip.current = { x: e.clientX, y: e.clientY, w: width, h: height ?? 580 };
          }}
          onPointerMove={(e) => {
            const g = grip.current;
            if (g) setBox({ w: Math.max(300, Math.min(640, g.w + (g.x - e.clientX))), h: Math.max(260, g.h + (e.clientY - g.y)) });
          }}
          onPointerUp={() => (grip.current = null)}
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

export function LayoutP() {
  const s = useMock();
  const live = useStore((st) => st.ui.brush);
  const lib = libraryOf(s.n);
  const active = lib.find((b) => b.id === s.activeId) ?? lib[0];
  const changed = !sameBrush(live, active.brush);
  const btn = useRef<HTMLButtonElement>(null);
  const big = lib.length > SMALL;
  return (
    <div className="bp-row mk-row" data-testid="brush-presets">
      <button ref={btn} type="button" className="pk-btn" aria-haspopup="dialog" aria-expanded={s.open} title="Pick a brush by what it draws" onClick={() => setMock({ open: !s.open, query: '' })}>
        <span className="pk-btn-sample">
          <Stroke brush={live} h={30} />
        </span>
        <span className="pk-btn-text">
          <span className="pk-btn-name">
            {active.name}
            {changed && <i className="bp-changed" aria-label="changed" />}
          </span>
          <span className="pk-btn-sub">{big ? `${active.group} · ${lib.length} brushes` : `${lib.length} brushes`}</span>
        </span>
        <span className="pk-caret" aria-hidden="true">
          <Svg>
            <path d="M4 6l4 4 4-4" />
          </Svg>
        </span>
      </button>
      <div className="bp-actions">
        <ActionButton onClick={() => undefined}>Save as...</ActionButton>
        {changed && <ActionButton onClick={() => undefined}>Update</ActionButton>}
        {changed && <ActionButton onClick={() => undefined}>Revert</ActionButton>}
      </div>
      {s.open && btn.current && <Panel anchor={btn.current} big={big} onClose={() => setMock({ open: false })} />}
    </div>
  );
}
