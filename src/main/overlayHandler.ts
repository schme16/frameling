// The stream overlay's request handling, as one pure function: a request in, an answer out. No sockets and no Electron,
// so every rule is tested by calling it. It lives beside the actions door on the same local server and shares nothing
// with the door's handler (doorHandler.ts is not changed by it): its own path, its own token, its own rules.
//
//   GET /overlay/<token>/            the page (what an OBS browser source loads)
//   GET /overlay/<token>/overlay.js  the page's script, and /overlay.css its styles
//   GET /overlay/<token>/state       what is going on right now, as JSON (the page asks for it a few times a second)
//   GET /overlay/<token>/quill.png   Quill's sprite sheet, and /quill.json its frame list
//
// WHY THIS IS NOT THE DOOR'S RULES. The door refuses any request with an Origin header, because a request from a web
// page is how some other site in your browser could press its buttons. An OBS browser source is a web page, so its
// requests look exactly like that, and the door's rule would shut it out. Loosening the door would undo that. So the
// overlay is a separate thing that can do almost nothing:
//   - It is read only. It carries no key, runs no action, takes no body, and only answers GET and HEAD.
//   - It is gated by a token in the address, which is not the door key (a different secret, rolled on its own), and
//     the door's key opens nothing here. OBS can only be given an address, never a header, so the token has to be in it.
//   - What it serves is only what the sanitiser let through (cleanOverlayState): plain facts, no paths, names or keys.
//   - Web pages are still shut out: an Origin other than this server's own, or a Sec-Fetch-Site of cross-site, same-site
//     or cross-origin, is refused. A normal visit (a browser source, the address typed in) sends neither, or "none".
//   - The Host has to name this machine and this port, which stops DNS rebinding.
//   - No Access-Control-Allow-Origin is ever sent, so no other page can read an answer even if one got through.
import { sameKey, hostOk } from './doorHandler';
import { liveOverlay, OVERLAY_PREFIX, OVERLAY_STALE_MS, emptyOverlay, type OverlayState } from '../shared/streamOverlay';

export interface OverlayRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  port: number;
}

export interface OverlayResponse {
  status: number;
  headers: Record<string, string>;
  body: string | Buffer;
}

export interface OverlayAsset {
  type: string;
  data: Buffer | string;
}

export interface OverlayDeps {
  /** The token in force, read per request so a new one acts at once. */
  token(): string;
  /** False while the overlay is switched off (the feature is off, or the page is not there): every address then answers as if it did not exist. */
  enabled(): boolean;
  /** What the app last said, already cleaned, and when it said it (epoch ms). */
  latest(): { state: OverlayState; at: number } | null;
  /** The page's own files by name ('' for the page itself), or null. */
  asset(name: string): OverlayAsset | null;
  now(): number;
}

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

/** Headers on every answer: nothing cached, nothing sniffed, nothing leaked in a Referer, nothing framed, nothing but its own files loaded. */
export const OVERLAY_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

const reply = (status: number, type: string, body: string | Buffer, extra: Record<string, string> = {}): OverlayResponse => ({ status, headers: { ...OVERLAY_HEADERS, 'Content-Type': type, ...extra }, body });
const plain = (status: number, text: string, extra: Record<string, string> = {}): OverlayResponse => reply(status, 'text/plain; charset=utf-8', text, extra);

/** True for a path this handler owns, so the server knows to hand it here and not to the door. */
export const isOverlayPath = (url: string): boolean => {
  const p = url.split('?')[0];
  return p === OVERLAY_PREFIX || p.startsWith(`${OVERLAY_PREFIX}/`);
};

/** Is this request one that came from some other web page? A browser source or a typed address sends no Origin and no cross-site mark. */
export function fromAnotherPage(headers: OverlayRequest['headers'], port: number): boolean {
  const origin = first(headers.origin);
  if (headers.origin !== undefined && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return true;
  const site = first(headers['sec-fetch-site']);
  return site !== '' && site !== 'none' && site !== 'same-origin';
}

const NOT_FOUND = 'Nothing here.';

/** The answer to a request on the overlay's path. Never throws, and never says why a token was wrong. */
export function handleOverlayRequest(req: OverlayRequest, deps: OverlayDeps): OverlayResponse {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return plain(405, 'The overlay can only be read.', { Allow: 'GET, HEAD' });
    if (!hostOk(first(req.headers.host), req.port)) return plain(403, 'Use the address 127.0.0.1 with the port Frameling shows.');
    if (fromAnotherPage(req.headers, req.port)) return plain(403, 'Web pages cannot use the overlay.');

    let path: string;
    try {
      path = new URL(req.url, 'http://127.0.0.1').pathname;
    } catch {
      return plain(400, 'That address could not be read.');
    }
    const parts = path.split('/'); // ['', 'overlay', token, name?, ...]
    const token = parts[2] ?? '';
    // A wrong token, an overlay that is off and a path that is not there all say the same thing.
    if (!deps.enabled() || !token || !sameKey(token, deps.token())) return plain(404, NOT_FOUND);
    const name = parts.slice(3).join('/');
    if (parts.length > 4) return plain(404, NOT_FOUND);

    if (name === 'state') {
      const now = deps.now();
      const got = deps.latest();
      const fresh = got && now - got.at <= OVERLAY_STALE_MS ? liveOverlay(got.state, now) : emptyOverlay();
      return reply(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, now, state: fresh }));
    }
    // The page, with or without the closing slash. Without it the page's relative addresses would point the wrong way.
    if (name === '' && parts.length === 3) return reply(308, 'text/plain; charset=utf-8', 'Redirecting.', { Location: `${OVERLAY_PREFIX}/${token}/` });
    const a = deps.asset(name);
    if (!a) return plain(404, NOT_FOUND);
    return reply(200, a.type, a.data);
  } catch {
    return plain(500, 'Something went wrong inside Frameling.');
  }
}
