// Listing source files for the tests that scan them. Every path this hands back uses forward slashes, on every system, so
// a test can compare one to 'io/autosave.ts' or match it with /ui\/mascot\// and mean the same thing on Windows, where
// path.join and path.relative give backslashes. (That mismatch made a dozen scans fail on Windows only, and a scan that
// matches nothing passes without saying so.) Windows accepts forward slashes when the file is opened, so they are fine to read.
import { readdirSync } from 'node:fs';
import path from 'node:path';

/** One spelling for a path: forward slashes. */
export const slash = (p: string): string => p.replace(/\\/g, '/');

/** `to` relative to `from`, with forward slashes. */
export const relative = (from: string, to: string): string => slash(path.relative(from, to));

/** Every file under `dir` (folders walked, in name order) whose name `accept` takes, as forward-slash paths. */
export function walkFiles(dir: string, accept: (name: string) => boolean = () => true): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const p = slash(path.join(dir, e.name));
    if (e.isDirectory()) out.push(...walkFiles(p, accept));
    else if (accept(e.name)) out.push(p);
  }
  return out;
}

/** The .ts and .tsx files under `dir`. */
export const sourceFiles = (dir: string): string[] => walkFiles(dir, (n) => /\.tsx?$/.test(n));
