// Tools that share one rail button, with the rest behind it in a pull-out (Illustrator's way): a Brush stack, an Eraser stack,
// the Retouch tools. The button shows the tool used last from the stack and a corner mark says there is more. This is the plain
// logic, so it is tested without a screen. A group or any run of tools next to each other can be a stack: `ToolGroup.stacks`
// (toolArrange.ts) holds the runs, and a tool says which stack it starts in with `Tool.stack` (registry.ts).

export interface ToolStack {
  /** Which stack it is: a tool's `stack` (so it has a name), or one the person made. */
  id: string;
  /** The tools, in the order of the pull-out. They sit next to each other in their group. */
  tools: string[];
}

/** What a plain click on a stack picks: the tool used last (Illustrator's way), or always the first. */
export type StackClick = 'last' | 'first';
/** Whether similar tools share a button at all. */
export type StackMode = 'share' | 'apart';

/** The two settings (registered in drawingMode.ts, shown in Preferences > Behaviour). */
export const STACK_CLICK_CHOICE = 'tools.stackClick';
export const STACK_SHARE_CHOICE = 'tools.stackShare';

/** The words for the stacks that come with the app: the title of the pull-out. */
export const STACK_NAMES: Record<string, string> = {
  brush: 'Brushes',
  eraser: 'Erasers',
  retouch: 'Retouch',
};

/** The title of a stack's pull-out. */
export const stackName = (id: string): string => STACK_NAMES[id] ?? 'Tools';

/**
 * The stacks that hold up: only tools the group has, each stack's tools next to each other and in the group's order, a
 * tool in one stack only, and at least two tools in a stack (one tool is just a tool). A stack that was broken up by a move is dropped.
 */
export function cleanStacks(tools: readonly string[], stacks: readonly ToolStack[] | undefined): ToolStack[] {
  if (!stacks?.length) return [];
  const out: ToolStack[] = [];
  const used = new Set<string>();
  const seen = new Set<string>();
  for (const s of stacks) {
    if (seen.has(s.id)) continue;
    const at = s.tools.map((t) => tools.indexOf(t));
    if (s.tools.length < 2 || at.some((i) => i < 0) || s.tools.some((t) => used.has(t))) continue;
    const sorted = [...at].sort((a, b) => a - b);
    // Next to each other, in the order the group has them.
    if (sorted.some((v, i) => i > 0 && v !== sorted[i - 1] + 1)) continue;
    const ordered = sorted.map((i) => tools[i]);
    ordered.forEach((t) => used.add(t));
    seen.add(s.id);
    out.push({ id: s.id, tools: ordered });
  }
  return out;
}

/** The stacks a group starts with: each run of tools next to each other that name the same stack. */
export function defaultStacks(tools: readonly string[], stackOf: (id: string) => string | undefined): ToolStack[] {
  const out: ToolStack[] = [];
  let run: ToolStack | null = null;
  for (const t of tools) {
    const id = stackOf(t);
    if (id && run && run.id === id) run.tools.push(t);
    else {
      if (run && run.tools.length > 1) out.push(run);
      run = id ? { id, tools: [t] } : null;
    }
  }
  if (run && run.tools.length > 1) out.push(run);
  return out;
}

/** A stack with only the tools that show now; null when fewer than two are left (the one left is just a tool). */
export function visibleStack(s: ToolStack, visible: (id: string) => boolean): ToolStack | null {
  const tools = s.tools.filter(visible);
  return tools.length > 1 ? { id: s.id, tools } : null;
}

/** One place on the rail: a tool of its own, or a stack of tools sharing one button. */
export interface RailUnit {
  /** The stack's id, or the tool's own id when it stands alone. */
  id: string;
  tools: string[];
  /** More than one tool behind the button. */
  stack: boolean;
}

/**
 * A group's places on the rail, in order. A stack takes the place of its first tool; its other tools come out of the run.
 * `tools` are the tools that show. With `share` off every tool is a place of its own.
 */
export function railUnits(tools: readonly string[], stacks: readonly ToolStack[] | undefined, share = true): RailUnit[] {
  const byTool = new Map<string, ToolStack>();
  if (share) for (const s of stacks ?? []) for (const t of s.tools) if (tools.includes(t)) byTool.set(t, s);
  const out: RailUnit[] = [];
  const done = new Set<string>();
  for (const t of tools) {
    if (done.has(t)) continue;
    const s = byTool.get(t);
    const mine = s ? s.tools.filter((x) => tools.includes(x)) : [];
    if (!s || mine.length < 2) {
      out.push({ id: t, tools: [t], stack: false });
      continue;
    }
    mine.forEach((x) => done.add(x));
    out.push({ id: s.id, tools: mine, stack: true });
  }
  return out;
}

/**
 * The tool a place's button stands for. The tool in use if it is in the stack; else, when clicks go to the one used last,
 * the one remembered from this stack; else the first that works on this layer, or the first of all when none does.
 * With clicks that always go to the first, the button is the first (that works).
 */
export function frontOfUnit(unit: Pick<RailUnit, 'tools'>, o: { current: string; remembered?: string; off: ReadonlySet<string>; click?: StackClick }): string {
  const { tools } = unit;
  const firstWorking = tools.find((t) => !o.off.has(t)) ?? tools[0];
  if (o.click === 'first') return firstWorking;
  if (tools.includes(o.current)) return o.current;
  if (o.remembered && tools.includes(o.remembered) && !o.off.has(o.remembered)) return o.remembered;
  return firstWorking;
}

/**
 * Tools the layer leaves off the rail (hide, not grey) that stay in their stack, greyed, so a stack never loses a tool without
 * saying why: hiding removes nothing. The Soft brush stays in the Brush's pull-out on a vector layer, and the Retouch button
 * stays on the rail with all its tools greyed. `pool` is the tools that exist on this rail at all, `shown` the ones it shows now.
 */
export function greyedInStacks(stacks: readonly ToolStack[], shown: ReadonlySet<string>, pool: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const s of stacks) for (const t of s.tools) if (pool.has(t) && !shown.has(t)) out.push(t);
  return out;
}

/** The arrangement's stacks with one taken apart (its tools stay where they are, one button each). */
export function withoutStack(stacks: readonly ToolStack[] | undefined, id: string): ToolStack[] {
  return (stacks ?? []).filter((s) => s.id !== id);
}
