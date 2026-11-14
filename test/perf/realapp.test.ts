// The perf harnesses that drive one window (run, brushsize, palettepic) run the app's own main process, so the page's
// start-up requests are answered by the real handlers. These checks keep it that way and keep the loud failure working.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const root = path.join(__dirname, '../..');
const { watchIpc } = createRequire(import.meta.url)(path.join(root, 'scripts/perf/realapp.cjs')) as {
  watchIpc: (onProblem: (text: string) => void) => void;
};

describe('the harness reports a request main did not answer', () => {
  const orig = console.error;
  afterEach(() => {
    console.error = orig;
  });

  it('sees the engine\'s "no handler" line and a handler that throws', () => {
    const quiet = vi.fn();
    console.error = quiet; // what watchIpc passes the line on to
    const seen: string[] = [];
    watchIpc((t) => seen.push(t));
    console.error("Error occurred in handler for 'app:restore':", new Error("No handler registered for 'app:restore'"));
    console.error("Error occurred in handler for 'x:y':", new Error('Not allowed'));
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain("No handler registered for 'app:restore'");
    expect(quiet).toHaveBeenCalledTimes(2);
  });

  it('leaves ordinary errors alone', () => {
    console.error = vi.fn();
    const seen: string[] = [];
    watchIpc((t) => seen.push(t));
    console.error('something else went wrong', new Error('boom'));
    expect(seen).toEqual([]);
  });
});

describe('the window harnesses use the real main process', () => {
  for (const name of ['run', 'brushsize', 'palettepic']) {
    it(`${name}.cjs makes no window and no handlers of its own`, () => {
      const src = fs.readFileSync(path.join(root, `scripts/perf/${name}.cjs`), 'utf8');
      expect(src).toContain("require('./realapp.cjs')");
      expect(src).not.toMatch(/new BrowserWindow\(/);
      expect(src).not.toMatch(/ipcMain\.handle\(/);
    });
  }
});
