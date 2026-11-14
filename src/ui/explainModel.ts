// The words that used to sit on show in every panel (the explainers), and where they go instead: behind a help icon.
// Pure helpers and the small store that carries the words from where they are written (a Tip, a hint under a control)
// to the icon in the panel's title bar or on its section heading. Nothing here draws anything, so it is tested on its own.
import { Children, isValidElement, type ReactNode } from 'react';
import { createStore } from './mini';

/** The plain words in a piece of JSX: strings and numbers joined, tags dropped, runs of spaces made one. */
export function wordsOf(node: ReactNode): string {
  const out: string[] = [];
  const walk = (n: ReactNode) => {
    if (n === null || n === undefined || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') out.push(String(n));
    else if (Array.isArray(n)) n.forEach(walk);
    else if (isValidElement<{ children?: ReactNode }>(n)) Children.forEach(n.props.children, walk);
  };
  walk(node);
  return out.join('').replace(/\s+/g, ' ').trim();
}

/** Several explainers in one tooltip: one after another, each ending in a full stop's worth of space. */
export function joinWords(list: string[]): string {
  return list.map((s) => s.trim()).filter(Boolean).join(' ');
}

interface Entry {
  token: string;
  words: string;
}

/** Scope id to the words registered in it, in the order they were put there. */
const scopes = createStore<Record<string, Entry[]>>({});

/** Puts words into a scope (a panel, a section). Returns the way to take them out again. */
export function addWords(scope: string, token: string, words: string): () => void {
  if (!words) return () => {};
  scopes.set((all) => ({ ...all, [scope]: [...(all[scope] ?? []).filter((e) => e.token !== token), { token, words }] }));
  return () => scopes.set((all) => {
    const left = (all[scope] ?? []).filter((e) => e.token !== token);
    const next = { ...all };
    if (left.length) next[scope] = left;
    else delete next[scope];
    return next;
  });
}

/** Everything written in a scope, as one string ('' when nothing). */
export const wordsIn = (scope: string | null | undefined): string => (scope ? joinWords((scopes.get()[scope] ?? []).map((e) => e.words)) : '');
/** The same, for a component: re-renders when the words change. */
export const useWordsIn = (scope: string | null | undefined): string => scopes.use((all) => (scope ? joinWords((all[scope] ?? []).map((e) => e.words)) : ''));

/**
 * Whether the explanations are on show, from the preference. A new person starts with them on (they should meet the
 * words once); someone who was already here before the switch existed starts with them tucked away. Pure, so it is tested.
 */
export function showExplanationsDefault(stored: { showExplanations?: unknown; onboarded?: unknown }): boolean {
  if (typeof stored.showExplanations === 'boolean') return stored.showExplanations;
  return stored.onboarded !== true;
}

/** The tooltip for a scope's icon: the one-line blurb first, then whatever explainers were written inside it. */
export function tipWords(blurb: string | undefined, scope: string | null | undefined): string {
  return joinWords([blurb ?? '', wordsIn(scope)]);
}
