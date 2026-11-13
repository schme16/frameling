// What actually goes on the wire: the method, the headers, the body, and what each answer back means.
import { describe, expect, it, vi } from 'vitest';
import { buildReport } from '../../src/beta/report';

// A build that carries a key, which no ordinary build does.
vi.stubGlobal('__FRAMELING_INGEST__', { url: 'https://boards.example', key: 'pbk_test' });

const { sendReport, checkKey, canSend } = await import('../../src/beta/send');

const report = buildReport({ note: 'Export froze', env: { appVersion: '1.2.3', platform: 'linux' } });
const reply = (status: number, body: unknown = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

describe('the request a build makes', () => {
  it('knows it can send when the build has a key', () => {
    expect(canSend()).toBe(true);
  });

  it('posts the report as JSON with the key as a bearer token', async () => {
    const f = reply(200, { ok: true });
    const out = await sendReport(report, f);
    expect(out).toEqual({ ok: true });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://boards.example/api/ingest');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer pbk_test', 'Content-Type': 'application/json' });
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ app: 'Frameling', kind: 'beta', version: '1.2.3', platform: 'linux', summary: 'Export froze' });
  });

  it('checks the key without sending a report', async () => {
    const f = reply(200, { ok: true });
    expect(await checkKey(f)).toBe(true);
    const [, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit | undefined];
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('says the key is no good when the board says so', async () => {
    expect(await checkKey(reply(401, {}))).toBe(false);
  });

  it('turns each answer into plain words', async () => {
    expect(await sendReport(report, reply(429))).toEqual({ ok: false, why: 'too-often' });
    expect(await sendReport(report, reply(401))).toEqual({ ok: false, why: 'refused' });
    expect(await sendReport(report, reply(413))).toEqual({ ok: false, why: 'too-big' });
    expect(await sendReport(report, reply(500))).toMatchObject({ ok: false, why: 'failed' });
  });

  it('calls no connection no connection, and never retries by itself', async () => {
    const f = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await sendReport(report, f)).toEqual({ ok: false, why: 'offline' });
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});
