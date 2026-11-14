// Four layouts for a big brush library, built from the real chip styles so a picture of each is honest. Mockups only:
// the library is made up (library.ts) and nothing here is saved.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ActionButton } from '../../canvas/controls';
import { dotSize } from '../BrushPresetRow';
import type { MockBrush } from './library';
import { favouritesOf, libraryOf, matches, pick, recentsOf, setMock, useMock } from './state';
import { Thumb } from './Thumb';
import './mock.css';

const SMALL = 8;

function Chip({ b, on }: { b: MockBrush; on: boolean }) {
  return (
    <button type="button" className="bp-chip" data-on={on} aria-pressed={on} title={b.name} onClick={() => pick(b)}>
      <span className="bp-dot" style={{ width: dotSize(b.brush.size), height: dotSize(b.brush.size) }} />
      <span className="bp-chip-name">{b.name}</span>
    </button>
  );
}

function SearchBox({ placeholder, autoFocus }: { placeholder: string; autoFocus?: boolean }) {
  const { query } = useMock();
  return (
    <label className="mk-search">
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input type="text" value={query} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => setMock({ query: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
    </label>
  );
}

const Actions = () => (
  <div className="bp-actions">
    <ActionButton onClick={() => undefined}>Save as...</ActionButton>
  </div>
);

/** The current brush and its group, from the made-up library. */
const useLib = () => {
  const s = useMock();
  const lib = libraryOf(s.n);
  return { s, lib, active: lib.find((b) => b.id === s.activeId) ?? lib[0], favs: favouritesOf(lib), recents: recentsOf(lib, s.recent) };
};

const groupsOf = (lib: MockBrush[]): [string, number][] => {
  const m = new Map<string, number>();
  lib.forEach((b) => m.set(b.group, (m.get(b.group) ?? 0) + 1));
  return [...m];
};

/** Favourites first, then recent ones, no repeats, up to `max`. */
const quick = (favs: MockBrush[], recents: MockBrush[], max: number): MockBrush[] => {
  const out: MockBrush[] = [];
  for (const b of [...favs, ...recents]) if (!out.includes(b) && out.length < max) out.push(b);
  return out;
};

// ---------------------------------------------------------------- A: chip row with groups and a "more" drawer

export function LayoutA() {
  const { s, lib, active, favs, recents } = useLib();
  if (lib.length <= SMALL) {
    // Today's row, untouched.
    return (
      <div className="bp-row mk-row" data-testid="brush-presets">
        <div className="bp-chips">{lib.map((b) => <Chip key={b.id} b={b} on={b.id === active.id} />)}</div>
        <Actions />
      </div>
    );
  }
  const shown = quick(favs, recents, 7);
  if (!shown.includes(active)) shown.unshift(active);
  const groups = groupsOf(lib);
  const searching = s.query.trim().length > 0;
  const inGroup = s.group === 'All' ? lib : lib.filter((b) => b.group === s.group);
  const list = searching ? matches(lib, s.query) : inGroup;
  return (
    <div className="bp-row mk-row" data-testid="brush-presets">
      <div className="bp-chips">
        {shown.slice(0, 8).map((b) => <Chip key={b.id} b={b} on={b.id === active.id} />)}
        <button type="button" className="bp-chip mk-more" aria-expanded={s.open} onClick={() => setMock({ open: !s.open, group: s.open ? s.group : active.group })}>
          <span className="bp-chip-name">All {lib.length} brushes</span>
          <span aria-hidden="true">{s.open ? '▴' : '▾'}</span>
        </button>
      </div>
      {s.open && (
        <div className="mk-drawer">
          <SearchBox placeholder={`Find a brush in ${lib.length}`} />
          {!searching && (
            <div className="mk-pills" role="tablist" aria-label="Groups">
              {[['All', lib.length] as [string, number], ...groups].map(([g, n]) => (
                <button key={g} type="button" className="mk-pill" data-on={s.group === g} onClick={() => setMock({ group: g })}>
                  {g} <span className="mk-count">{n}</span>
                </button>
              ))}
            </div>
          )}
          <div className="bp-chips mk-scroll">
            {list.map((b) => <Chip key={b.id} b={b} on={b.id === active.id} />)}
            {!list.length && <p className="mk-empty">No brush called that.</p>}
          </div>
        </div>
      )}
      <Actions />
    </div>
  );
}

// ---------------------------------------------------------------- D: recent chips and a find box (no drawer)

export function LayoutD() {
  const { s, lib, active, favs, recents } = useLib();
  if (lib.length <= SMALL) return <LayoutA />;
  const searching = s.query.trim().length > 0;
  const found = matches(lib, s.query);
  const shown = quick(favs, recents, 7);
  if (!shown.includes(active)) shown.unshift(active);
  return (
    <div className="bp-row mk-row" data-testid="brush-presets">
      <SearchBox placeholder={`Find a brush (${lib.length})`} />
      {searching ? (
        <>
          <div className="bp-chips">
            {found.slice(0, 12).map((b) => <Chip key={b.id} b={b} on={b.id === active.id} />)}
            {!found.length && <p className="mk-empty">No brush called that.</p>}
          </div>
          {found.length > 12 && <p className="mk-hint">{found.length - 12} more. Keep typing to narrow it down.</p>}
        </>
      ) : (
        <>
          <div className="mk-label">Favourites and recent</div>
          <div className="bp-chips">{shown.slice(0, 8).map((b) => <Chip key={b.id} b={b} on={b.id === active.id} />)}</div>
        </>
      )}
      <Actions />
    </div>
  );
}

// ---------------------------------------------------------------- C: pop-over picker on the brush button

function Popover({ anchor, children, onClose }: { anchor: HTMLElement | null; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = 360;
    setPos({ top: r.bottom + 6, left: Math.max(8, r.right - w) });
  }, [anchor]);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [anchor, onClose]);
  if (!pos) return null;
  return createPortal(
    <div ref={ref} className="mk-pop" role="dialog" aria-label="Pick a brush" style={{ top: pos.top, left: pos.left }}>
      {children}
    </div>,
    document.body,
  );
}

export function LayoutC() {
  const { s, lib, active, favs, recents } = useLib();
  const btn = useRef<HTMLButtonElement>(null);
  const big = lib.length > SMALL;
  const searching = s.query.trim().length > 0;
  const groups = groupsOf(lib);
  const tab = s.group;
  let list: MockBrush[];
  if (searching) list = matches(lib, s.query);
  else if (tab === 'Recent') list = recents;
  else if (tab === 'Favourites') list = favs;
  else if (tab === 'All') list = lib;
  else list = lib.filter((b) => b.group === tab);
  return (
    <div className="bp-row mk-row" data-testid="brush-presets">
      <button ref={btn} type="button" className="mk-brushbtn" aria-haspopup="dialog" aria-expanded={s.open} onClick={() => setMock({ open: !s.open, query: '', group: big ? 'Recent' : 'All' })}>
        <Thumb brush={active.brush} w={64} h={24} />
        <span className="mk-brushbtn-name">{active.name}</span>
        <span className="mk-count">{lib.length}</span>
        <span aria-hidden="true">{'▾'}</span>
      </button>
      <Actions />
      {s.open && (
        <Popover anchor={btn.current} onClose={() => setMock({ open: false })}>
          <SearchBox placeholder={`Find a brush in ${lib.length}`} autoFocus />
          {big && !searching && (
            <div className="mk-pills mk-pills-row" role="tablist" aria-label="Groups">
              {([['Recent', recents.length], ['Favourites', favs.length], ['All', lib.length], ...groups] as [string, number][]).map(([g, n]) => (
                <button key={g} type="button" className="mk-pill" data-on={tab === g} onClick={() => setMock({ group: g })}>
                  {g} <span className="mk-count">{n}</span>
                </button>
              ))}
            </div>
          )}
          <div className="mk-grid mk-scroll">
            {list.map((b) => (
              <button key={b.id} type="button" className="mk-card" data-on={b.id === active.id} onClick={() => { pick(b); setMock({ open: false }); }}>
                <Thumb brush={b.brush} w={96} h={30} />
                <span className="mk-card-name">{b.name}</span>
              </button>
            ))}
            {!list.length && <p className="mk-empty">No brush called that.</p>}
          </div>
        </Popover>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- B: a brushes panel with folders, a list and search

/** What sits in the options column when the library has its own panel: the current brush and a way to save. */
export function LayoutBOptions() {
  const { lib, active } = useLib();
  return (
    <div className="bp-row mk-row" data-testid="brush-presets">
      <div className="mk-current">
        <Thumb brush={active.brush} w={64} h={24} />
        <span className="mk-brushbtn-name">{active.name}</span>
        <span className="mk-count">of {lib.length}</span>
      </div>
      <p className="mk-hint">Pick brushes in the Brushes panel.</p>
      <Actions />
    </div>
  );
}

export function BrushesPanelMock() {
  const { s, lib, active, favs, recents } = useLib();
  const searching = s.query.trim().length > 0;
  const groups = groupsOf(lib);
  const openFolders = s.folders.length ? s.folders : [active.group];
  const toggle = (g: string) => setMock({ folders: openFolders.includes(g) ? openFolders.filter((x) => x !== g) : [...openFolders, g] });
  const row = (b: MockBrush) => (
    <button key={b.id} type="button" className="mk-row-item" data-on={b.id === active.id} onClick={() => pick(b)}>
      <Thumb brush={b.brush} w={72} h={22} />
      <span className="mk-item-name">{b.name}</span>
      <span className="mk-count">{b.brush.size}px</span>
    </button>
  );
  const folder = (g: string, items: MockBrush[], star?: string) => {
    const open = openFolders.includes(g);
    return (
      <div key={g} className="mk-folder">
        <button type="button" className="mk-folder-head" aria-expanded={open} onClick={() => toggle(g)}>
          <span aria-hidden="true">{open ? '▾' : '▸'}</span>
          <span className="mk-folder-name">{star ? `${star} ${g}` : g}</span>
          <span className="mk-count">{items.length}</span>
        </button>
        {open && <div className="mk-folder-body">{items.map(row)}</div>}
      </div>
    );
  };
  return (
    <div className="mk-panel" data-testid="brushes-panel-mock">
      <SearchBox placeholder={`Search ${lib.length} brushes`} />
      <div className="mk-panel-list mk-scroll">
        {searching ? (
          <div className="mk-folder-body">{matches(lib, s.query).map(row)}</div>
        ) : (
          <>
            {lib.length > SMALL && folder('Favourites', favs, '★')}
            {lib.length > SMALL && folder('Recent', recents)}
            {groups.map(([g]) => folder(g, lib.filter((b) => b.group === g)))}
          </>
        )}
      </div>
    </div>
  );
}
