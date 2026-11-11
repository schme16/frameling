// Where a plugin runs: a Web Worker started inside a hidden iframe with sandbox="allow-scripts" (no allow-same-origin),
// so it has no origin of its own, no DOM of the app, no Node, no storage, and by the frame's Content Security Policy
// no network unless allowed. Its only way out is the MessagePort handed to it. See docs/plugins.md.
import { PRELUDE } from './prelude';
import type { Transport } from './runtime';

export const SANDBOX_FLAGS = 'allow-scripts';
const READY_MS = 10_000;

/** The page the frame loads: the plain one, or the one that lets a plugin reach the sites it listed. */
export function hostPage(network: string[]): string {
  return network.length ? 'plugin-host-net.html' : 'plugin-host.html';
}

export interface SandboxStart {
  code: string;
  plugin: { id: string; name: string; version: string };
  /** https origins it may talk to. Empty means none. */
  network: string[];
}

/** Makes the hidden frame (not yet in the page). */
export function makeFrame(doc: Document, network: string[]): HTMLIFrameElement {
  const f = doc.createElement('iframe');
  f.setAttribute('sandbox', SANDBOX_FLAGS);
  f.setAttribute('aria-hidden', 'true');
  f.setAttribute('tabindex', '-1');
  f.setAttribute('referrerpolicy', 'no-referrer');
  f.title = 'Plugin';
  f.className = 'plugin-sandbox';
  f.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;pointer-events:none;left:-10px;top:-10px';
  f.src = new URL(hostPage(network), doc.baseURI).href;
  return f;
}

/** Starts a plugin in its own sandbox and gives back the way to talk to it. */
export function startSandbox(s: SandboxStart, doc: Document = document): Promise<Transport> {
  const frame = makeFrame(doc, s.network);
  return new Promise((resolve, reject) => {
    const win = doc.defaultView!;
    const timer = win.setTimeout(() => {
      cleanup();
      frame.remove();
      reject(new Error("The plugin's sandbox did not start."));
    }, READY_MS);
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow || (e.data as { t?: string })?.t !== 'frameling-plugin-host-ready') return;
      cleanup();
      const ch = new MessageChannel();
      // The frame has no origin, so '*' is the only target that reaches it; it's our own page in our own frame.
      frame.contentWindow!.postMessage({ t: 'start', prelude: PRELUDE, code: s.code, plugin: s.plugin, network: s.network }, '*', [ch.port2]);
      let handler: ((m: unknown) => void) | null = null;
      ch.port1.onmessage = (ev) => handler?.(ev.data);
      resolve({
        post: (msg, transfer) => ch.port1.postMessage(msg, transfer ?? []),
        onMessage: (fn) => void (handler = fn),
        close: () => {
          ch.port1.close();
          // Taking the frame away ends its worker too, even one stuck in a loop.
          frame.remove();
        },
      });
    };
    const cleanup = () => {
      win.clearTimeout(timer);
      win.removeEventListener('message', onMessage);
    };
    win.addEventListener('message', onMessage);
    doc.body.appendChild(frame);
  });
}
