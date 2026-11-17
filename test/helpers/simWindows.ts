// Makes a Linux machine behave like Windows for the one thing that broke CI: the path functions hand back backslashes.
// Switched on by FRAMELING_SIM_WIN=1 (see vitest.config.ts), never in a normal run. It is how the file-listing tests were
// proven for Windows without a Windows machine: any test that compares a built path to a forward-slash string, or matches
// one with a / regex, fails here the way it failed there.
//
// What it does: path.join/resolve/relative/normalize/dirname return backslashes (path.posix stays the real posix one, as
// on Windows), and fs accepts the backslash spelling by turning it back into slashes on the way in.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';

const real = { ...path } as { -readonly [K in keyof typeof path]: (typeof path)[K] };
real.posix = real as typeof path;
const back = (s: string) => s.replace(/\//g, '\\');
const fwd = (s: unknown) => (typeof s === 'string' && s.includes('\\') ? s.replace(/\\/g, '/') : s);

// Only Frameling's own code (test/ and src/) sees backslashes: node's own internals and vite use the same path object and
// would break on them, so the caller is checked from the stack.
const ours = (depth = 3): boolean => {
  const frames = (new Error().stack ?? '').split('\n').slice(depth, depth + 1).join('');
  return /\/(test|src)\//.test(frames) && !/node_modules/.test(frames);
};
for (const k of ['join', 'resolve', 'relative', 'normalize', 'dirname'] as const) {
  (path as unknown as Record<string, unknown>)[k] = (...a: string[]) => {
    const out = (real[k] as (...x: string[]) => string)(...(a.map(fwd) as string[]));
    return ours() ? back(out) : out;
  };
}
(path as unknown as { posix: typeof path }).posix = real;
Object.defineProperty(path, 'sep', { get: () => (ours(3) ? '\\' : '/'), configurable: true });

// Functions whose first argument (and, for the two-path ones, the second) is a path.
const two = new Set(['symlinkSync', 'symlink', 'renameSync', 'copyFileSync', 'linkSync', 'rename', 'copyFile', 'cp', 'cpSync']);
function wrap(target: Record<string, unknown>) {
  for (const k of Object.keys(target)) {
    const f = target[k];
    if (typeof f !== 'function' || /^[A-Z]/.test(k) || k === 'constants') continue;
    try {
      const w = function (this: unknown, ...a: unknown[]) {
        if (a.length) a[0] = fwd(a[0]);
        if (two.has(k) && a.length > 1) a[1] = fwd(a[1]);
        return (f as (...x: unknown[]) => unknown).apply(this, a);
      };
      Object.assign(w, f); // keeps things like realpathSync.native
      target[k] = w;
    } catch {
      // read-only export, leave it
    }
  }
}
wrap(fs as unknown as Record<string, unknown>);
wrap(fsp as unknown as Record<string, unknown>);
syncBuiltinESMExports();
