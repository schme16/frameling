// Says whether a build can send beta reports, so a tester is never handed a copy that cannot. Looks inside the built
// page and the built desktop side; never prints the key itself. Works on dist/ (after `npm run build`) or on an
// unpacked app.asar:
//
//   node scripts/beta-check.mjs                    look at dist/ and say what it has
//   node scripts/beta-check.mjs --expect-key       the same, and exit 1 when it has no key (use before handing a build out)
//   node scripts/beta-check.mjs path/to/app.asar   look inside a packed app (--expect-key works here too)
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const expect = args.includes('--expect-key');
const given = args.find((a) => !a.startsWith('--'));

let root = given ?? 'dist';
let cleanup = null;
if (given && given.endsWith('.asar')) {
  const asar = await import('@electron/asar');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'beta-check-'));
  asar.default.extractAll(given, dir);
  root = dir;
  cleanup = () => rmSync(dir, { recursive: true, force: true });
}
const base = existsSync(path.join(root, 'dist/renderer')) ? path.join(root, 'dist') : root;

const jsIn = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.js') || String(f).endsWith('.cjs')).map((f) => path.join(dir, String(f))) : []);
const pageFiles = jsIn(path.join(base, 'renderer/assets'));
if (!pageFiles.length) {
  console.error(`No built page under ${base}. Run npm run build first.`);
  process.exit(2);
}
// The key travels as `{url:"https://...",key:"pbk_..."}` once built. Only the host is ever printed.
const carries = /url\s*:\s*["'`](https?:\/\/[^"'`]+)["'`]\s*,\s*key\s*:\s*["'`]pbk_[A-Za-z0-9_-]{8,}["'`]/;
let board = null;
for (const f of pageFiles) {
  const m = readFileSync(f, 'utf8').match(carries);
  if (m) {
    board = m[1];
    break;
  }
}
const html = readFileSync(path.join(base, 'renderer/index.html'), 'utf8');
const csp = /connect-src[^;"]*/.exec(html)?.[0] ?? null;
const mainFile = path.join(base, 'main/main.cjs');
const mainText = existsSync(mainFile) ? readFileSync(mainFile, 'utf8') : '';
const mainHasBoard = !!board && mainText.includes(new URL(board).origin);

console.log(board ? `This build carries an ingest key for ${new URL(board).origin}.` : 'This build carries NO ingest key: it cannot send reports, and its Send button stays off.');
console.log(csp ? `The page may talk to: ${csp.replace('connect-src', '').trim()}` : 'The page has no connect-src, so its own fetch is limited to itself.');
if (existsSync(mainFile)) console.log(mainHasBoard ? 'The desktop side knows the board, so reports go through it with real error reasons.' : mainText.includes('beta:request') ? 'The desktop side has no board baked in.' : 'The desktop side is the older kind (no report sending of its own).');
cleanup?.();
if (expect && !board) {
  console.error('\nNo key in this build. Build it again with FRAMELING_INGEST_KEY set, for example:\n  FRAMELING_INGEST_KEY=pbk_... npm run install-local');
  process.exit(1);
}
