import { useEffect, useState } from 'react';
import { allTools, getTool } from '../core/registry';
import { findLayer } from '../core/doc';
import type { LayerKind } from '../core/format';
import { store, useStore } from '../core/store';
import { syncDynamicCommands } from './dynamic';
import { pickTool } from '../tools/pick';
import { Icon } from './icons';
import { currentWorkspace, dock, stripTools } from './dock';
import { startToolsDrag, nudgeTools } from './dockDrag';
import { menuPoint, openDockMenu, toolsMenu } from './dockMenus';
import type { DockZone } from './dockModel';

/** The kind of layer being drawn on (the last one when none is picked), or null with no layers. */
function useActiveKind(): LayerKind | null {
  return useStore((s) => (findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1])?.kind ?? null);
}

/** The tool rail where it is docked: it renders in the slot of the side it was put on, and nowhere else. */
export function ToolSlot({ at }: { at: DockZone }) {
  const place = dock.use((d) => d.layout.tools.place);
  return place === at ? <ToolStrip place={at} /> : null;
}

/** The tool rail as a small window over the canvas, when it has been floated. */
export function ToolFloat() {
  const place = dock.use((d) => d.layout.tools.place);
  const x = dock.use((d) => d.layout.tools.x);
  const y = dock.use((d) => d.layout.tools.y);
  const [h, setH] = useState(window.innerHeight);
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  if (place !== 'float') return null;
  return (
    <div className="ui-float-tools" style={{ left: Math.min(x, window.innerWidth - 60), top: Math.min(y, h - 80), maxHeight: Math.max(120, h - y - 12) }}>
      <ToolStrip place="float" />
    </div>
  );
}

export function ToolStrip({ place = 'left' }: { place?: DockZone | 'float' }) {
  syncDynamicCommands();
  const sideways = place === 'top' || place === 'bottom';
  const kind = useActiveKind();
  const current = useStore((s) => s.ui.tool);
  // The workspace can narrow the strip (the Pixel workspace shows only pixel art tools on pixel layers).
  const wsId = dock.use((d) => d.workspaceId);
  const usable = allTools().filter((t) => !kind || t.layers.includes(kind));
  const tools = stripTools(usable, kind, wsId ? currentWorkspace() : undefined);
  const ids = tools.map((t) => t.id).join(',');

  // The picked tool doesn't work on this kind of layer: move to the first one that does. A tool the workspace only
  // leaves out of the strip still works (picked by its key, say), so it's left alone.
  useEffect(() => {
    if (tools.length && getTool(current) && !usable.some((t) => t.id === current)) store().setUi({ tool: tools[0].id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, ids]);

  const onKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const at = menuPoint(document.activeElement ?? e.currentTarget);
      return openDockMenu(at.x, at.y, toolsMenu());
    }
    const next = sideways ? 'ArrowRight' : 'ArrowDown';
    const back = sideways ? 'ArrowLeft' : 'ArrowUp';
    if (e.key !== next && e.key !== back) return;
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button.ui-tool')];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    buttons[(at + (e.key === next ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  };


  return (
    <nav
      className={`ui-tools${sideways ? ' is-sideways' : ''}${place === 'float' ? ' is-floating' : ''}`}
      aria-label="Tools"
      data-help="tool-strip"
      onKeyDown={onKey}
      onContextMenu={(e) => {
        e.preventDefault();
        openDockMenu(e.clientX, e.clientY, toolsMenu());
      }}
    >
      <button
        type="button"
        className="ui-tools-grip"
        aria-label="Move the tools. Arrow keys nudge them while they float."
        data-tip="Move the tools"
        data-tip-desc="Drag to float them, or onto a side of the canvas to dock them there. Right-click for more."
        data-help="tool-strip"
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          startToolsDrag(e, { x: e.clientX - r.left + 4, y: e.clientY - r.top + 4 });
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 64 : 16;
          const d = e.key === 'ArrowLeft' ? [-step, 0] : e.key === 'ArrowRight' ? [step, 0] : e.key === 'ArrowUp' ? [0, -step] : e.key === 'ArrowDown' ? [0, step] : null;
          if (!d || place !== 'float') return;
          e.preventDefault();
          e.stopPropagation();
          nudgeTools(d[0], d[1]);
        }}
      >
        <Icon name="grip" size={14} />
      </button>
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`ui-tool${current === t.id ? ' is-chosen' : ''}`}
          aria-label={t.label}
          aria-pressed={current === t.id}
          data-command={`tools.${t.id}`}
          data-help={t.help}
          onClick={() => pickTool(t.id)}
        >
          <Icon name={t.icon} size={20} />
        </button>
      ))}
      {!tools.length && <span className="ui-tools-empty" aria-hidden="true"><Icon name="brush" size={20} /></span>}
    </nav>
  );
}
