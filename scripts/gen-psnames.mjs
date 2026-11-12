// Reads the PostScript names of the fonts Frameling ships (the variable fonts in node_modules/@fontsource-variable) and writes
// src/fonts/psnames-shipped.ts, so Illustrator text can name them without guessing. Runs as part of `npm run build`; the
// output is checked in, so a build without the fonts changes nothing. Pass --check to only compare (the tests do).
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import { build } from 'esbuild';

const FONTS = [
  { family: 'Nunito', dir: 'nunito', file: 'nunito' },
  { family: 'Inter', dir: 'inter', file: 'inter' },
];

const tmp = mkdtempSync(join(tmpdir(), 'frameling-psnames-'));
const outfile = join(tmp, 'fontnames.mjs');
await build({ entryPoints: ['src/fonts/fontnames.ts'], bundle: true, format: 'esm', outfile, logLevel: 'silent' });
const { readFontFaces } = await import(pathToFileURL(outfile).href);
rmSync(tmp, { recursive: true, force: true });

const rows = [];
let missing = false;
for (const f of FONTS) {
  for (const slant of ['normal', 'italic']) {
    const path = `node_modules/@fontsource-variable/${f.dir}/files/${f.file}-latin-wght-${slant}.woff2`;
    if (!existsSync(path)) {
      missing = true;
      continue;
    }
    const faces = readFontFaces(new Uint8Array(readFileSync(path)), (d) => new Uint8Array(brotliDecompressSync(d)));
    for (const face of faces) rows.push(`  { family: '${f.family}', style: '${face.style}', ps: '${face.ps}', weight: ${face.weight}, italic: ${face.italic} },`);
  }
}
const out = `// The PostScript names of the fonts Frameling ships, read from their files by scripts/gen-psnames.mjs (run by the build). Do not edit.
import type { FontFace } from './fontnames';

export const SHIPPED_FACES: FontFace[] = [
${rows.join('\n')}
];
`;
if (missing) console.log('psnames: the shipped font files are not here, keeping the table as it is');
else if (process.argv.includes('--check')) process.exit(readFileSync('src/fonts/psnames-shipped.ts', 'utf8') === out ? 0 : 1);
else {
  writeFileSync('src/fonts/psnames-shipped.ts', out);
  console.log(`psnames: ${rows.length} shipped faces`);
}
