// Menu paths named in words: **View > Panels > Library**. Pure, so a test can hold every one of them against the real
// menus and a path that moved is caught the day it moves, not the day someone goes looking in the wrong menu.
import type { MenuItem } from '../menus';

/** A menu, a submenu or an item, by the words on screen. Only menus and submenus have `items`. */
export interface MenuNode {
  label: string;
  items?: MenuNode[];
}

/** The menus as the bar shows them: the title on screen, then what is in it, submenus nested. */
export function toMenuTree(items: MenuItem[]): MenuNode[] {
  const out: MenuNode[] = [];
  for (const it of items) {
    if (it.kind === 'command') out.push({ label: it.command.label });
    else if (it.kind === 'submenu') out.push({ label: it.label, items: toMenuTree(it.items) });
  }
  return out;
}

/**
 * Places a path may start that are not ours to check: another program's menu (Unity's
 * Window > Package Manager), and the ⋯ button on a panel row.
 */
export const NOT_MENUS = ['Window', '\u22ef'];

// "Export..." on screen, "Export" in a sentence; and "(repeat around the edges)" is the menu explaining itself.
const norm = (s: string): string =>
  s
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/(\.\.\.|…)\s*$/, '')
    .trim()
    .toLowerCase();

/** The `**A > B > C**` paths in a body, each as its parts. A bold word with no `>` in it is not a path. */
export function menuPathsIn(md: string): string[][] {
  const out: string[][] = [];
  for (const m of md.matchAll(/\*\*([^*\n]+?)\*\*/g)) {
    if (!m[1].includes(' > ')) continue;
    out.push(m[1].split(' > ').map((s) => s.trim()));
  }
  return out;
}

const find = (nodes: MenuNode[], label: string): MenuNode | undefined => nodes.find((n) => norm(n.label) === norm(label));

/** Every full path to something with this label, so a stale path can say where it went. */
function whereIs(nodes: MenuNode[], label: string, trail: string[] = []): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    const here = [...trail, n.label];
    if (norm(n.label) === norm(label) && here.length > 1) out.push(here.join(' > '));
    if (n.items) out.push(...whereIs(n.items, label, here));
  }
  return out;
}

/** What is wrong with a path, or `undefined` when it leads somewhere (or isn't ours to check). */
export function menuPathProblem(path: string[], menus: MenuNode[], notMenus: string[] = NOT_MENUS): string | undefined {
  if (notMenus.some((n) => norm(n) === norm(path[0]))) return undefined;
  let level: MenuNode[] = menus;
  let node: MenuNode | undefined;
  for (let i = 0; i < path.length; i++) {
    node = find(level, path[i]);
    if (!node) {
      const where = whereIs(menus, path[i]);
      const hint = where.length ? `it is at ${where.join(' or ')}` : i === 0 ? 'there is no menu by that name' : 'not in the menus';
      return `"${path[i]}" is not in ${i ? path.slice(0, i).join(' > ') : 'the menu bar'} (${hint})`;
    }
    if (i < path.length - 1) {
      if (!node.items) return `"${path[i]}" is an item, not a menu`;
      level = node.items;
    }
  }
  return undefined;
}

/** `where: path (what is wrong)` for every path in the body that doesn't lead anywhere. */
export function menuPathDrift(where: string, md: string, menus: MenuNode[], notMenus?: string[]): string[] {
  const out: string[] = [];
  for (const p of new Set(menuPathsIn(md).map((x) => x.join(' > ')))) {
    const why = menuPathProblem(p.split(' > '), menus, notMenus);
    if (why) out.push(`${where}: ${p} (${why})`);
  }
  return out;
}
