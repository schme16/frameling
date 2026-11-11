/**
 * Registries every feature plugs into, so no feature needs to edit another's files:
 *
 * - **Commands**: anything a person can do. They feed the command palette, menus, keyboard shortcuts and
 *   tooltips. Every command names its help topic.
 * - **Help topics**: the in-app docs. A feature isn't done until its topic is written (plain words, short summary,
 *   longer body in Markdown).
 * - **Panels**: dockable panels (Timeline, Colours, Layers, Tool options...).
 * - **Tools**: canvas tools (brush, eraser, fill...).
 */
import type { ComponentType } from 'react';
import type { LayerKind } from './format';
import type { State } from './store';

// ---------------------------------------------------------------- commands

export interface Command {
  /** Stable id, `area.verb`, e.g. `edit.undo`, `timeline.nextFrame`. */
  id: string;
  /** What people see, in plain words ("Next frame"). */
  label: string;
  /** Groups commands in the palette and keymap list ("Edit", "Timeline", "Tools"). */
  category: string;
  /** Default shortcuts, e.g. `['Mod+Z']`. `Mod` is Ctrl on Windows/Linux and Cmd on macOS. Use `key` names from KeyboardEvent.key, with `Space` for ' '. */
  keys?: string[];
  /** Short line shown in the palette and tooltips. */
  description?: string;
  /** Help topic id for "Learn more". */
  help?: string;
  /** Extra words people might search for ("onion skin" -> "ghost, see through"). */
  keywords?: string[];
  /** Grey out when false. */
  enabled?: (s: State) => boolean;
  /** Shows a tick in menus when true. */
  checked?: (s: State) => boolean;
  run: () => void | Promise<void>;
  /** Runs even while typing in a text field (default false). */
  global?: boolean;
  /** Only works on these layer kinds (tools). Two commands may share a shortcut when these never overlap. */
  layers?: LayerKind[];
}

const commands = new Map<string, Command>();

export function registerCommand(c: Command): void {
  commands.set(c.id, c);
}
export function registerCommands(list: Command[]): void {
  for (const c of list) registerCommand(c);
}
export function getCommand(id: string): Command | undefined {
  return commands.get(id);
}
/** Takes a command away again (a plugin turned off). */
export function unregisterCommand(id: string): void {
  commands.delete(id);
}
export function allCommands(): Command[] {
  return [...commands.values()];
}

// ---------------------------------------------------------------- help

export interface HelpTopic {
  id: string;
  title: string;
  /** One or two plain sentences. Shown in tooltips' "Learn more" and search results. */
  summary: string;
  /** Markdown. Can link to other topics with `[text](help:topic-id)`. */
  body: string;
  /** Where it sits in the help contents ("Getting started", "Drawing", "Animating", "Exporting"...). */
  section: string;
  keywords?: string[];
  /** Optional picture or video shown at the top (path under public/help/). */
  media?: string;
  /** Place in its section's list, lower first (missing = 50, then by title). Lets a section open with its overview. */
  order?: number;
}

const topics = new Map<string, HelpTopic>();

export function registerHelp(t: HelpTopic): void {
  topics.set(t.id, t);
}
export function registerHelpTopics(list: HelpTopic[]): void {
  for (const t of list) registerHelp(t);
}
export function getHelp(id: string): HelpTopic | undefined {
  return topics.get(id);
}
export function allHelp(): HelpTopic[] {
  return [...topics.values()];
}

// ---------------------------------------------------------------- panels

export type DockZone = 'left' | 'right' | 'bottom';

export interface PanelDef {
  id: string;
  title: string;
  /** Icon name from the shared icon set (src/ui/icons.tsx). */
  icon: string;
  component: ComponentType;
  /** Where it docks in the default workspace. */
  zone: DockZone;
  /** Order within that zone (lower first). */
  order?: number;
  help?: string;
}

const panels = new Map<string, PanelDef>();

export function registerPanel(p: PanelDef): void {
  panels.set(p.id, p);
}
export function getPanel(id: string): PanelDef | undefined {
  return panels.get(id);
}
/** Takes a panel away again (a plugin turned off). */
export function unregisterPanel(id: string): void {
  panels.delete(id);
}
export function allPanels(): PanelDef[] {
  return [...panels.values()].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
}

// ---------------------------------------------------------------- tools

/** A pointer event on the canvas, already converted to document coordinates. */
export interface ToolPointer {
  /** Document pixels. */
  x: number;
  y: number;
  /** 0 to 1. 0.5 for devices without pressure. */
  pressure: number;
  /** True when the device really reports pressure (pen). */
  hasPressure: boolean;
  shift: boolean;
  alt: boolean;
  mod: boolean;
  button: number;
  pointerType: string;
  /** Milliseconds, for velocity. */
  time: number;
}

/** What a tool gets from the canvas. */
export interface ToolContext {
  /** Current zoom (screen pixels per document pixel), so handles and hit radii can stay the same size on screen. */
  zoom: number;
  /** Ask the canvas to redraw the overlay (the tool's live preview). */
  requestOverlay(): void;
  /** Show a short friendly message near the cursor or as a toast ("This layer is locked"). */
  hint(message: string): void;
}

export interface Tool {
  id: string;
  label: string;
  /** Icon name from src/ui/icons.tsx. */
  icon: string;
  /** Default shortcut (a single key like 'b', or 'Shift+K'); registered as a `tools.<id>` command automatically. */
  key?: string;
  /** Which layer kinds it works on. */
  layers: LayerKind[];
  /** Toolbar order (lower first). */
  order?: number;
  help?: string;
  cursor?: string;
  /** Tool options shown in the Tool options panel. */
  options?: ComponentType;
  down?(e: ToolPointer, ctx: ToolContext): void;
  move?(e: ToolPointer, ctx: ToolContext): void;
  up?(e: ToolPointer, ctx: ToolContext): void;
  /** Hover without a button pressed. */
  hover?(e: ToolPointer, ctx: ToolContext): void;
  /** Escape pressed or tool switched mid-gesture. */
  cancel?(ctx: ToolContext): void;
  /** Draw the live preview on top of the stage, in document coordinates (the canvas sets up the transform). */
  overlay?(g: CanvasRenderingContext2D, ctx: ToolContext): void;
}

const tools = new Map<string, Tool>();

export function registerTool(t: Tool): void {
  tools.set(t.id, t);
}
export function getTool(id: string): Tool | undefined {
  return tools.get(id);
}
export function allTools(): Tool[] {
  return [...tools.values()].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
}
