// @vitest-environment jsdom
// The "needs a newer browser" check the web build runs before the app (scripts/web/browser-check.js).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('scripts/web/browser-check.js', 'utf8');
// Loaded the way a browser would, but with no window or document so it does not run by itself.
const lib = new Function('window', 'document', `${src}; return { framelingMissing, framelingBrowserCheck, framelingTooOldText };`)(undefined, undefined) as {
  framelingMissing: (w: object) => string[];
  framelingBrowserCheck: (w: Record<string, unknown>, d: Document) => string[];
  framelingTooOldText: () => { title: string; body: string };
};

class OC {}
(OC.prototype as { convertToBlob?: () => void }).convertToBlob = () => undefined;
const ctx2d = class {};
(ctx2d.prototype as { roundRect?: () => void }).roundRect = () => undefined;
const modern = () => ({ OffscreenCanvas: OC, createImageBitmap: () => undefined, CanvasRenderingContext2D: ctx2d });

describe('the browser check', () => {
  it('lets a browser with OffscreenCanvas, createImageBitmap and roundRect through (Safari 17 and newer)', () => {
    expect(lib.framelingMissing(modern())).toEqual([]);
  });
  it('names what an old Safari (before 16.4) lacks', () => {
    expect(lib.framelingMissing({ ...modern(), OffscreenCanvas: undefined })).toEqual(['OffscreenCanvas']);
    expect(lib.framelingMissing({ ...modern(), OffscreenCanvas: class {} })).toEqual(['OffscreenCanvas']);
    expect(lib.framelingMissing({ ...modern(), CanvasRenderingContext2D: class {} })).toEqual(['roundRect']);
    expect(lib.framelingMissing({})).toEqual(['OffscreenCanvas', 'createImageBitmap', 'roundRect']);
  });
  it('shows a kind message covering the page, and says nothing when all is well', () => {
    const w: Record<string, unknown> = { ...modern() };
    expect(lib.framelingBrowserCheck(w, document)).toEqual([]);
    expect(document.querySelector('[role=alert]')).toBeNull();
    const old: Record<string, unknown> = { ...modern(), OffscreenCanvas: undefined };
    expect(lib.framelingBrowserCheck(old, document)).toEqual(['OffscreenCanvas']);
    const box = document.querySelector('[role=alert]')!;
    expect(box.textContent).toContain('Frameling needs a newer browser');
    expect(box.textContent).toContain('Safari');
    expect(old.__framelingTooOld).toEqual(['OffscreenCanvas']);
  });
  it('has no dashes in the words', () => {
    const t = lib.framelingTooOldText();
    expect(`${t.title}${t.body}`).not.toMatch(/[–—]/);
  });
});
