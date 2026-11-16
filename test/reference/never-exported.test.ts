import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../src');
const files = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
};

describe('reference pictures are never exported', () => {
  it('only the editing canvas draws them: nothing else imports reference/paint', () => {
    const users = files(SRC)
      .filter((f) => /from '(\.\.\/)+reference\/paint'/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f).replace(/\\/g, '/'));
    expect(users.sort()).toEqual(['canvas/engine.ts', 'canvas/pipeline.ts', 'effects/stage.ts']);
  });
  it('the one renderer exports use knows nothing about them', () => {
    expect(readFileSync(join(SRC, 'core/render.ts'), 'utf8')).not.toMatch(/reference\/paint|\.picture\b|doc\.pictures/);
  });
});
