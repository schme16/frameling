// The remote door's request rules, as pure calls: the key is required, web pages are refused, a bad request is refused,
// and a good one is passed on to the page and the page's answer comes back.
import { describe, expect, it } from 'vitest';
import { handleRemoteRequest, type RemoteDeps } from '../../src/main/remoteHandler';
import type { DoorRequest } from '../../src/main/doorHandler';
import type { RemoteAsk } from '../../src/shared/remoteDoor';

const KEY = 'frd_testkeytestkeytestkeytestkey';
const PORT = 47231;
const asked: RemoteAsk[] = [];
const deps = (answer: unknown = { status: 200, body: { ok: true } }): RemoteDeps => ({ key: () => KEY, ask: async (op) => (asked.push(op), answer) });
const req = (o: Partial<DoorRequest> = {}): DoorRequest => ({ method: 'GET', url: '/v1', headers: { authorization: `Bearer ${KEY}`, host: `127.0.0.1:${PORT}` }, body: '', port: PORT, ...o });

describe('the key', () => {
  it('is required: no key is 401 and the page is never asked', async () => {
    asked.length = 0;
    const r = await handleRemoteRequest(req({ headers: { host: `127.0.0.1:${PORT}` } }), deps());
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ ok: false, reason: 'unauthorized' });
    expect(asked).toEqual([]);
  });
  it('has to be the right one, and the actions door\'s key is not it', async () => {
    asked.length = 0;
    for (const k of ['nope', 'fld_' + 'x'.repeat(30), KEY + 'x', '']) {
      const r = await handleRemoteRequest(req({ headers: { authorization: `Bearer ${k}`, host: `127.0.0.1:${PORT}` } }), deps());
      expect(r.status, k).toBe(401);
    }
    expect(asked).toEqual([]);
  });
  it('may come in the other header', async () => {
    const r = await handleRemoteRequest(req({ headers: { 'x-frameling-key': KEY, host: `127.0.0.1:${PORT}` } }), deps());
    expect(r.status).toBe(200);
  });
  it('is read for every request, so a new key acts at once', async () => {
    let k = KEY;
    const d: RemoteDeps = { key: () => k, ask: async () => ({ status: 200, body: { ok: true } }) };
    expect((await handleRemoteRequest(req(), d)).status).toBe(200);
    k = 'frd_somethingelsesomethingelse00';
    expect((await handleRemoteRequest(req(), d)).status).toBe(401);
  });
});

describe('who may ask', () => {
  it('refuses a web page before it looks at the key', async () => {
    const r = await handleRemoteRequest(req({ headers: { authorization: `Bearer ${KEY}`, origin: 'https://evil.example', host: `127.0.0.1:${PORT}` } }), deps());
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ reason: 'origin-refused' });
    const r2 = await handleRemoteRequest(req({ headers: { authorization: 'Bearer wrong', 'sec-fetch-site': 'cross-site', host: `127.0.0.1:${PORT}` } }), deps());
    expect(r2.status).toBe(403);
  });
  it('refuses a request for another name or port (a page pointing its own name at this computer)', async () => {
    for (const host of ['evil.example', `evil.example:${PORT}`, '127.0.0.1:1234', `192.168.1.5:${PORT}`]) {
      expect((await handleRemoteRequest(req({ headers: { authorization: `Bearer ${KEY}`, host } }), deps())).status, host).toBe(403);
    }
  });
});

describe('a bad request', () => {
  it('is refused with a plain reason, and never reaches the page', async () => {
    asked.length = 0;
    const post = (url: string, body = '') => handleRemoteRequest(req({ method: 'POST', url, body }), deps());
    expect((await post('/v1/run', '{oops')).body).toMatchObject({ reason: 'bad-request' });
    expect((await post('/v1/run', 'x'.repeat(140_000))).status).toBe(413);
    expect((await post('/v1/commands/')).status).toBe(405);
    expect((await post('/v1/commands/a%2Fb')).status).toBe(404);
    expect((await post('/v1/commands/%E0%A4%A')).status).toBe(400);
    expect((await post('/v2/run')).status).toBe(404);
    expect((await post('/v1/files')).status).toBe(404);
    expect((await handleRemoteRequest(req({ method: 'GET', url: '/v1/run' }), deps())).status).toBe(405);
    expect((await handleRemoteRequest(req({ method: 'POST', url: '/v1/state' }), deps())).status).toBe(405);
    expect((await handleRemoteRequest(req({ method: 'DELETE', url: '/v1/commands' }), deps())).status).toBe(405);
    expect(asked).toEqual([]);
  });
  it('says "not ready" when the page does not answer or answers nonsense', async () => {
    for (const answer of [null, 'ok', { status: 200 }, { status: 302, body: {} }, { status: 200, body: [] }]) {
      expect((await handleRemoteRequest(req(), deps(answer))).status, JSON.stringify(answer)).toBe(503);
    }
  });
  it('never throws and never says why', async () => {
    const d: RemoteDeps = { key: () => KEY, ask: () => Promise.reject(new Error('secret path /home/me')) };
    const r = await handleRemoteRequest(req(), d);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('secret');
  });
});

describe('a good request', () => {
  it('turns each route into the page question', async () => {
    const q = async (o: Partial<DoorRequest>) => {
      asked.length = 0;
      const r = await handleRemoteRequest(req(o), deps({ status: 200, body: { ok: true, hi: 1 } }));
      return { r, asked: [...asked] };
    };
    expect((await q({ url: '/v1' })).asked).toEqual([{ op: 'hello' }]);
    expect((await q({ url: '/v1/' })).asked).toEqual([{ op: 'hello' }]);
    expect((await q({ url: '/v1/state' })).asked).toEqual([{ op: 'state' }]);
    expect((await q({ url: '/v1/document' })).asked).toEqual([{ op: 'document' }]);
    expect((await q({ url: '/v1/commands' })).asked).toEqual([{ op: 'commands' }]);
    expect((await q({ method: 'POST', url: '/v1/commands/edit.duplicate' })).asked).toEqual([{ op: 'run', body: { steps: [{ command: 'edit.duplicate' }] } }]);
    expect((await q({ method: 'POST', url: '/v1/run', body: '{"steps":[]}' })).asked).toEqual([{ op: 'run', body: { steps: [] } }]);
    expect((await q({ method: 'POST', url: '/v1/script', body: '{"code":"1"}' })).asked).toEqual([{ op: 'script', body: { code: '1' } }]);
    const got = await q({ url: '/v1/state' });
    expect(got.r).toMatchObject({ status: 200, body: { ok: true, hi: 1 } });
  });
  it('passes the page\'s refusals on with their status', async () => {
    const r = await handleRemoteRequest(req({ method: 'POST', url: '/v1/run', body: '{}' }), deps({ status: 409, body: { ok: false, reason: 'busy', detail: 'stroke' } }));
    expect(r).toMatchObject({ status: 409, body: { reason: 'busy', detail: 'stroke' } });
  });
});
