// The desktop side of install-local: the launcher (~/.local/share/applications/frameling.desktop) and, when nothing on
// the computer defines it yet, the Aseprite file type. Frameling is listed under "Open with" for Aseprite files but is
// never made the default, and mimeapps.list is never touched.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ASEPRITE_MIME = 'application/x-aseprite';

/** The launcher. `%U` hands over file:// links for files (the app understands those) and frameling:// links as they are. */
export function desktopEntry(target, icon) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Frameling',
    'Comment=Draw and animate 2D art',
    `Exec="${target}" %U`,
    `Icon=${icon}`,
    'Terminal=false',
    'Categories=Graphics;',
    `MimeType=${ASEPRITE_MIME};`,
    'StartupWMClass=frameling',
    '',
  ].join('\n');
}

/** Folders the desktop reads shared-mime-info data from, the person's own first. */
export function mimeDataDirs(env = process.env, home = os.homedir()) {
  const dataHome = env.XDG_DATA_HOME || path.join(home, '.local/share');
  const system = (env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(Boolean);
  return [dataHome, ...system];
}

/** True when some installed data folder already defines the type (its `mime/types` list, or a package file). */
export function mimeDefined(type, dirs, read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')) {
  return dirs.some((d) => {
    if (read(path.join(d, 'mime/types')).split('\n').includes(type)) return true;
    return read(path.join(d, 'mime/packages', `${type.replace('/', '-')}.xml`)).includes(`type="${type}"`);
  });
}

const quiet = (cmd, args, env) => {
  try {
    execFileSync(cmd, args, { stdio: 'ignore', env });
    return true;
  } catch {
    return false;
  }
};

/**
 * Writes the launcher and, if needed, the Aseprite type; refreshes the desktop's caches. `env` decides where
 * (XDG_DATA_HOME), so tests can use a throwaway folder. Returns what it did (`stolen`: Frameling came out as the default for Aseprite files, which should not happen).
 */
export function installIntegration({ target, icon, mimeXml, env = process.env, home = os.homedir() }) {
  const dirs = mimeDataDirs(env, home);
  const apps = path.join(dirs[0], 'applications');
  mkdirSync(apps, { recursive: true });
  const launcher = path.join(apps, 'frameling.desktop');
  writeFileSync(launcher, desktopEntry(target, icon));
  let wroteMime = false;
  const own = path.join(dirs[0], 'mime/packages', 'application-x-aseprite.xml');
  // Defined by us already (an earlier install) counts as ours to refresh; defined by anyone else is left alone.
  if (existsSync(own) || !mimeDefined(ASEPRITE_MIME, dirs)) {
    mkdirSync(path.dirname(own), { recursive: true });
    copyFileSync(mimeXml, own);
    wroteMime = true;
    quiet('update-mime-database', [path.join(dirs[0], 'mime')], env);
  }
  quiet('update-desktop-database', [apps], env);
  // With no default chosen, the desktop uses the first program that lists the type. Say so if that came out as us.
  let stolen = false;
  try {
    stolen = execFileSync('xdg-mime', ['query', 'default', ASEPRITE_MIME], { env }).toString().trim() === 'frameling.desktop';
  } catch {}
  return { launcher, wroteMime, stolen };
}
