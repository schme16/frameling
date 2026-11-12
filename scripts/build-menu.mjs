// One-step build for people building Frameling themselves. build.sh and build.cmd run this.
// With no argument it shows a menu; or name what to build: this, all, windows, mac, linux, web.
// Add --test to run the tests first.
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const host = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
const NAMES = { windows: 'Windows', mac: 'macOS', linux: 'Linux', web: 'Web (runs in a browser)' };
const ARGS = {
  windows: '--win nsis portable',
  mac: '--mac dmg --arm64 --x64',
  linux: '--linux AppImage',
};

const has = (cmd) => spawnSync(host === 'windows' ? 'where' : 'which', [cmd], { stdio: 'ignore', shell: host === 'windows' }).status === 0;

// Why this computer can't build a target, or null when it can.
function cannot(target) {
  if (target === 'web' || target === host) return null;
  if (target === 'mac') return 'macOS apps can only be built on a Mac.';
  if (target === 'linux' && host === 'windows') return 'the Linux app can\'t be built on Windows. Use WSL or a Linux computer.';
  if (target === 'windows' && !has('wine')) return 'building the Windows app here needs Wine installed (https://www.winehq.org).';
  return null;
}

function run(cmd, env = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });
}

async function choose() {
  const items = [
    ['this', `This computer (${NAMES[host]})`],
    ['all', 'Everything this computer can build'],
    ['windows', NAMES.windows],
    ['mac', NAMES.mac],
    ['linux', NAMES.linux],
    ['web', NAMES.web],
  ];
  console.log('\nBuild Frameling\n');
  items.forEach(([key, label], i) => {
    const why = ['windows', 'mac', 'linux'].includes(key) ? cannot(key) : null;
    console.log(`  ${i + 1}. ${label}${why ? '  (not on this computer)' : ''}`);
  });
  console.log('  q. Quit\n');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('Pick a number: ')).trim().toLowerCase();
  rl.close();
  if (answer === 'q' || answer === '') process.exit(0);
  const item = items[Number(answer) - 1] ?? items.find(([key]) => key === answer);
  if (!item) {
    console.error(`"${answer}" isn't on the list.`);
    process.exit(1);
  }
  return item[0];
}

const ALIASES = { win: 'windows', windows: 'windows', mac: 'mac', macos: 'mac', osx: 'mac', linux: 'linux', web: 'web', this: 'this', all: 'all' };
const argv = process.argv.slice(2);
const withTests = argv.includes('--test');
const named = argv.find((a) => !a.startsWith('--'));
let pick = named ? ALIASES[named.toLowerCase()] : await choose();
if (!pick) {
  console.error(`Unknown target "${named}". Use one of: this, all, windows, mac, linux, web.`);
  process.exit(1);
}

const targets = pick === 'this' ? [host] : pick === 'all' ? ['windows', 'mac', 'linux', 'web'] : [pick];
const skipped = [];
const todo = targets.filter((t) => {
  const why = cannot(t);
  if (why) skipped.push(`${NAMES[t]}: ${why}`);
  return !why;
});
if (!todo.length) {
  console.error(`\nCan't build that here: ${skipped.join(' ')}`);
  console.error('Every pull request into main builds all of them on GitHub (see README, "Get it").');
  process.exit(1);
}

const started = Date.now();
if (!existsSync('node_modules')) run('npm ci');
if (withTests) run('npm test');

const desktop = todo.filter((t) => t !== 'web');
if (desktop.length) {
  run('npm run build');
  for (const t of desktop) {
    console.log(`\nPackaging ${NAMES[t]}...`);
    // No certificate lookups: macOS gets ad-hoc signed by build/adhoc-sign.cjs; Windows is signed only when
    // WIN_CSC_LINK is set.
    run(`npx electron-builder ${ARGS[t]} --publish never`, { CSC_IDENTITY_AUTO_DISCOVERY: 'false' });
  }
}
if (todo.includes('web')) run('npm run build:web');

// What came out.
const fresh = (dir, test) =>
  existsSync(dir) ? readdirSync(dir).filter(test).map((f) => path.join(dir, f)).filter((f) => statSync(f).mtimeMs >= started) : [];
const out = fresh('release', (f) => /\.(AppImage|exe|dmg)$/.test(f));
console.log('\nDone.');
for (const f of out) console.log(`  ${f}  (${(statSync(f).size / 1048576).toFixed(0)} MB)`);
if (todo.includes('web')) console.log(`  ${path.join('dist', 'web')}${path.sep}  (put these files on any web server)`);
if (skipped.length) {
  console.log('\nSkipped:');
  for (const s of skipped) console.log(`  ${s}`);
  console.log('  Every pull request into main builds all of them on GitHub (see README, "Get it").');
}
