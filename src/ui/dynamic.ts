// Commands that depend on what else is registered: one per tool (`tools.<id>`), one per panel (`view.panel.<id>`)
// and one per workspace. Tools and panels can register after this file loads, so this runs lazily: when the keymap
// is built, when the palette or a menu opens, and at startup. It's cheap to call again and again.
import { allPanels, allTools, getCommand, registerCommand, type Command } from '../core/registry';
import { findLayer } from '../core/doc';
import type { LayerKind } from '../core/format';
import { store } from '../core/store';
import { pickTool } from '../tools/wells';
import { applyWorkspace, currentWorkspace, isVisible, listWorkspaces, togglePanel } from './dock';

const mine = new Map<string, string>();
/** Commands of mine that point at something that's gone (a deleted workspace). Menus and the palette skip these. */
const stale = new Set<string>();

export const isDynamicCommand = (id: string) => mine.has(id);
export const isStaleCommand = (id: string) => stale.has(id);

function ensure(cmd: Command): void {
  const sig = JSON.stringify([cmd.label, cmd.keys, cmd.description, cmd.help]);
  const existing = getCommand(cmd.id);
  // Someone else registered this id themselves (a tool with its own richer command): leave theirs alone.
  if (existing && !mine.has(cmd.id)) return;
  if (existing && mine.get(cmd.id) === sig && !stale.has(cmd.id)) return;
  mine.set(cmd.id, sig);
  stale.delete(cmd.id);
  registerCommand(cmd);
}

export function toolEnabled(layers: LayerKind[]): boolean {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  return !layer || layers.includes(layer.kind);
}

export function syncDynamicCommands(): void {
  for (const t of allTools()) {
    ensure({
      id: `tools.${t.id}`,
      label: t.label,
      category: 'Tools',
      keys: t.key ? [t.key] : [],
      description: `Switch to the ${t.label.toLowerCase()} tool.`,
      help: t.help,
      keywords: ['tool'],
      enabled: () => toolEnabled(t.layers),
      checked: (s) => s.ui.tool === t.id,
      run: () => pickTool(t.id),
    });
  }
  for (const p of allPanels()) {
    ensure({
      id: `view.panel.${p.id}`,
      label: p.title,
      category: 'View',
      description: `Show or hide the ${p.title} panel.`,
      help: p.help,
      keywords: ['panel', 'window', 'show', 'hide'],
      checked: () => isVisible(p.id),
      run: () => togglePanel(p.id),
    });
  }
  const live = new Set<string>();
  for (const w of listWorkspaces()) {
    const id = `view.workspace.${w.id}`;
    live.add(id);
    ensure({
      id,
      label: `${w.name} workspace`,
      category: 'View',
      description: w.builtin ? `Arrange the panels for ${w.name.toLowerCase()}ing.` : 'Your saved panel layout.',
      help: 'workspaces',
      keywords: ['layout', 'panels', 'arrange', w.name],
      checked: () => currentWorkspace()?.id === w.id,
      run: () => void applyWorkspace(w.id),
    });
  }
  for (const id of [...mine.keys()]) {
    if (id.startsWith('view.workspace.') && !live.has(id) && !stale.has(id)) {
      stale.add(id);
      const c = getCommand(id);
      if (c) registerCommand({ ...c, enabled: () => false, label: `${c.label} (removed)` });
    }
  }
}
