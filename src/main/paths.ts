// Path helpers for the desktop side that behave the same on Windows, macOS and Linux. Pure (no electron), so tests can
// run them with path.win32 and path.posix on any computer.
import nodePath from 'node:path';

type PathMod = Pick<typeof nodePath, 'resolve' | 'basename'>;

/** Windows and macOS disks don't care about letter case, so C:\Art\Walk.frameling and c:\art\walk.frameling are one file. */
export function caseInsensitiveFs(platform: string = process.platform): boolean {
  return platform === 'win32' || platform === 'darwin';
}

/** One spelling of a path for comparing: absolute, and lower-case where the disk ignores case. */
export function pathKey(p: string, platform: string = process.platform, path: PathMod = platform === 'win32' ? nodePath.win32 : nodePath.posix): string {
  const r = path.resolve(p);
  return caseInsensitiveFs(platform) ? r.toLowerCase() : r;
}

// Names Windows keeps for devices: a file called con.png or LPT1.txt can't be made there.
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\.|$)/i;

/** Keeps a file name safe to write inside a folder on any system: no folders, no characters or names Windows refuses. */
export function safeFileName(name: string): string {
  let base = nodePath.posix.basename(name.replace(/\\/g, '/')).replace(/[<>:"|?*\u0000-\u001f]/g, '_').trim();
  // Windows drops trailing dots and spaces, so "walk." would become "walk".
  base = base.replace(/[. ]+$/, '');
  if (RESERVED.test(base)) base = '_' + base;
  return base && base !== '.' && base !== '..' ? base : 'file';
}
