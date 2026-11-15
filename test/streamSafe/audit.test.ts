import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findRawDisplays, SAFE_CALLS } from './scan';
const SAFE = [...SAFE_CALLS];

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(path.join(dir, f)).isDirectory() ? walk(path.join(dir, f)) : [path.join(dir, f)]));
const files = walk(src).filter((f) => /\.tsx$/.test(f));

describe('every screen shows paths, names and keys through the stream-safe helper', () => {
  it('finds no raw path, name or key on any screen', () => {
    const bad = files.flatMap((f) => findRawDisplays(f, readFileSync(f, 'utf8')).map((x) => `${path.relative(src, f)}:${x.line}  ${x.text}  (${x.why})`));
    expect(bad).toEqual([]);
  });
});

import { findRawMessages } from './scan';
describe('every toast shows paths and file names through the helper', () => {
  it('finds no raw path or file name in a toast', () => {
    const all = walk(src).filter((f) => /\.tsx?$/.test(f) && !/\.bodies\.ts$/.test(f) && !/src\/(main|preload)\//.test(f));
    const bad = all.flatMap((f) => findRawMessages(f, readFileSync(f, 'utf8')).map((x) => `${path.relative(src, f)}:${x.line}  ${x.text}  (${x.why})`));
    expect(bad).toEqual([]);
  });
});

const read = (rel: string) => readFileSync(path.join(src, rel), 'utf8');

// The places that already take part. Taking the helper out of one of them fails here, so a tidy-up cannot undo the work.
const TAKES_PART: Record<string, string[]> = {
  'ui/ToastView.tsx': ['scrubText', 'useStreamSafe'],
  'platform/AskDialog.tsx': ['scrubText', 'useStreamSafe'],
  'ui/Welcome.tsx': ['shownRecent', 'useStreamSafe'],
  'io/RecentDialog.tsx': ['shownRecent', 'useStreamSafe'],
  'io/RecentPicture.tsx': ['useStreamSafe'],
  'io/document.ts': ['displayPath'],
  'io/autosave.ts': ['subscribeStreamSafe'],
  'popout/link.ts': ['subscribeStreamSafe'],
  'beta/BetaPanel.tsx': ['displaySecret', 'useMaskedType'],
  'templates/YoursSection.tsx': ['displayName'],
  'templates/SaveTemplateDialog.tsx': ['useMaskedType'],
  'ui/TopBar.tsx': ['StreamSafeBadge'],
  'ui/prefs.ts': ['setStreamSafe'],
};

describe('the screens that already hide things keep doing it', () => {
  for (const [file, names] of Object.entries(TAKES_PART))
    it(`${file} uses ${names.join(', ')}`, () => {
      const text = read(file);
      for (const n of names) expect(text, `${file} no longer uses ${n}`).toMatch(new RegExp(`\\b${n}\\b`));
    });
});

describe('the lists of recent drawings and the title bar cannot be added around the helper', () => {
  it('anything that reads the recent list shows it through shownRecent', () => {
    const readers = walk(src)
      .filter((f) => /\.tsx?$/.test(f) && !/src\/(main|preload)\//.test(f) && !/io\/(recentShown|document|index)\.ts$/.test(f) && !f.endsWith('RecentPicture.tsx'))
      .filter((f) => /\blistRecentFiles\b|\brecent\.list\b/.test(readFileSync(f, 'utf8')))
      .filter((f) => !/\bshownRecent\b/.test(readFileSync(f, 'utf8')));
    expect(readers.map((f) => path.relative(src, f))).toEqual([]);
  });
  it('the window title is only set from the stream-safe title', () => {
    const setters = walk(src)
      .filter((f) => /\.tsx?$/.test(f) && !/src\/main\//.test(f))
      .filter((f) => /document\.title\s*=/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(src, f))
      .sort();
    // autosave.ts sets it from documentTitle(); the second window's title comes from the same name over the link.
    expect(setters).toEqual(['io/autosave.ts', 'popout/page.tsx']);
    expect(read('io/autosave.ts')).toMatch(/documentTitle\(\)/);
  });
  it('every path-looking thing the helper hides is also covered by the scanner words', () => {
    // If someone adds a new helper to the core file, the audit must know it is a safe call.
    const exported = [...read('core/streamSafe.ts').matchAll(/export (?:function|const) (display\w+|scrubText)/g)].map((m) => m[1]);
    for (const name of exported) expect(SAFE, `${name} is not in the scanner's safe list`).toContain(name);
  });
});
