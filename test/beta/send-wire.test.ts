// What actually goes on the wire: the method, the headers, the body, and what each answer back means.
import { describe, expect, it, vi } from 'vitest';
import { buildReport } from '../../src/beta/report';
import type { Reply } from '../../src/beta/outcome';

// A build that carries a key, which no ordinary build does.
vi.stubGlobal('__FRAMELING_INGEST__', { url: 'https://boards.example', key: 'pbk_test' });

const { sendReport, checkKey, checkBoard, canSend, fetchTransport, lastSendFailure } = await import('../../src/beta/send');

const report = buildReport({ note: 'Export froze', env: { appVersion: '1.2.3', platform: 'linux' } });
const json = (status: number, body: unknown = { ok: true }): Reply => ({ status, type: 'application/json; charset=utf-8', text: JSON.stringify(body) });
const html = (status: number): Reply => ({ status, type: 'text/html', text: '<html>Sign in to the wifi</html>' });
const answer = (r: Reply) => vi.fn(async () => r);
const calls = (f: ReturnType<typeof vi.fn>) => f.mock.calls as unknown as [string, { method: string; headers?: Record<string, string>; body?: string }][];

describe('the request a build makes', () => {
  it('knows it can send when the build has a key', () => {
    expect(canSend()).toBe(true);
  });

  it('posts the report as JSON with the key as a bearer token', async () => {
    const f = answer(json(200, { ok: true }));
    const out = await sendReport(report, f);
    expect(out).toEqual({ ok: true });
    const [url, init] = calls(f)[0];
    expect(url).toBe('https://boards.example/api/ingest');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer pbk_test', 'Content-Type': 'application/json' });
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ app: 'Frameling', kind: 'beta', version: '1.2.3', platform: 'linux', summary: 'Export froze' });
  });

  it('checks the key without sending a report', async () => {
    const f = answer(json(200, { ok: true }));
    expect(await checkKey(f)).toBe(true);
    expect(calls(f)[0][1].method).toBe('GET');
    expect(calls(f)[0][1].body).toBeUndefined();
  });

  it('says the key is no good when the board says so', async () => {
    expect(await checkKey(answer(json(401, { error: 'an ingest key is needed' })))).toBe(false);
  });

  it('turns each answer into plain words', async () => {
    expect(await sendReport(report, answer(json(429)))).toEqual({ ok: false, why: 'too-often' });
    expect(await sendReport(report, answer(json(401, { error: 'no' })))).toMatchObject({ ok: false, why: 'refused' });
    expect(await sendReport(report, answer(json(403, { error: 'no' })))).toMatchObject({ ok: false, why: 'refused' });
    expect(await sendReport(report, answer(json(413)))).toEqual({ ok: false, why: 'too-big' });
    expect(await sendReport(report, answer(json(500)))).toMatchObject({ ok: false, why: 'server' });
  });

  it('never calls a sign-in page or a filter a success, or a refused key', async () => {
    expect(await sendReport(report, answer(html(200)))).toMatchObject({ ok: false, why: 'intercepted' });
    expect(await sendReport(report, answer(html(403)))).toMatchObject({ ok: false, why: 'intercepted' });
    expect(await sendReport(report, answer(html(401)))).toMatchObject({ ok: false, why: 'intercepted' });
  });

  it('never retries by itself when the request fails', async () => {
    const f = answer({ code: 'ERR_NAME_NOT_RESOLVED' });
    const out = await sendReport(report, f);
    expect(out).toMatchObject({ ok: false, why: 'dns' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('remembers how the last one went wrong, for a crash that went by itself', async () => {
    await sendReport(report, answer({ code: 'ERR_CERT_AUTHORITY_INVALID' }));
    expect(lastSendFailure()).toMatchObject({ why: 'certificate' });
    await sendReport(report, answer(json(200)));
    expect(lastSendFailure()).toBeNull();
  });
});

describe('checking the board', () => {
  it('tells the board being out of reach apart from the key being refused', async () => {
    expect(await checkBoard(answer({ code: 'ERR_NAME_NOT_RESOLVED' }))).toMatchObject({ ok: false, why: 'dns', stage: 'board' });
    const f = vi.fn(async (url: string) => (url.endsWith('/health') ? json(200) : json(401, { error: 'key' })));
    expect(await checkBoard(f)).toMatchObject({ ok: false, why: 'refused', stage: 'key' });
    expect(await checkBoard(answer(json(200)))).toEqual({ ok: true });
  });

  it('asks the health address without the key', async () => {
    const f = answer(json(200));
    await checkBoard(f);
    const [url, init] = calls(f)[0];
    expect(url).toBe('https://boards.example/api/health');
    expect(init.headers).toBeUndefined();
  });
});

describe('the page\'s own fetch, when there is no desktop side', () => {
  const asReply = (fetcher: typeof fetch) => fetchTransport(fetcher)('https://boards.example/api/ingest', { method: 'POST', body: '{}' });

  it('hands back the status, type and text', async () => {
    const r = await asReply((async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch);
    expect(r).toEqual({ status: 200, type: 'application/json', text: '{"ok":true}' });
  });

  it('says only that it failed when it throws, and a timeout is a timeout', async () => {
    expect(await asReply((async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch)).toMatchObject({ code: 'FETCH_FAILED' });
    const timed = Object.assign(new Error('x'), { name: 'TimeoutError' });
    expect(await asReply((async () => { throw timed; }) as typeof fetch)).toMatchObject({ code: 'TIMEOUT' });
  });

  it('only blames the connection when there really is none', async () => {
    const was = globalThis.navigator;
    vi.stubGlobal('navigator', { onLine: true });
    expect(await sendReport(report, answer({ code: 'FETCH_FAILED' }))).toEqual({ ok: false, why: 'unreachable' });
    vi.stubGlobal('navigator', { onLine: false });
    expect(await sendReport(report, answer({ code: 'FETCH_FAILED' }))).toEqual({ ok: false, why: 'offline' });
    vi.stubGlobal('navigator', was);
  });
});
