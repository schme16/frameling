// Every var(--x) in the app's CSS and inline styles has to be defined somewhere: a theme token, a variable declared in a
// stylesheet, or one a component sets in a style prop. An undefined one fails quietly: `var(--x, fallback)` just uses the
// fallback, which once put light text on a gold box (--peach-soft, a tint that did not exist).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_TOKENS } from '../../src/ui/themes/tokens';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../src');

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(css|ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const all = files(SRC).map((path) => ({ path, text: readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }));

/** Variables that are meant to be missing (set by a plugin or the page itself). Nothing so far; add one with a reason. */
const ALLOWED_UNDEFINED = new Set<string>([]);

const defined = new Set<string>(ALL_TOKENS);
for (const f of all) {
  // A declaration in CSS (`--x: ...`), or a name set from code (`'--x': v`, `['--x' as string]`, `style.setProperty('--x', v)`).
  for (const m of f.text.matchAll(/(?:^|[\s;{])--([a-z0-9-]+)\s*:/g)) defined.add(m[1]);
  for (const m of f.text.matchAll(/['"`]--([a-z0-9-]+)['"`]/g)) defined.add(m[1]);
}

describe('css variables', () => {
  it('every var(--x) used is defined as a theme token, in a stylesheet, or by a component', () => {
    const missing = new Map<string, string>();
    for (const f of all) for (const m of f.text.matchAll(/var\(\s*--([a-z0-9-]+)/gi)) {
      if (!defined.has(m[1]) && !ALLOWED_UNDEFINED.has(m[1]) && !missing.has(m[1])) missing.set(m[1], f.path.slice(SRC.length + 1));
    }
    const list = [...missing].map(([n, where]) => `--${n} (in ${where})`);
    expect(list, 'Add it to the theme tokens (src/ui/themes/tokens.ts and src/renderer/theme.css) or use an existing token').toEqual([]);
  });

  it('the allowlist holds no variable that is defined after all', () => {
    expect([...ALLOWED_UNDEFINED].filter((n) => defined.has(n))).toEqual([]);
  });
});
