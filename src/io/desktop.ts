import type { FramelingApi } from '../preload/api';

/** The desktop side of the app, or null when the page is running somewhere without it (a plain browser tab). */
export function desktop(): FramelingApi | null {
  const w = typeof window !== 'undefined' ? (window as { frameling?: FramelingApi }) : undefined;
  return w?.frameling?.files ? w.frameling : null;
}

/** "This browser" on the web build, "This computer" in the desktop app: for plain-words messages about what the machine can do. */
export function where(): string {
  return typeof window !== 'undefined' && (window as { frameling?: { kind?: string } }).frameling?.kind === 'web' ? 'This browser' : 'This computer';
}

/** The last part of a path, whatever separator it uses. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function stripExt(name: string): string {
  return name.replace(/\.[^./\\]+$/, '');
}

/** The folder part of a path. */
export function dirName(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  // A file at the top of a Windows drive lives in "C:\", not "C:".
  if (i === 2 && /^[A-Za-z]:/.test(path)) return path.slice(0, 3);
  return i > 0 ? path.slice(0, i) : '';
}
