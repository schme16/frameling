// The fault behind the Streaming buttons that overlapped: a row class with a rule only on one page. Every ui-pref-* class the
// app uses has a base rule in ui.css, and the control rule is not copied again on a page.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('the Preferences row classes have base rules', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
  const files = walk('src');
  const base = readFileSync('src/ui/ui.css', 'utf8');

  it('the row, its words and its controls are styled in ui.css, not only on one page', () => {
    for (const c of ['ui-pref-row', 'ui-pref-text', 'ui-pref-control', 'ui-pref-intro', 'ui-pref-value']) {
      expect(base, c).toMatch(new RegExp(`(^|[,}]\\s*)\\.${c}\\b`, 'm'));
    }
  });

  it('every ui-pref-* class a page uses is one of those, or is styled somewhere that is not scoped to a page', () => {
    const used = new Set<string>();
    for (const f of files.filter((x) => /\.tsx$/.test(x))) for (const m of readFileSync(f, 'utf8').matchAll(/\bui-pref-[a-z-]+/g)) used.add(m[0]);
    const css = files.filter((x) => /\.css$/.test(x)).map((f) => readFileSync(f, 'utf8')).join('\n');
    const bare = [...used].filter((c) => !new RegExp(`(^|[,}]\\s*|\\.ui-pref-[a-z-]+[ .>]+)\\.${c}\\b`, 'm').test(css));
    expect(bare).toEqual([]);
  });

  it('no page-scoped copy of the control rule is left to half agree with the base one', () => {
    for (const f of files.filter((x) => /\.css$/.test(x) && !x.endsWith('ui/ui.css'))) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/[\w-]\s+\.ui-pref-control\s*\{/);
    }
  });
});
