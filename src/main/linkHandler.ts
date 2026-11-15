// Making the system send frameling:// links to this copy of Frameling, every start.
//
// Windows and macOS: Electron's own call does it (a registry entry for the current user on Windows, written at every start and
// pointing at the .exe that is running; the macOS app lists the scheme in its Info.plist, built from electron-builder.cjs).
// The installer's registry step (build/installer.nsh) stays as the second way in.
// Linux: the call only works when a launcher file for the app is already in place, which an AppImage run from a folder has
// not got. So this writes the launcher (and says "I open frameling:// links") when it is missing or out of date, and sets
// Frameling as the opener only when nobody else is. Nothing is touched when everything is already right.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const SCHEME_MIME = 'x-scheme-handler/frameling';
export const LAUNCHER = 'frameling.desktop';

/** The launcher for an AppImage that has none. `%U` hands over links and files. */
export function launcherText(appImage: string, icon: string): string {
  return ['[Desktop Entry]', 'Type=Application', 'Name=Frameling', 'Comment=Draw and animate 2D art', `Exec="${appImage}" %U`, `Icon=${icon}`, 'Terminal=false', 'Categories=Graphics;', `MimeType=${SCHEME_MIME};`, 'StartupWMClass=frameling', ''].join('\n');
}

/** The program a launcher's Exec line runs (the first word, with its quotes taken off), or null. */
export function execTarget(text: string): string | null {
  const m = /^Exec=(.*)$/m.exec(text);
  if (!m) return null;
  const line = m[1].trim();
  const q = /^"((?:[^"\\]|\\.)*)"/.exec(line);
  return q ? q[1].replace(/\\(.)/g, '$1') : (line.split(/\s+/)[0] ?? null);
}

/** Adds the scheme to a launcher's MimeType line (or the line itself), leaving everything else as it was. */
export function withScheme(text: string): string {
  if (text.includes(SCHEME_MIME)) return text;
  if (/^MimeType=/m.test(text)) return text.replace(/^MimeType=(.*?);?$/m, (_m, list: string) => `MimeType=${list ? `${list};` : ''}${SCHEME_MIME};`);
  return text.replace(/\n?$/, `\nMimeType=${SCHEME_MIME};\n`);
}

/** Points a launcher at the AppImage that is running (its old place has gone). */
export function withExec(text: string, appImage: string): string {
  return text.replace(/^Exec=.*$/m, `Exec="${appImage}" %U`);
}

export type LauncherPlan = { do: 'none' } | { do: 'write'; text: string } | { do: 'leave'; why: string };

/**
 * What to do about the launcher file. `existing` is its text or null; `targetExists` says whether the program it runs is
 * still on disk. Our own launcher, or one whose program has gone, is brought up to date. One that runs another copy of
 * Frameling that is still there is left alone: that copy is the one the person installed.
 */
export function planLauncher(o: { appImage: string; iconName: string; existing: string | null; targetExists: (p: string) => boolean }): LauncherPlan {
  if (o.existing === null) return { do: 'write', text: launcherText(o.appImage, o.iconName) };
  const target = execTarget(o.existing);
  if (target === o.appImage) {
    const next = withScheme(o.existing);
    return next === o.existing ? { do: 'none' } : { do: 'write', text: next };
  }
  if (target && o.targetExists(target)) return { do: 'leave', why: 'another copy is installed' };
  return { do: 'write', text: withScheme(withExec(o.existing, o.appImage)) };
}

/** Whether to make Frameling the opener: nobody is, or whoever is has gone from the computer. */
export const shouldClaim = (current: string, currentExists: boolean): boolean => current === '' || (current !== LAUNCHER && !currentExists);

export interface LinuxIO {
  env: NodeJS.ProcessEnv;
  home: string;
  icon: string;
  read(file: string): string | null;
  write(file: string, text: string): void;
  copy(from: string, to: string): void;
  exists(file: string): boolean;
  /** Runs a command; resolves with what it printed, or null when it could not run. */
  exec(cmd: string, args: string[]): Promise<string | null>;
}

const realIO = (home: string): LinuxIO => ({
  env: process.env,
  home,
  icon: path.join(__dirname, 'icon.png'),
  read: (f) => {
    try {
      return fs.readFileSync(f, 'utf8');
    } catch {
      return null;
    }
  },
  write: (f, t) => {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, t);
  },
  copy: (a, b) => {
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.copyFileSync(a, b);
  },
  exists: (f) => fs.existsSync(f),
  exec: async (cmd, args) => {
    try {
      return (await run(cmd, args, { timeout: 8000 })).stdout.toString().trim();
    } catch {
      return null;
    }
  },
});

/** Where launchers live: the person's own folder first, then the system's. */
export function applicationDirs(env: NodeJS.ProcessEnv, home: string): string[] {
  const dataHome = env.XDG_DATA_HOME || path.join(home, '.local/share');
  return [dataHome, ...(env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(Boolean)].map((d) => path.join(d, 'applications'));
}

/**
 * Linux, run from an AppImage: makes sure a launcher says Frameling opens frameling:// links, and that the desktop agrees.
 * Returns what it did, in words (for the log and the tests). Never throws.
 */
export async function ensureLinuxHandler(io: LinuxIO): Promise<string[]> {
  const did: string[] = [];
  const appImage = io.env.APPIMAGE;
  if (!appImage || !path.isAbsolute(appImage)) return ['not an AppImage'];
  try {
    const dirs = applicationDirs(io.env, io.home);
    const file = path.join(dirs[0], LAUNCHER);
    const iconFile = path.join(path.dirname(dirs[0]), 'icons/hicolor/512x512/apps/frameling.png');
    const existing = io.read(file);
    const plan = planLauncher({ appImage, iconName: 'frameling', existing, targetExists: io.exists });
    if (plan.do === 'leave') return [`left the launcher: ${plan.why}`];
    if (plan.do === 'write') {
      // A launcher we make ourselves needs its picture too (the name stands in for a path, so the desktop finds it).
      if (existing === null && io.exists(io.icon)) io.copy(io.icon, iconFile);
      io.write(file, plan.text);
      did.push('wrote the launcher');
      await io.exec('update-desktop-database', [dirs[0]]);
    }
    const current = (await io.exec('xdg-mime', ['query', 'default', SCHEME_MIME])) ?? '';
    const currentExists = current === '' || dirs.some((d) => io.exists(path.join(d, current)));
    if (current !== LAUNCHER && shouldClaim(current, currentExists)) {
      await io.exec('xdg-mime', ['default', LAUNCHER, SCHEME_MIME]);
      did.push('made Frameling the opener for links');
    }
  } catch {
    did.push('could not finish');
  }
  return did;
}

/** The structure Electron's app object gives us that this needs. */
interface AppLike {
  setAsDefaultProtocolClient(scheme: string, path?: string, args?: string[]): boolean;
}

/** Called once at start by the installed app (never a dev run, never the beta copy). */
export function registerLinkHandler(app: AppLike, scheme: string): void {
  if (process.platform === 'win32') {
    // The portable build runs from a temporary copy of itself, so it registers the .exe the person actually has.
    const portable = process.env.PORTABLE_EXECUTABLE_FILE;
    if (portable) app.setAsDefaultProtocolClient(scheme, portable, []);
    else app.setAsDefaultProtocolClient(scheme);
    return;
  }
  if (process.platform === 'linux' && process.env.APPIMAGE) {
    // Off the start-up path: it runs a few small programs, and the app does not wait for them.
    setTimeout(() => void ensureLinuxHandler(realIO(os.homedir())), 3000).unref();
    return;
  }
  app.setAsDefaultProtocolClient(scheme);
}
