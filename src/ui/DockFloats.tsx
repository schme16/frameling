// Floating windows over the canvas: a title bar to move them by, tabs for the panels in them (drag a tab out to make a
// new window, or onto a zone to dock it), edges to resize by. Also the floating tool rail.
import { memo, useEffect, useState, type ReactNode } from 'react';
import { getPanel } from '../core/registry';
import { closeFloatWindow, dock, dockFloatBack, hidePanel, panelsAway, panelTitle, raiseFloatWindow, resetFloatSize, resizeFloatBy, setFloatActive, setFloatWindowBox } from './dock';
import { clampBox, floatTitle, type FloatWin } from './dockModel';
import { dragState, dropIndexFor, startFloatDrag, startFloatResize, startPanelDrag } from './dockDrag';
import { askRename, menuPoint, floatMenu, openDockMenu, panelMenu } from './dockMenus';
import { PanelBoundary } from './dockShared';
import { Icon } from './icons';
import { PanelScope } from './explain/ExplainIcon';
import { createStore, readRaw, writeJson } from './mini';

/**
 * How a floating window looks. `titled` (the default): a title bar with the window's name, and a row of tabs under it
 * only when there is more than one panel. `compact`: one bar with the tabs in it.
 */
export type FloatChrome = 'titled' | 'compact';
const CHROME_KEY = 'frameling.dock.chrome';
export const floatChrome = createStore<FloatChrome>(readRaw<string>(CHROME_KEY, 'compact') === 'titled' ? 'titled' : 'compact');
export function setFloatChrome(c: FloatChrome): void {
  floatChrome.set(c);
  writeJson(CHROME_KEY, c);
}

function useWindowSize(): { w: number; h: number } {
  const [s, setS] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setS({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return s;
}

/** Every floating window, over the canvas and under menus and dialogs. */
export function FloatLayer({ children }: { children?: ReactNode }) {
  const floats = dock.use((d) => d.layout.floats);
  const away = panelsAway.use((v) => v);
  const win = useWindowSize();
  // Drawn in a steady order with the front one decided by z-index, so bringing one forward never moves its panel in the page.
  const steady = [...floats].sort((a, b) => (a.id < b.id ? -1 : 1));
  return (
    <>
      {!away && steady.map((f) => <FloatWindow key={f.id} f={f} z={floats.indexOf(f)} win={win} />)}
      {children}
    </>
  );
}

const EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

const FloatWindow = memo(function FloatWindow({ f, z, win }: { f: FloatWin; z: number; win: { w: number; h: number } }) {
  const names = dock.use((d) => d.layout.names);
  const chrome = floatChrome.use((v) => v);
  const dropAt = dragState.use((d) => dropIndexFor(d, { float: f.id }, f.tabs.length));
  const dragged = dragState.use((d) => (d && d.kind === 'panel' ? d.panels[0] : null));
  const front = dock.use((d) => d.layout.floats[d.layout.floats.length - 1]?.id === f.id);
  const box = clampBox(f, win);
  const active = f.active && f.tabs.includes(f.active) ? f.active : f.tabs[0];
  const panel = getPanel(active);
  const lay = dock.get().layout;
  const title = floatTitle({ ...lay, names }, f, (id) => getPanel(id)?.title ?? id);
  const several = f.tabs.length > 1;
  // Said to a screen reader after a resize from the keyboard ("420 wide, 340 tall").
  const [sized, setSized] = useState('');
  useEffect(() => {
    if (!sized) return;
    const t = setTimeout(() => setSized(''), 2500);
    return () => clearTimeout(t);
  }, [sized]);

  const tabs = (
    <div className="ui-float-tabs" role="tablist" aria-label={`${title} tabs`}>
      {f.tabs.map((id, i) => {
        const p = getPanel(id);
        if (!p) return null;
        const on = id === active;
        const label = names?.[id] ?? p.title;
        return (
          <div key={id} className={`ui-tab${on ? ' is-chosen' : ''}${dragged === id ? ' is-dragging' : ''}${dropAt === i ? ' drop-before' : ''}${dropAt === i + 1 && i === f.tabs.length - 1 ? ' drop-after' : ''}`} role="presentation" data-dock-tab={id} data-panel-id={id} onPointerDown={(e) => startPanelDrag(e, id)} onContextMenu={(e) => (e.preventDefault(), e.stopPropagation(), openDockMenu(e.clientX, e.clientY, panelMenu(id, { x: e.clientX, y: e.clientY })))}>
            <button
              type="button"
              role="tab"
              id={`ui-ftab-${id}`}
              aria-selected={on}
              aria-label={label}
              tabIndex={on ? 0 : -1}
              className="ui-tab-main"
              data-help={p.help ?? 'floating-windows'}
              data-tip={label}
              data-tip-desc="Drag it onto a side of the window to dock it, or onto another window to join it. Right-click for more."
              onClick={() => setFloatActive(f.id, id)}
              onKeyDown={(e) => {
                if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                  e.preventDefault();
                  const at = menuPoint(e.currentTarget);
                  return openDockMenu(at.x, at.y, panelMenu(id, at));
                }
                if (e.key === 'Delete') return e.preventDefault(), hidePanel(id);
                const n = f.tabs.length;
                const to = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : -1;
                if (to < 0) return;
                e.preventDefault();
                setFloatActive(f.id, f.tabs[to]);
                requestAnimationFrame(() => document.getElementById(`ui-ftab-${f.tabs[to]}`)?.focus());
              }}
            >
              <Icon name={p.icon} size={15} />
              <span className="ui-tab-title">{label}</span>
            </button>
            {on && several && (
              <button type="button" className="ui-tab-close" tabIndex={-1} aria-hidden="true" data-tip={`Close ${label}`} data-tip-desc="Bring it back from the Panels list or the View menu." onClick={() => hidePanel(id)}>
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  const buttons = (
    <div className="ui-float-btns">
      <button type="button" className="ui-icon-btn" aria-label={`Dock ${title} back`} data-tip="Dock back" data-tip-desc="Put its panels back where they started." data-help="floating-windows" onClick={() => dockFloatBack(f.id)}>
        <Icon name="dock" size={14} />
      </button>
      <button type="button" className="ui-icon-btn" aria-label={`Close ${title}`} data-tip="Close window" data-tip-desc="Its panels close with it. Bring them back from the Panels list." data-help="floating-windows" onClick={() => closeFloatWindow(f.id)}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );

  const grip = (
    <button
      type="button"
      className="ui-float-grip"
      aria-label={`Move ${title}. Arrow keys nudge it. Alt and the arrow keys resize it.`}
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown Alt+Enter"
      data-tip="Move window"
      data-tip-desc="Drag the title bar to move it. Drop it on a side of the canvas to dock it. From the keyboard, arrow keys move it and Alt with the arrows resizes it (Shift for bigger steps, Alt with Enter for the usual size)."
      data-help="floating-windows"
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        if (e.altKey && !e.ctrlKey && !e.metaKey) {
          const r = e.key === 'ArrowLeft' ? [-step, 0] : e.key === 'ArrowRight' ? [step, 0] : e.key === 'ArrowUp' ? [0, -step] : e.key === 'ArrowDown' ? [0, step] : null;
          const made = r ? resizeFloatBy(f.id, r[0], r[1]) : e.key === 'Enter' ? resetFloatSize(f.id) : null;
          if (!r && e.key !== 'Enter') return;
          e.preventDefault();
          e.stopPropagation();
          if (made) setSized(`${made.w} wide, ${made.h} tall`);
          return;
        }
        const d = e.key === 'ArrowLeft' ? [-step, 0] : e.key === 'ArrowRight' ? [step, 0] : e.key === 'ArrowUp' ? [0, -step] : e.key === 'ArrowDown' ? [0, step] : null;
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault();
          const at = menuPoint(e.currentTarget);
          return openDockMenu(at.x, at.y, floatMenu(f.id, at));
        }
        if (!d) return;
        e.preventDefault();
        setFloatWindowBox(f.id, { x: box.x + d[0], y: box.y + d[1] }, true);
      }}
    >
      <Icon name="grip" size={14} />
    </button>
  );

  const titleText = (
    <span
      className="ui-float-name"
      onDoubleClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        askRename(several || f.name ? 'float' : 'panel', several || f.name ? f.id : active, r.left, r.bottom + 4);
      }}
    >
      {title}
    </span>
  );

  return (
    <section
      className={`ui-float ui-float-${chrome}${front ? ' is-front' : ''}`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, zIndex: 20 + z }}
      aria-label={`${title} (floating window)`}
      data-float-id={f.id}
      data-dock-area=""
      data-dock-float={f.id}
      onPointerDownCapture={() => raiseFloatWindow(f.id)}
    >
      <div className="ui-float-head" data-dock-strip="" data-dock-float={f.id} data-dock-tabs={f.tabs.join(',')} data-dock-axis="x">
        <div
          className="ui-float-bar"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button, input, [data-dock-tab]')) return;
            startFloatDrag(e, { ...f, ...box });
          }}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest('button, [data-dock-tab], .ui-float-name')) return;
            dockFloatBack(f.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            openDockMenu(e.clientX, e.clientY, floatMenu(f.id, { x: e.clientX, y: e.clientY }));
          }}
        >
          {grip}
          {chrome === 'compact' && tabs}
          {chrome === 'titled' && titleText}
          <span className="ui-float-fill" />
          {buttons}
        </div>
        {chrome === 'titled' && several && <div className="ui-float-row">{tabs}</div>}
      </div>
      <span className="ui-sr-only" role="status" aria-live="polite">
        {sized}
      </span>
      {panel && (
        <div className="ui-panel ui-float-body" role="tabpanel" aria-labelledby={`ui-ftab-${active}`} data-panel-id={active}>
          <h2 className="ui-sr-only">{names?.[active] ?? panel.title}</h2>
          <PanelHost id={active} name={panelTitle(active)} />
        </div>
      )}
      {EDGES.map((e) => (
        <div key={e} className={`ui-float-rz ui-float-rz-${e}`} aria-hidden="true" onPointerDown={(ev) => startFloatResize(ev, { ...f, ...box }, e)} />
      ))}
    </section>
  );
});

/** A panel's body, kept from drawing again when only its window moves. */
const PanelHost = memo(function PanelHost({ id, name }: { id: string; name: string }) {
  const p = getPanel(id);
  if (!p) return null;
  return (
    <PanelScope id={id} title={name} help={p.help}>
      <PanelBoundary name={name} key={id}>
        <p.component />
      </PanelBoundary>
    </PanelScope>
  );
});
