// Running undo and redo patches without immer.
//
// Undo and redo are patches, and immer's own `applyPatches` runs them inside `produce`: it drafts the document, lets
// the patches write into the draft, then walks the whole result to turn drafts back into plain values. That last walk
// is the expensive part, and it costs the same whether a step touched one number or put a whole layer back. Undoing
// three layer deletes on a 40 layer, 240 key drawing measured 107 ms an undo, and 171 of its 176 ms were inside
// immer: `finalize` walking values, `isDraftable` asking about each one, `shallowCopy` copying them.
//
// A patch already says exactly where it writes, so none of that walking is needed. `applyPatchesHere` copies only the
// containers along each patch's path (the same structural sharing immer gives: everything the step did not touch stays
// the very same object) and writes the value in. Nothing else in the document is looked at.
//
// It keeps immer's semantics exactly, including the deep copy of a value going in, so the history and the live
// document never share a mutable object. Anything it does not know how to do (a Map, a Set, a path through something
// that is not a plain object or an array) makes it return null, and the caller runs immer instead. The test
// `test/core/patch.test.ts` checks the two agree.
import type { Patch } from 'immer';

type Key = string | number;
type Node = Record<Key, unknown>;

const isPlain = (x: unknown): x is Node => {
  if (x === null || typeof x !== 'object') return false;
  if (Array.isArray(x)) return true;
  const p = Object.getPrototypeOf(x);
  return p === Object.prototype || p === null;
};

/** immer's `deepClonePatchValue`: plain objects and arrays are copied, everything else (a pixel array, a number) is not. */
function cloneValue(v: unknown): unknown {
  if (!isPlain(v)) return v;
  if (Array.isArray(v)) return v.map(cloneValue);
  const out: Node = {};
  for (const k of Object.keys(v)) out[k] = cloneValue((v as Node)[k]);
  return out;
}

const shallow = (x: Node): Node => (Array.isArray(x) ? (x.slice() as unknown as Node) : { ...x });

/**
 * Runs `patches` over `doc` and gives back a new document, sharing everything the patches did not touch. Returns null
 * for anything it does not handle, so the caller can fall back to immer.
 */
export function applyPatchesHere<T>(doc: T, patches: readonly Patch[]): T | null {
  if (!patches.length) return doc;
  if (!isPlain(doc)) return null;
  // A frozen document means immer's auto-freeze is on (under test, and in the harnesses with ?debug). That freeze is a
  // safety net worth keeping: a write in place into a committed document throws where it happens. So the new document
  // gets frozen the same way at the end, which keeps the net and keeps this path running in every test rather than
  // only in the built app.
  const refreeze = Object.isFrozen(doc);
  // The containers this call has already copied, so a second patch down the same path reuses the copy rather than
  // copying again. Without this a step with many patches would copy the same list once per patch.
  const mine = new Set<object>();
  let root = shallow(doc as unknown as Node);
  mine.add(root);
  for (const p of patches) {
    const path = p.path as readonly Key[];
    if (!path.length) return null; // replacing the whole document: rare, and immer's job
    let node = root;
    for (let i = 0; i < path.length - 1; i++) {
      const child = node[path[i]];
      if (!isPlain(child)) return null;
      if (mine.has(child)) { node = child as Node; continue; }
      const copy = shallow(child as Node);
      mine.add(copy);
      node[path[i]] = copy;
      node = copy;
    }
    const key = path[path.length - 1];
    const arr = Array.isArray(node);
    switch (p.op) {
      case 'replace':
        if (arr && key === 'length') {
          if (typeof p.value !== 'number') return null;
          (node as unknown as unknown[]).length = p.value;
        } else node[key] = cloneValue(p.value);
        break;
      case 'add':
        if (arr) {
          if (key === '-') (node as unknown as unknown[]).push(cloneValue(p.value));
          else if (typeof key === 'number') (node as unknown as unknown[]).splice(key, 0, cloneValue(p.value));
          else return null;
        } else node[key] = cloneValue(p.value);
        break;
      case 'remove':
        if (arr) {
          if (typeof key !== 'number') return null;
          (node as unknown as unknown[]).splice(key, 1);
        } else delete node[key];
        break;
      default:
        return null;
    }
  }
  if (refreeze) deepFreeze(root);
  return root as unknown as T;
}

/**
 * Freezes what this call made, the way immer's auto-freeze does: stop at anything already frozen, because the old
 * document was frozen all the way down and everything the patches did not touch is still that same object.
 */
function deepFreeze(x: unknown): void {
  if (!isPlain(x) || Object.isFrozen(x)) return;
  Object.freeze(x);
  if (Array.isArray(x)) { for (const v of x) deepFreeze(v); return; }
  for (const k of Object.keys(x)) deepFreeze((x as Node)[k]);
}
