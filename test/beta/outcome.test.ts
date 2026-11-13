// Every way a report can fail is told apart, and none of them is called a lost connection by mistake.
import { describe, expect, it } from 'vitest';
import { mayReach, netCode, outcomeOf, SEND_WORDS, sayFailure, whyFromCode, type Failure } from '../../src/beta/outcome';

const json = (status: number, body: unknown = { ok: true }) => ({ status, type: 'application/json', text: JSON.stringify(body) });

describe('which kind of network trouble a code means', () => {
  it('names each cause', () => {
    expect(whyFromCode('net::ERR_NAME_NOT_RESOLVED')).toBe('dns');
    expect(whyFromCode('ERR_CERT_AUTHORITY_INVALID')).toBe('certificate');
    expect(whyFromCode('ERR_CERT_DATE_INVALID')).toBe('certificate');
    expect(whyFromCode('ERR_SSL_PROTOCOL_ERROR')).toBe('certificate');
    expect(whyFromCode('ERR_PROXY_CONNECTION_FAILED')).toBe('proxy');
    expect(whyFromCode('ERR_TUNNEL_CONNECTION_FAILED')).toBe('proxy');
    expect(whyFromCode('ERR_UNEXPECTED_PROXY_AUTH')).toBe('proxy');
    expect(whyFromCode('ERR_CONNECTION_TIMED_OUT')).toBe('timeout');
    expect(whyFromCode('TIMEOUT')).toBe('timeout');
    expect(whyFromCode('ERR_INTERNET_DISCONNECTED')).toBe('offline');
    expect(whyFromCode('ERR_BLOCKED_BY_CLIENT')).toBe('blocked');
    expect(whyFromCode('ERR_BLOCKED_BY_CSP')).toBe('blocked');
    expect(whyFromCode('ERR_CONNECTION_REFUSED')).toBe('cutoff');
    expect(whyFromCode('ERR_CONNECTION_RESET')).toBe('cutoff');
  });

  it('does not blame the wifi for an unknown failure while the computer says it is online', () => {
    expect(whyFromCode('FETCH_FAILED', true)).toBe('unreachable');
    expect(whyFromCode('', true)).toBe('unreachable');
    expect(whyFromCode('FETCH_FAILED', false)).toBe('offline');
    // A known cause beats the online flag, which on Linux is often wrong.
    expect(whyFromCode('ERR_NAME_NOT_RESOLVED', false)).toBe('dns');
  });

  it('finds the code inside an error', () => {
    expect(netCode(new TypeError('net::ERR_NAME_NOT_RESOLVED'))).toBe('ERR_NAME_NOT_RESOLVED');
    expect(netCode(new TypeError('fetch failed', { cause: new Error('net::ERR_CERT_COMMON_NAME_INVALID') }))).toBe('ERR_CERT_COMMON_NAME_INVALID');
    expect(netCode(Object.assign(new Error('x'), { code: 'ERR_CONNECTION_REFUSED' }))).toBe('ERR_CONNECTION_REFUSED');
    expect(netCode(new Error('nothing useful'))).toBe('');
    expect(netCode(undefined)).toBe('');
  });
});

describe('what an answer from the board means', () => {
  it('is only a success when the board itself said so', () => {
    expect(outcomeOf(json(200))).toEqual({ ok: true });
    expect(outcomeOf(json(200, { ok: false }))).toMatchObject({ ok: false, why: 'intercepted' });
    expect(outcomeOf({ status: 200, type: 'text/html', text: '<html></html>' })).toMatchObject({ ok: false, why: 'intercepted' });
    expect(outcomeOf({ status: 200, type: 'application/json', text: 'not json' })).toMatchObject({ ok: false, why: 'intercepted' });
  });

  it('tells a refused key from something in the way', () => {
    expect(outcomeOf(json(401, { error: 'key' }))).toMatchObject({ why: 'refused', detail: 'HTTP 401' });
    expect(outcomeOf({ status: 403, type: 'text/html', text: 'Attention Required' })).toMatchObject({ why: 'intercepted' });
    expect(outcomeOf({ status: 407, type: 'text/html', text: '' })).toMatchObject({ why: 'proxy' });
    expect(outcomeOf({ status: 302, type: 'text/html', text: '' })).toMatchObject({ why: 'intercepted' });
  });

  it('puts the board being down on the board', () => {
    expect(outcomeOf({ status: 502, type: 'text/html', text: 'Bad gateway' })).toMatchObject({ why: 'server', detail: 'HTTP 502' });
    expect(outcomeOf(json(500))).toMatchObject({ why: 'server' });
  });

  it('keeps the code as detail so a tester can quote it', () => {
    expect(outcomeOf({ code: 'net::ERR_NAME_NOT_RESOLVED' })).toEqual({ ok: false, why: 'dns', detail: 'ERR_NAME_NOT_RESOLVED' });
    expect(outcomeOf({ code: 'FETCH_FAILED' })).toEqual({ ok: false, why: 'unreachable' });
  });
});

describe('the words', () => {
  it('only the real offline case says anything about being offline', () => {
    for (const [why, words] of Object.entries(SEND_WORDS)) {
      if (why !== 'offline') expect(words).not.toMatch(/no connection|lost connection|offline/i);
      expect(words).not.toMatch(/[–—]/);
    }
  });

  it('adds the detail in brackets', () => {
    const f: Failure = { ok: false, why: 'dns', detail: 'ERR_NAME_NOT_RESOLVED' };
    expect(sayFailure(f)).toMatch(/\(ERR_NAME_NOT_RESOLVED\)$/);
    expect(sayFailure({ ok: false, why: 'too-big' })).toBe(SEND_WORDS['too-big']);
  });
});

describe('where the desktop side will send for the page', () => {
  const origin = 'https://boards.example';
  it('allows the build\'s own board, on its two report addresses', () => {
    expect(mayReach('https://boards.example/api/ingest', origin)).toBe(true);
    expect(mayReach('https://boards.example/api/health', origin)).toBe(true);
  });
  it('allows nothing else', () => {
    expect(mayReach('https://boards.example/api/projects', origin)).toBe(false);
    expect(mayReach('https://evil.example/api/ingest', origin)).toBe(false);
    expect(mayReach('http://boards.example/api/ingest', origin)).toBe(false);
    expect(mayReach('https://boards.example.evil.example/api/ingest', origin)).toBe(false);
    expect(mayReach('file:///etc/passwd', origin)).toBe(false);
    expect(mayReach('nonsense', origin)).toBe(false);
    expect(mayReach(42, origin)).toBe(false);
  });
  it('allows nothing at all in an ordinary build', () => {
    expect(mayReach('https://boards.example/api/ingest', '')).toBe(false);
  });
});
