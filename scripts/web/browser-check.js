// Runs first in the web build (a plain old-style script, so even a very old browser can read it). If the browser lacks
// what Frameling draws with, it says so kindly instead of showing an empty page. vite.web.config.ts copies this file
// next to index.html; test/platform/browser-check.test.ts checks it.
function framelingMissing(w) {
  var missing = [];
  var oc = w.OffscreenCanvas;
  if (typeof oc === 'undefined' || !oc.prototype || typeof oc.prototype.convertToBlob !== 'function') missing.push('OffscreenCanvas');
  if (typeof w.createImageBitmap !== 'function') missing.push('createImageBitmap');
  var ctx = w.CanvasRenderingContext2D;
  if (!ctx || typeof ctx.prototype.roundRect !== 'function') missing.push('roundRect');
  return missing;
}

function framelingTooOldText() {
  return {
    title: 'Frameling needs a newer browser',
    body: 'This browser is a little too old to draw with Frameling. Please update it, or open Frameling in a recent Safari (version 17 or newer), Chrome, Edge or Firefox.',
  };
}

function framelingBrowserCheck(w, d) {
  var missing = framelingMissing(w);
  if (!missing.length) return missing;
  w.__framelingTooOld = missing;
  var show = function () {
    var t = framelingTooOldText();
    var box = d.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;background:#17151f;color:#f3f0ff;font:16px/1.5 system-ui,sans-serif';
    var h = d.createElement('h1');
    h.textContent = t.title;
    h.style.cssText = 'margin:0;font-size:24px';
    var p = d.createElement('p');
    p.textContent = t.body;
    p.style.cssText = 'margin:0;max-width:34em';
    box.appendChild(h);
    box.appendChild(p);
    d.body.appendChild(box);
  };
  if (d.body) show();
  else d.addEventListener('DOMContentLoaded', show);
  return missing;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') framelingBrowserCheck(window, document);
