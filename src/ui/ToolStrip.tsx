import { useEffect } from 'react';
import { allTools, getTool } from '../core/registry';
import { findLayer } from '../core/doc';
import type { LayerKind } from '../core/format';
import { store, useStore } from '../core/store';
import { syncDynamicCommands } from './dynamic';
import { Icon } from './icons';

/** The kind of layer being drawn on (the last one when none is picked), or null with no layers. */
function useActiveKind(): LayerKind | null {
  return useStore((s) => (findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1])?.kind ?? null);
}

export function ToolStrip() {
  syncDynamicCommands();
  const kind = useActiveKind();
  const current = useStore((s) => s.ui.tool);
  const tools = allTools().filter((t) => !kind || t.layers.includes(kind));
  const ids = tools.map((t) => t.id).join(',');

  // The picked tool doesn't work on this kind of layer: move to the first one that does.
  useEffect(() => {
    if (tools.length && getTool(current) && !tools.some((t) => t.id === current)) store().setUi({ tool: tools[0].id });
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
          onClick={() => store().setUi({ tool: t.id })}
        >
          <Icon name={t.icon} size={20} />
        </button>
      ))}
      {!tools.length && <span className="ui-tools-empty" aria-hidden="true"><Icon name="brush" size={20} /></span>}
    </nav>
  );
}
