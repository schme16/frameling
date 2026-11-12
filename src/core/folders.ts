/**
 * Nested layer folders. Pure helpers on the flat layer list: no DOM, no store.
 *
 * The layers stay one flat list, bottom first. A layer names the folder it sits directly in (`layer.folder`), and a
 * folder may name the folder it sits in (`folder.parent`). Every layer under a folder (directly or deeper) sits next to
 * the others, so the list reads like a tree walked in order. If a folder's layers got split up, each run is its own
 * copy of the folder (that is how files from older versions behave too).
 */
import type { Doc, Id, Layer, LayerFolder } from './format';

/** The deepest nesting: a folder at level 1 is on the stage, level 8 is the deepest allowed. */
export const MAX_FOLDER_DEPTH = 8;

type Folders = Doc['folders'];

/** A folder's ancestors then itself, outermost first. Stops at a missing folder or a loop. */
export function folderChain(folders: Folders, id: Id | undefined | null): LayerFolder[] {
  const out: LayerFolder[] = [];
  const seen = new Set<Id>();
  let cur = id ? folders?.[id] : undefined;
  while (cur && !seen.has(cur.id) && out.length < MAX_FOLDER_DEPTH) {
    seen.add(cur.id);
    out.push(cur);
    cur = cur.parent ? folders?.[cur.parent] : undefined;
  }
  return out.reverse();
}

/** The folders a layer sits in, outermost first (empty on the stage). */
export function layerFolders(doc: Pick<Doc, 'folders'>, l: Pick<Layer, 'folder'>): LayerFolder[] {
  return folderChain(doc.folders, l.folder);
}

/** How deep a folder sits: 1 on the stage, 2 inside another folder... 0 for a missing folder. */
export function folderLevel(doc: Pick<Doc, 'folders'>, id: Id): number {
  return folderChain(doc.folders, id).length;
}

/** How deep a layer sits: 0 on the stage, 1 in a top folder... */
export function layerLevel(doc: Pick<Doc, 'folders'>, l: Pick<Layer, 'folder'>): number {
  return layerFolders(doc, l).length;
}

/** False when the layer, or any folder around it, is hidden. */
export function layerShown(doc: Pick<Doc, 'folders'>, l: Pick<Layer, 'folder' | 'visible'>): boolean {
  return l.visible && layerFolders(doc, l).every((f) => f.visible);
}

/** The id of `id` and every folder inside it. */
export function folderAndDescendants(folders: Folders, id: Id): Set<Id> {
  const out = new Set<Id>([id]);
  if (!folders) return out;
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of Object.values(folders)) {
      if (f.parent && out.has(f.parent) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return out;
}

/** True when the layer sits in `folderId` or any folder inside it. */
export function layerIsUnder(doc: Pick<Doc, 'folders'>, l: Pick<Layer, 'folder'>, folderId: Id): boolean {
  return layerFolders(doc, l).some((f) => f.id === folderId);
}

/** The layers under a folder (directly or deeper), in list order. */
export function layersUnder<T extends Pick<Layer, 'folder'>>(doc: Pick<Doc, 'folders'> & { layers: T[] }, folderId: Id): T[] {
  return doc.layers.filter((l) => layerIsUnder(doc, l, folderId));
}

/** How many levels of folders are inside `id` (0 for a folder with no folder in it). */
export function folderHeight(folders: Folders, id: Id): number {
  if (!folders) return 0;
  let h = 0;
  for (const f of Object.values(folders)) {
    if (f.parent !== id) continue;
    h = Math.max(h, 1 + folderHeight(folders, f.id));
  }
  return h;
}

// ---------------------------------------------------------------- the tree

export type LayerNode = { type: 'layer'; layer: Layer; depth: number };
export type FolderNode = { type: 'folder'; folder: LayerFolder; depth: number; children: TreeNode[] };
export type TreeNode = LayerNode | FolderNode;

/**
 * The layer list as a tree, children in list order (bottom first). A folder's layers that sit apart make a node each
 * (a copy of the folder per run). `depth` is 0 on the stage.
 */
export function layerTree(doc: Pick<Doc, 'folders'> & { layers: Layer[] }): TreeNode[] {
  const root: TreeNode[] = [];
  const open: FolderNode[] = [];
  for (const l of doc.layers) {
    const chain = layerFolders(doc, l);
    let k = 0;
    while (k < open.length && k < chain.length && open[k].folder.id === chain[k].id) k++;
    open.length = k;
    for (; k < chain.length; k++) {
      const node: FolderNode = { type: 'folder', folder: chain[k], depth: k, children: [] };
      (k === 0 ? root : open[k - 1].children).push(node);
      open.push(node);
    }
    (open.length ? open[open.length - 1].children : root).push({ type: 'layer', layer: l, depth: chain.length });
  }
  return root;
}

/** Every layer under a node, in list order. */
export function nodeLayers(n: TreeNode): Layer[] {
  if (n.type === 'layer') return [n.layer];
  return n.children.flatMap(nodeLayers);
}

/** Walks the tree depth first, parents before their children, in list order. */
export function walkTree(nodes: TreeNode[], f: (n: TreeNode) => void): void {
  for (const n of nodes) {
    f(n);
    if (n.type === 'folder') walkTree(n.children, f);
  }
}
