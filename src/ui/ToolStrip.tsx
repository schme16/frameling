import { useEffect } from 'react';
import { allTools, getTool } from '../core/registry';
import { findLayer } from '../core/doc';
import type { LayerKind } from '../core/format';
import { store, useStore } from '../core/store';
import { syncDynamicCommands } from './dynamic';
import { pickTool } from '../tools/pick';
import { Icon } from './icons';
import { currentWorkspace, dock, stripTools } from './dock';

/** The kind of layer being drawn on (the last one when none is picked), or null with no layers. */
function useActiveKind(): LayerKind | null {
  return useStore((s) => (findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1])?.kind ?? null);
}

export function ToolStrip() {
  syncDynamicCommands();
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
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    buttons[(at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  };

  return (
    <nav className="ui-tools" aria-label="Tools" data-help="tool-strip" onKeyDown={onKey}>
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
