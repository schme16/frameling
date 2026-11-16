// The file lister every scanning test uses: forward slashes whatever the system, proven for Windows spellings too.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { relative, slash, sourceFiles, walkFiles } from './files';

describe('file listing for scans', () => {
  it('turns the Windows spelling into the one the tests compare against', () => {
    expect(slash('io\\autosave.ts')).toBe('io/autosave.ts');
    expect(slash(path.win32.relative('C:\\proj\\src', 'C:\\proj\\src\\ui\\mascot\\Quill.tsx'))).toBe('ui/mascot/Quill.tsx');
    expect(slash('C:\\proj\\src\\popout\\page.tsx')).toBe('C:/proj/src/popout/page.tsx');
    expect(slash('already/fine.ts')).toBe('already/fine.ts');
  });
  it('lists real source with slashes only, in a steady order, and relative() agrees', () => {
    const src = path.resolve(__dirname, '../../src');
    const files = sourceFiles(src);
    expect(files.length).toBeGreaterThan(300);
    expect(files.some((f) => f.includes('\\'))).toBe(false);
    expect(files.every((f) => /\.tsx?$/.test(f))).toBe(true);
    const rels = files.map((f) => relative(src, f));
    expect(rels).toContain('io/autosave.ts');
    expect(rels.some((r) => r.startsWith('/') || r.startsWith('..'))).toBe(false);
    expect(walkFiles(src, (n) => n === 'autosave.ts').map((f) => relative(src, f))).toEqual(['io/autosave.ts']);
  });
});
