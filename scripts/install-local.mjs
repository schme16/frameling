// Builds the Linux AppImage and installs it as
// /mnt/109313D2109313D2/lutris-applications/frameling/frameling.AppImage
// (override with FRAMELING_INSTALL_DIR). If FRAMELING_INGEST_KEY is in the environment it also builds the beta copy, the
// same app with that key compiled in so it can send reports, as frameling.beta.AppImage next to it. The ordinary copy
// is always built without the key. The beta copy has its own launcher, icon and data folder, and is only installed
// once `beta-check --expect-key` says it carries the key. If a copy cannot be replaced because Frameling is running
// from that file, it closes Frameling and tries again. --no-build installs the last builds without rebuilding.
import { execFileSync, execSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { installIntegration } from './linux-integration.mjs';
import { betaEnv, betaSkipReason, installPaths, ordinaryEnv } from './install-plan.mjs';

const dir = process.env.FRAMELING_INSTALL_DIR ?? '/mnt/109313D2109313D2/lutris-applications/frameling';
const where = installPaths(dir);
const skipBuild = process.argv.includes('--no-build');

if (process.platform !== 'linux') {
  console.error('install-local builds the Linux AppImage, so it only runs on Linux.');
  process.exit(1);
}

// Newest AppImage electron-builder wrote into a folder.
const newestIn = (folder) =>
  existsSync(folder)
    ? readdirSync(folder)
        .filter((f) => f.endsWith('.AppImage'))
        .map((f) => path.join(folder, f))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
    : undefined;

// The beta build goes first and into its own folder, so release/ only ever holds the ordinary copy and the ordinary
// build is the last one to write dist/.
let betaBuilt = null;
let betaFailed = false;
const skipReason = betaSkipReason(process.env);
if (skipBuild) {
  betaBuilt = newestIn(where.beta.built) ?? null;
} else if (!skipReason) {
  try {
    execSync('npm run build', { stdio: 'inherit', env: betaEnv(process.env) });
    execSync(`npx electron-builder --linux AppImage --publish never -c.directories.output=${where.beta.built}`, { stdio: 'inherit', env: betaEnv(process.env) });
    betaBuilt = newestIn(where.beta.built) ?? null;
    if (!betaBuilt) throw new Error(`No beta AppImage found in ${where.beta.built}/.`);
  } catch (err) {
    betaFailed = true;
    console.error(`The beta build failed (${err.message}); the ordinary copy goes ahead without it.`);
  }
}

// The ordinary copy never sees the key, even when it is in the environment.
if (!skipBuild) execSync('npm run dist:linux', { stdio: 'inherit', env: ordinaryEnv(process.env) });

const built = newestIn('release');
if (!built) {
  console.error('No AppImage found in release/.');
  process.exit(1);
}

// An ordinary copy must carry no key; look inside the packed app before it goes anywhere.
const builtAsar = path.join(path.dirname(built), 'linux-unpacked/resources/app.asar');
if (existsSync(builtAsar)) {
  try {
    execFileSync(process.execPath, ['scripts/beta-check.mjs', '--expect-no-key', builtAsar], { stdio: ['ignore', 'ignore', 'inherit'] });
  } catch {
    console.error('The ordinary build carries a key, so it was not installed.');
    process.exit(1);
  }
}

mkdirSync(dir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Process ids running from an installed AppImage (the AppImage runtime has it as its command, and the app itself
// carries it in APPIMAGE).
function runningPids(target) {
  const pids = new Set();
  for (const pid of readdirSync('/proc').filter((p) => /^\d+$/.test(p))) {
    try {
      const cmd = execFileSync('cat', [`/proc/${pid}/cmdline`], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      if (cmd.split('\0').includes(target)) pids.add(Number(pid));
    } catch {}
  }
  return [...pids].filter((p) => p !== process.pid);
}

async function closeRunning(target) {
  const pids = runningPids(target);
  if (!pids.length) return false;
  console.log(`Frameling is running from ${target}; closing it (${pids.join(', ')}).`);
  for (const p of pids) try { process.kill(p, 'SIGTERM'); } catch {}
  for (let i = 0; i < 20 && runningPids(target).length; i++) await sleep(250);
  for (const p of runningPids(target)) try { process.kill(p, 'SIGKILL'); } catch {}
  await sleep(250);
  return true;
}

async function install(from, target) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      copyFileSync(from, target);
      chmodSync(target, 0o755);
      return;
    } catch (err) {
      if (!['ETXTBSY', 'EBUSY', 'EPERM', 'EACCES'].includes(err.code) || attempt === 2) throw err;
      if (!(await closeRunning(target))) await sleep(500);
    }
  }
}

// A launcher, so menus and the taskbar show Quill and group the window with it (StartupWMClass is the window's
// class). It points at the installed copy and its icon next to it.
async function installCopy({ from, target, icon, beta }) {
  await install(from, target);
  console.log(`Installed ${from} -> ${target}`);
  copyFileSync('build/icons/256x256.png', icon);
  const { launcher, wroteMime, stolen } = installIntegration({ target, icon, beta, mimeXml: 'build/linux/application-x-aseprite.xml' });
  console.log(beta ? `Launcher: ${launcher} (its own entry, "Frameling Beta"; the ordinary copy keeps the Aseprite files)` : `Launcher: ${launcher} (listed under "Open with" for Aseprite files, not made the default)`);
  if (wroteMime) console.log('Added the Aseprite file type to your own mime folder.');
  if (stolen) console.warn('Warning: Frameling is now the default for Aseprite files. Set Aseprite back in your file manager (Open With > Aseprite > Always).');
}

await installCopy({ from: built, ...where.ordinary, beta: false });

// The beta copy goes in only if the packed app itself carries the key: the check looks inside its app.asar, not at
// dist/, so what gets copied is what was checked.
let betaInstalled = false;
if (betaBuilt) {
  const asar = path.join(path.dirname(betaBuilt), 'linux-unpacked/resources/app.asar');
  try {
    if (!existsSync(asar)) throw new Error(`${asar} is missing`);
    execFileSync(process.execPath, ['scripts/beta-check.mjs', '--expect-key', asar], { stdio: ['ignore', 'inherit', 'inherit'] });
    await installCopy({ from: betaBuilt, ...where.beta, beta: true });
    betaInstalled = true;
  } catch (err) {
    betaFailed = true;
    console.error(`The beta copy was not installed: ${err.message.split('\n')[0]}`);
  }
} else if (skipBuild) {
  console.log('No beta copy installed: there is no earlier beta build in release-beta/.');
} else if (skipReason) {
  console.log(skipReason);
}

console.log('');
console.log(`frameling.AppImage       the ordinary copy; it carries no key and sends nothing`);
if (betaInstalled) console.log(`frameling.beta.AppImage  the beta copy; it carries the key and can send reports, with its own settings and recent files (${dir})`);
else console.log(`frameling.beta.AppImage  not installed this time${existsSync(where.beta.target) ? ' (the one already there is left as it was)' : ''}`);
if (betaFailed) process.exit(1);
