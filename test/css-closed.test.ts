// A CSS rule left open swallows every rule after it, so the whole rest of the file stops applying and the build dies
// on whatever it meets next. It happened twice at once (.rv-linkcode code and .qp-blank), and the error pointed at an
// @keyframes hundreds of lines further on, which is nowhere near the real place.
//
// The test suite never builds, so nothing caught it. This does, in milliseconds, and it names the rule rather than
// the symptom.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
    if (n.name === 'node_modules' || n.name.startsWith('.')) continue;
    const f = path.join(dir, n.name);
    if (n.isDirectory()) walk(f, out);
    else if (n.name.endsWith('.css')) out.push(f);
  }
  return out;
}

/** Comments and quoted text blanked out, so a brace inside either doesn't count. Kept the same length, so line numbers still line up. */
function bare(css: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return css
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/"[^"\n]*"/g, blank)
    .replace(/'[^'\n]*'/g, blank);
}

/** Every rule that was opened and never closed, as "line: selector". */
function unclosed(css: string): string[] {
  const t = bare(css);
  const open: number[] = [];
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '{') {
      depth++;
      if (depth === 1) open.push(i);
    } else if (t[i] === '}') {
      if (depth === 1) open.pop();
      depth = Math.max(0, depth - 1);
    }
  }
  return open.map((i) => {
    const line = css.slice(0, i).split('\n').length;
    const selector = (css.slice(Math.max(0, i - 200), i).trim().split('\n').pop() ?? '').trim();
    return `line ${line}: ${selector}`;
  });
}

it('every CSS rule is closed', () => {
  const bad: string[] = [];
  for (const f of walk(path.join(root, 'src'))) {
    for (const r of unclosed(fs.readFileSync(f, 'utf8'))) bad.push(`${path.relative(root, f).replace(/\\/g, '/')} ${r}`);
  }
  expect(bad).toEqual([]);
});

it('spots an unclosed rule and names it', () => {
  expect(unclosed('.a {\n  color: red;\n}\n')).toEqual([]);
  expect(unclosed('.a {\n  color: red;\n.b {\n  color: blue;\n}\n')).toEqual(['line 1: .a']);
  // A brace inside a comment or a quoted value is not a rule.
  expect(unclosed('/* { */\n.a {\n  content: "{";\n}\n')).toEqual([]);
  // Nested at-rules still balance.
  expect(unclosed('@media (min-width: 10px) {\n  .a {\n    color: red;\n  }\n}\n')).toEqual([]);
});
