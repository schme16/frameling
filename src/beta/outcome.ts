/**
 * What happened when a report tried to leave, in plain words. Pure: it takes the raw answer (or the network error's
 * code) and says which kind of trouble it was, so the person is told the real cause and never a vague "lost
 * connection". The code that actually makes the request is in send.ts (renderer) and src/main/beta.ts (desktop).
 */

/** What came back from the board, or what stopped it coming back. */
export type Reply =
  | { status: number; type: string; text: string }
  | { code: string; message?: string };

export type Why =
  | 'no-key'
  | 'too-big'
  | 'too-often'
  | 'refused'
  | 'server'
  | 'intercepted'
  | 'offline'
  | 'dns'
  | 'certificate'
  | 'proxy'
  | 'timeout'
  | 'blocked'
  | 'cutoff'
  | 'unreachable'
  | 'failed';

export type Failure = { ok: false; why: Why; detail?: string };
export type SendOutcome = { ok: true } | Failure;

/** The board's host, quoted in the words about finding it. */
export const BOARD_HOST = 'project-boards.shanegadsby.com';

/** Plain words for each way it can go wrong, each saying whose side the trouble is on. */
export const SEND_WORDS: Record<Why, string> = {
  'no-key': "This copy of Frameling wasn't made with a way to send reports, so it isn't your internet. Save the file instead and send it however you like.",
  'too-big': 'That report is too big to send. Shorten the note and try again.',
  'too-often': 'That is a lot of reports in a short while. Have a cup of tea and try again in a few minutes.',
  refused: "The board turned the report away: the key in this copy isn't accepted. Your internet is fine; ask for a newer copy of Frameling.",
  server: "The board is having trouble right now. That's on our side, not yours. Try again later, or save the file instead.",
  intercepted: 'Something between you and the board answered instead of the board, like a wi-fi sign-in page, a company filter or a firewall. Sign in to the network or try another one, or save the file instead.',
  offline: "This computer says it isn't online, so nothing went. It will not be sent by itself later: press Send again when you're back.",
  dns: `This computer couldn't find the board's address (${BOARD_HOST}). That's the network, a VPN or a DNS setting, not Frameling. Try another network, or save the file instead.`,
  certificate: "The board's security certificate wasn't trusted, so nothing went. A work or school network that checks traffic can cause that, and so can a wrong date or time on this computer.",
  proxy: 'A proxy on this network stopped the connection. Try another network, or save the file instead.',
  timeout: 'The board took too long to answer, so Frameling stopped waiting. It will not try again by itself: press Send in a minute.',
  blocked: 'Something on this computer (a firewall, a security setting or an ad blocker) stopped the request before it left. Save the file instead and send it however you like.',
  cutoff: 'The connection was refused or cut off on the way, which points at a firewall or a filter on this network. Try another network, or save the file instead.',
  unreachable: "Couldn't reach the board, and nothing says why. It will not try again by itself: press Send when you want to.",
  failed: "That didn't go through. Save the file instead and send it however you like.",
};

/** The words, with the technical detail after them so a tester can quote it. */
export const sayFailure = (f: Failure): string => (f.detail ? `${SEND_WORDS[f.why]} (${f.detail})` : SEND_WORDS[f.why]);

/** Pulls Chromium's `net::ERR_...` name out of whatever an error says. */
export function netCode(e: unknown): string {
  const seen: string[] = [];
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    if (typeof cur === 'string') seen.push(cur);
    else if (typeof cur === 'object') {
      const o = cur as { message?: unknown; code?: unknown; cause?: unknown };
      if (typeof o.message === 'string') seen.push(o.message);
      if (typeof o.code === 'string') seen.push(o.code);
      cur = o.cause;
      continue;
    }
    break;
  }
  const hit = seen.join(' ').match(/(?:net::)?(ERR_[A-Z0-9_]+)/);
  return hit ? hit[1] : '';
}

/** Which kind of trouble a network error code means. An empty or unknown code is just "unreachable". */
export function whyFromCode(code: string, online = true): Why {
  const c = code.replace(/^net::/, '');
  if (c === 'TIMEOUT' || /^ERR_(CONNECTION_)?TIMED_OUT$/.test(c)) return 'timeout';
  if (/^ERR_(NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED|DNS_)/.test(c)) return 'dns';
  if (/^ERR_(CERT_|SSL_|BAD_SSL_|INSECURE_RESPONSE)/.test(c)) return 'certificate';
  if (/^ERR_(PROXY_|UNEXPECTED_PROXY_AUTH|TUNNEL_CONNECTION_FAILED|NO_SUPPORTED_PROXIES|MANDATORY_PROXY)/.test(c)) return 'proxy';
  if (/^ERR_(INTERNET_DISCONNECTED|NETWORK_CHANGED)$/.test(c)) return 'offline';
  if (/^ERR_(BLOCKED_|ACCESS_DENIED|NETWORK_ACCESS_DENIED|UNSAFE_PORT)/.test(c)) return 'blocked';
  if (/^ERR_(CONNECTION_(REFUSED|RESET|CLOSED|FAILED|ABORTED)|ADDRESS_UNREACHABLE|NETWORK_UNREACHABLE|EMPTY_RESPONSE)$/.test(c)) return 'cutoff';
  // The page's own fetch says "Failed to fetch" for everything, so the best it can do is not blame the wifi.
  return online ? 'unreachable' : 'offline';
}

const isJson = (type: string) => /json/i.test(type);

/** Does this look like the board's own JSON answer? A sign-in page or filter sends HTML even with a 200. */
function boardJson(r: { type: string; text: string }): { ok?: unknown } | null {
  if (!isJson(r.type)) return null;
  try {
    const v = JSON.parse(r.text);
    return v && typeof v === 'object' ? (v as { ok?: unknown }) : null;
  } catch {
    return null;
  }
}

/** Turns whatever came back into success or the right kind of failure. */
export function outcomeOf(reply: Reply, online = true): SendOutcome {
  if ('code' in reply) {
    const why = whyFromCode(reply.code, online);
    const detail = reply.code === 'FETCH_FAILED' ? undefined : reply.code.replace(/^net::/, '');
    return detail ? { ok: false, why, detail } : { ok: false, why };
  }
  const { status } = reply;
  const body = boardJson(reply);
  if (status >= 200 && status < 300) return body && body.ok !== false ? { ok: true } : { ok: false, why: 'intercepted', detail: `HTTP ${status}, not the board's answer` };
  if (status === 429) return { ok: false, why: 'too-often' };
  if (status === 413) return { ok: false, why: 'too-big' };
  if (status === 407) return { ok: false, why: 'proxy', detail: 'HTTP 407' };
  if (status >= 500) return { ok: false, why: 'server', detail: `HTTP ${status}` };
  // Only the board answers a refused key in JSON. HTML with a 401 or 403 is a filter or a sign-in page in the way.
  if (status === 401 || status === 403) return body ? { ok: false, why: 'refused', detail: `HTTP ${status}` } : { ok: false, why: 'intercepted', detail: `HTTP ${status}, not the board's answer` };
  return body ? { ok: false, why: 'failed', detail: `HTTP ${status}` } : { ok: false, why: 'intercepted', detail: `HTTP ${status}, not the board's answer` };
}

/** The only two addresses a report build talks to. Anything else is refused by the desktop side. */
export const INGEST_PATHS = ['/api/ingest', '/api/health'];

/** Whether the desktop side may make this request for the page: the build's own board, https, and one of two paths. */
export function mayReach(url: unknown, origin: string): boolean {
  if (typeof url !== 'string' || !origin) return false;
  try {
    const u = new URL(url);
    return u.origin === origin && (u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1') && INGEST_PATHS.includes(u.pathname);
  } catch {
    return false;
  }
}
