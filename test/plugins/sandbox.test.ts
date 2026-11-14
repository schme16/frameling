// @vitest-environment jsdom
// The sandbox from the page's side: the frame's flags and the policy of the page it loads.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hostPage, makeFrame, SANDBOX_FLAGS, startFailure } from '../../src/plugins/sandbox';

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public');
const csp = (file: string) => /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(readFileSync(path.join(pub, file), 'utf8'))![1];

describe('plugin sandbox', () => {
  it('is a frame with scripts only: no same origin, no popups, no top navigation, no forms', () => {
    expect(SANDBOX_FLAGS).toBe('allow-scripts');
    const f = makeFrame(document, []);
    expect(f.getAttribute('sandbox')).toBe('allow-scripts');
    expect(f.src).toMatch(/plugin-host\.html$/);
    expect(makeFrame(document, [], 'my-plugin').src).toMatch(/plugin-host\.html\?plugin=my-plugin$/);
    expect(makeFrame(document, [], 'Bad Id/..').src).toMatch(/plugin-host\.html$/);
    expect(makeFrame(document, ['https://a.example.com']).src).toMatch(/plugin-host-net\.html$/);
    expect(hostPage([])).toBe('plugin-host.html');
  });

  it('loads a page with no network, no eval and nothing to fetch', () => {
    const p = csp('plugin-host.html');
    expect(p).toContain("default-src 'none'");
    expect(p).toContain("connect-src 'none'");
    expect(p).not.toContain('unsafe-eval');
    expect(p).not.toMatch(/script-src[^;]*(https?:|\*)/);
  });

  it('only lets an allowed plugin reach https, narrowed to its sites before it starts', () => {
    const p = csp('plugin-host-net.html');
    expect(p).toContain('connect-src https:');
    expect(p).not.toContain('unsafe-eval');
    const page = readFileSync(path.join(pub, 'plugin-host-net.html'), 'utf8');
    // The narrowing policy goes in before the worker is made.
    expect(page.indexOf("'connect-src '")).toBeLessThan(page.indexOf('new Worker'));
  });

  it('starts nothing but its own worker, and only for its parent', () => {
    for (const file of ['plugin-host.html', 'plugin-host-net.html']) {
      const page = readFileSync(path.join(pub, file), 'utf8');
      expect(page).toContain('e.source !== window.parent');
      expect(page).not.toMatch(/eval\(|new Function|innerHTML|document\.write/);
    }
  });

  it('says why a sandbox did not start, in plain words', () => {
    expect(startFailure()).toBe("The plugin's sandbox did not start.");
  });
});
