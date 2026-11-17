/**
 * What only means something once a drawing has animation, and so is left out of sight on a still picture. One small
 * list, so what hides is decided here and nowhere else: the rail, the panels, the menus, the palette and the keys all
 * ask these functions. Plain data and pure functions.
 *
 * Nothing in the list is removed. Each one still turns up in the command palette and in help; choosing it on a still
 * offers Add animation and then carries on (src/core/animationGate.ts says how, kind `offers`).
 *
 * An entry is `kind:id`, with kind one of:
 *   panel     a panel's id (and its Show or hide command)
 *   tool      a tool's id (and its command, `tools.<id>`)
 *   menu      a menu by its label in MENUS (the menu leaves the bar)
 *   category  every command of a category
 *   command   one command by its id
 */
export type OnlyKind = 'panel' | 'tool' | 'menu' | 'category' | 'command';

/**
 * The rig tools, the Rig panel and the Rigging menu are NOT in the set: a still can be posed, so they stay.
 * To hide them on a still as well, add one line to ANIMATION_ONLY below: `...RIG_KIT,`.
 */
export const RIG_KIT: readonly string[] = [
  'tool:bone',
  'tool:bone-edit',
  'tool:bone-remove',
  'tool:pose',
  'tool:weights',
  'panel:rig',
  'menu:Extras', // the Rigging menu: its label in MENUS is still Extras (saved menu changes name it)
  'category:Rig',
];

export const ANIMATION_ONLY: ReadonlySet<string> = new Set<string>([
  // Panels
  'panel:lipsync',
  'panel:draw-on',
  'panel:clip-flow',
  // The tools that move things over time
  'tool:motion-path',
  'tool:record-move',
  'tool:shape-hints',
  // Commands that go with them
  'category:Lip sync',
  'command:flow.open',
]);

export const isAnimationOnly = (kind: OnlyKind, id: string, set: ReadonlySet<string> = ANIMATION_ONLY): boolean => set.has(`${kind}:${id}`);

/** The ids of one kind that are in the set, in the order they are listed. */
export const animationOnlyOf = (kind: OnlyKind): string[] => [...ANIMATION_ONLY].filter((e) => e.startsWith(`${kind}:`)).map((e) => e.slice(kind.length + 1));

/** Panels left out of sight on a still. */
export const animationOnlyPanels = (): ReadonlySet<string> => new Set(animationOnlyOf('panel'));

/** Tools left off the rail on a still. */
export const animationOnlyTools = (): ReadonlySet<string> => new Set(animationOnlyOf('tool'));

/** True when a command belongs to something in the set: its panel's or tool's own command, a whole category, or it by name. */
export function commandIsAnimationOnly(c: { id: string; category: string }, set: ReadonlySet<string> = ANIMATION_ONLY): boolean {
  if (isAnimationOnly('command', c.id, set) || isAnimationOnly('category', c.category, set)) return true;
  if (c.id.startsWith('view.panel.')) return isAnimationOnly('panel', c.id.slice('view.panel.'.length), set);
  if (c.id.startsWith('tools.')) return isAnimationOnly('tool', c.id.slice('tools.'.length), set);
  return false;
}

/** The tool to be on once the drawing is a still: the same one, or Select when it is one that needs animation. */
export const toolForStill = (tool: string, animated: boolean): string => (!animated && isAnimationOnly('tool', tool) ? 'select' : tool);
