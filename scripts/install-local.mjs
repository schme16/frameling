// Builds the Linux AppImage and installs it as
// /mnt/109313D2109313D2/lutris-applications/frameling/frameling.AppImage
// (override with FRAMELING_INSTALL_DIR). If the copy fails because Frameling is running from that file, it closes
// Frameling and tries again.
import { execFileSync, execSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { installIntegration } from './linux-integration.mjs';

const dir = process.env.FRAMELING_INSTALL_DIR ?? '/mnt/109313D2109313D2/lutris-applications/frameling';
const target = path.join(dir, 'frameling.AppImage');
const skipBuild = process.argv.includes('--no-build');

if (process.platform !== 'linux') {
  console.error('install-local builds the Linux AppImage, so it only runs on Linux.');
  process.exit(1);
}

if (!skipBuild) execSync('npm run dist:linux', { stdio: 'inherit' });

// Newest AppImage electron-builder wrote.
const built = readdirSync('release')
  .filter((f) => f.endsWith('.AppImage'))
  .map((f) => path.join('release', f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
if (!built) {
  console.error('No AppImage found in release/.');
  process.exit(1);
}

mkdirSync(dir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Process ids running from the installed AppImage (the AppImage runtime has it as its command, and the app itself
// carries it in APPIMAGE).
function runningPids() {
  const pids = new Set();
  for (const pid of readdirSync('/proc').filter((p) => /^\d+$/.test(p))) {
    try {
      const cmd = execFileSync('cat', [`/proc/${pid}/cmdline`], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      if (cmd.split('\0').includes(target)) pids.add(Number(pid));
    } catch {}
  }
  return [...pids].filter((p) => p !== process.pid);
}

async function closeRunning() {
  const pids = runningPids();
  if (!pids.length) return false;
  console.log(`Frameling is running from ${target}; closing it (${pids.join(', ')}).`);
  for (const p of pids) try { process.kill(p, 'SIGTERM'); } catch {}
  for (let i = 0; i < 20 && runningPids().length; i++) await sleep(250);
  for (const p of runningPids()) try { process.kill(p, 'SIGKILL'); } catch {}
  await sleep(250);
  return true;
}

async function install() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      copyFileSync(built, target);
      chmodSync(target, 0o755);
      return;
    } catch (err) {
      if (!['ETXTBSY', 'EBUSY', 'EPERM', 'EACCES'].includes(err.code) || attempt === 2) throw err;
      if (!(await closeRunning())) await sleep(500);
    }
  }
}

await install();
console.log(`Installed ${built} -> ${target}`);

// A launcher, so menus and the taskbar show Quill and group the window with it (StartupWMClass is the window's
// class). It points at the installed copy and its icon next to it.
const icon = path.join(dir, 'frameling.png');
copyFileSync('build/icons/256x256.png', icon);
const { launcher, wroteMime, stolen } = installIntegration({ target, icon, mimeXml: 'build/linux/application-x-aseprite.xml' });
console.log(`Launcher: ${launcher} (listed under "Open with" for Aseprite files, not made the default)`);
if (wroteMime) console.log('Added the Aseprite file type to your own mime folder.');
if (stolen) console.warn('Warning: Frameling is now the default for Aseprite files. Set Aseprite back in your file manager (Open With > Aseprite > Always).');
