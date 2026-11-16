import { describe, expect, it } from 'vitest';
import { handleDoorRequest, hostOk, keyFrom, sameKey, MAX_BODY, type DoorRequest } from '../../src/main/doorHandler';
import { cleanList, cleanVerdict, statusForVerdict, type DoorAsk } from '../../src/shared/streamDoor';

const KEY = 'fld_TestKeyThatIsLongEnough1234567';
const PORT = 47213;

const req = (over: Partial<DoorRequest> & { auth?: string | null } = {}): DoorRequest => {
  const { auth, ...rest } = over;
  return {
    method: 'GET',
    url: '/v1/actions',
    headers: { host: `127.0.0.1:${PORT}`, ...(auth === null ? {} : { authorization: auth ?? `Bearer ${KEY}` }), ...(rest.headers ?? {}) },
    body: '',
    port: PORT,
    ...rest,
    ...(rest.headers ? { headers: { host: `127.0.0.1:${PORT}`, ...(auth === null ? {} : { authorization: auth ?? `Bearer ${KEY}` }), ...rest.headers } } : {}),
  };
};

const LIST = { on: true, actions: [{ id: 'door.message', label: 'Show a message', kind: 'door', cooldownMs: 6000, touchesDrawing: false, ready: true }] };

function deps(answer: (op: DoorAsk) => unknown, seen: DoorAsk[] = []) {
  return {
    key: () => KEY,
    ask: async (op: DoorAsk) => {
      seen.push(op);
      return answer(op);
    },
  };
}

describe('the key', () => {
  it('is needed on every request', async () => {
    const seen: DoorAsk[] = [];
    const d = deps(() => LIST, seen);
    for (const r of [req({ auth: null }), req({ auth: 'Bearer nope' }), req({ auth: 'Basic abc' }), req({ auth: 'Bearer ' }), req({ method: 'POST', url: '/v1/actions/door.message', auth: null })]) {
      const out = await handleDoorRequest(r, d);
      expect(out.status).toBe(401);
      expect(out.body).toMatchObject({ ok: false, reason: 'unauthorized' });
      expect(out.headers['WWW-Authenticate']).toBe('Bearer');
    }
    // The page was never asked anything.
    expect(seen).toEqual([]);
  });

  it('is accepted as a bearer header or as X-Frameling-Key, never in the address', async () => {
    const d = deps(() => LIST);
    expect((await handleDoorRequest(req(), d)).status).toBe(200);
    expect((await handleDoorRequest(req({ auth: null, headers: { 'x-frameling-key': KEY } }), d)).status).toBe(200);
    expect((await handleDoorRequest(req({ auth: null, url: `/v1/actions?key=${KEY}&token=${KEY}` }), d)).status).toBe(401);
  });

  it('is compared whole, and an empty one never matches', () => {
    expect(sameKey(KEY, KEY)).toBe(true);
    expect(sameKey(KEY + 'x', KEY)).toBe(false);
    expect(sameKey(KEY.slice(0, -1), KEY)).toBe(false);
    expect(sameKey('', '')).toBe(false);
    expect(keyFrom({ authorization: 'bearer abc' })).toBe('abc');
    expect(keyFrom({})).toBe('');
  });

  it('a rolled key acts at once', async () => {
    let key = KEY;
    const d = { key: () => key, ask: async () => LIST };
    expect((await handleDoorRequest(req(), d)).status).toBe(200);
    key = 'fld_ANewKeyThatIsAlsoLongEnough12345';
    expect((await handleDoorRequest(req(), d)).status).toBe(401);
  });

  it('is never echoed back in an answer', async () => {
    const out = await handleDoorRequest(req({ auth: `Bearer ${KEY}x` }), deps(() => LIST));
    expect(JSON.stringify(out)).not.toContain(KEY);
  });
});

describe('a request from a web page', () => {
  it('is refused when it carries an Origin, even with the right key', async () => {
    const seen: DoorAsk[] = [];
    for (const origin of ['https://evil.example', 'null', 'http://127.0.0.1:47213', '']) {
      const out = await handleDoorRequest(req({ headers: { origin } }), deps(() => LIST, seen));
      expect(out.status).toBe(403);
      expect(out.body).toMatchObject({ ok: false, reason: 'origin-refused' });
    }
    expect(seen).toEqual([]);
  });

  it('is refused for a browser that says it is cross-site, and for a preflight', async () => {
    expect((await handleDoorRequest(req({ headers: { 'sec-fetch-site': 'cross-site' } }), deps(() => LIST))).status).toBe(403);
    expect((await handleDoorRequest(req({ method: 'OPTIONS', headers: { origin: 'https://x.example', 'access-control-request-method': 'POST' } }), deps(() => LIST))).status).toBe(403);
    // No CORS headers are ever sent, so a page could not read an answer anyway.
    const ok = await handleDoorRequest(req(), deps(() => LIST));
    expect(Object.keys(ok.headers).some((h) => /^access-control/i.test(h))).toBe(false);
  });

  it('is refused when the Host is not this machine (a name pointed at 127.0.0.1)', async () => {
    const out = await handleDoorRequest(req({ headers: { host: `evil.example:${PORT}` } }), deps(() => LIST));
    expect(out.status).toBe(403);
    expect(out.body).toMatchObject({ reason: 'host-refused' });
    expect(hostOk(`localhost:${PORT}`, PORT)).toBe(true);
    expect(hostOk(`127.0.0.1:${PORT + 1}`, PORT)).toBe(false);
  });
});

describe('listing', () => {
  it('asks the page for the list and returns what it says', async () => {
    const seen: DoorAsk[] = [];
    const out = await handleDoorRequest(req(), deps(() => LIST, seen));
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ ok: true, ...LIST });
    expect(seen).toEqual([{ op: 'list' }]);
  });

  it('says not ready when the page does not answer properly', async () => {
    for (const bad of [null, undefined, 'x', { on: 'yes', actions: [] }, { on: true, actions: [{ id: 1 }] }]) {
      const out = await handleDoorRequest(req(), deps(() => bad));
      expect(out.status).toBe(503);
      expect(out.body).toMatchObject({ reason: 'not-ready' });
    }
  });

  it('only lists with GET', async () => {
    const out = await handleDoorRequest(req({ method: 'POST' }), deps(() => LIST));
    expect(out.status).toBe(405);
    expect(out.headers.Allow).toBe('GET');
  });
});

describe('running', () => {
  const run = (verdict: unknown, body = '', id = 'door.message') => handleDoorRequest(req({ method: 'POST', url: `/v1/actions/${id}`, body }), deps(() => verdict));

  it('passes the id and the JSON body on, and nothing else', async () => {
    const seen: DoorAsk[] = [];
    await handleDoorRequest(req({ method: 'POST', url: '/v1/actions/door.message?x=1', body: '{"text":"hi"}' }), deps(() => ({ ok: true, outcome: 'ran' }), seen));
    expect(seen).toEqual([{ op: 'run', id: 'door.message', payload: { text: 'hi' } }]);
    const seen2: DoorAsk[] = [];
    await handleDoorRequest(req({ method: 'POST', url: '/v1/actions/door.fit-view', body: '  ' }), deps(() => ({ ok: true, outcome: 'ran' }), seen2));
    expect(seen2).toEqual([{ op: 'run', id: 'door.fit-view', payload: undefined }]);
  });

  it('returns each verdict honestly, so a caller can tell them apart', async () => {
    const cases: [unknown, number, object][] = [
      [{ ok: true, outcome: 'ran' }, 200, { ok: true, outcome: 'ran' }],
      [{ ok: true, outcome: 'queued', position: 2 }, 202, { ok: true, outcome: 'queued', position: 2 }],
      [{ ok: false, reason: 'cooldown', retryInMs: 4200 }, 429, { ok: false, reason: 'cooldown', retryInMs: 4200 }],
      [{ ok: false, reason: 'queue-full' }, 429, { ok: false, reason: 'queue-full' }],
      [{ ok: false, reason: 'unknown' }, 404, { ok: false, reason: 'unknown' }],
      [{ ok: false, reason: 'unavailable' }, 403, { ok: false, reason: 'unavailable' }],
      [{ ok: false, reason: 'invalid' }, 400, { ok: false, reason: 'invalid' }],
      [{ ok: false, reason: 'off' }, 503, { ok: false, reason: 'off' }],
    ];
    for (const [v, status, body] of cases) {
      const out = await run(v);
      expect(out.status, JSON.stringify(v)).toBe(status);
      // A refusal also carries a sentence for chat; everything an older caller read is still there, unchanged.
      expect(out.body).toEqual((body as { ok: boolean }).ok ? body : { ...body, say: expect.any(String) });
    }
    const cd = await run({ ok: false, reason: 'cooldown', retryInMs: 4200 });
    expect(cd.headers['Retry-After']).toBe('5');
    expect((await run({ ok: false, reason: 'cooldown', retryInMs: 0 })).headers['Retry-After']).toBe('1');
  });

  it('a refusal says why and what to tell chat, with the status and reason as before', async () => {
    const out = await run({ ok: false, reason: 'invalid', detail: 'closed' }, '{"option":1}', 'vote.cast');
    expect(out.status).toBe(400);
    expect(out.body).toEqual({ ok: false, reason: 'invalid', detail: 'closed', say: 'No vote is running right now.' });
    const wait = await run({ ok: false, reason: 'cooldown', detail: 'channel-wait', retryInMs: 2100 }, '{"text":"x"}', 'jar.add');
    expect(wait.status).toBe(429);
    expect(wait.headers['Retry-After']).toBe('3');
    expect(wait.body).toEqual({ ok: false, reason: 'cooldown', detail: 'channel-wait', retryInMs: 2100, say: 'The prompt jar just took one. Try again in 3 seconds.' });
  });

  it('a refusal with no detail still has a sentence, and a success has none', async () => {
    expect((await run({ ok: false, reason: 'invalid' })).body).toEqual({ ok: false, reason: 'invalid', say: 'Frameling could not use that.' });
    expect(await run({ ok: true, outcome: 'ran' })).toMatchObject({ body: { ok: true, outcome: 'ran' } });
    expect((await run({ ok: true, outcome: 'ran' })).body).not.toHaveProperty('say');
  });

  it('keeps only the verdict fields (a page cannot smuggle more through)', async () => {
    const out = await run({ ok: true, outcome: 'ran', secret: 'x', who: 'viewer' });
    expect(out.body).toEqual({ ok: true, outcome: 'ran' });
  });

  it('does not take a verdict it does not know', async () => {
    for (const bad of [null, { ok: false, reason: 'teapot' }, { ok: true, outcome: 'maybe' }, { ok: true, outcome: 'queued' }]) expect((await run(bad)).status).toBe(503);
  });

  it('decodes the id, and refuses a path that is not one id', async () => {
    const seen: DoorAsk[] = [];
    await handleDoorRequest(req({ method: 'POST', url: '/v1/actions/quill%2Echeer' }), deps(() => ({ ok: true, outcome: 'ran' }), seen));
    expect(seen[0]).toMatchObject({ id: 'quill.cheer' });
    expect((await run({ ok: true, outcome: 'ran' }, '', 'a/b')).status).toBe(404);
    expect((await handleDoorRequest(req({ method: 'POST', url: '/v1/actions/' }), deps(() => LIST))).status).toBe(405);
  });

  it('only runs with POST', async () => {
    const out = await handleDoorRequest(req({ url: '/v1/actions/door.message' }), deps(() => LIST));
    expect(out.status).toBe(405);
    expect(out.headers.Allow).toBe('POST');
  });
});

describe('a bad request does not throw', () => {
  it('says what was wrong, in a status a caller can read', async () => {
    const d = deps(() => ({ ok: true, outcome: 'ran' }));
    const post = (url: string, body = '') => handleDoorRequest(req({ method: 'POST', url, body }), d);
    expect((await post('/v1/actions/door.message', '{not json')).body).toMatchObject({ reason: 'bad-request' });
    expect((await post('/v1/actions/door.message', 'x'.repeat(MAX_BODY + 1))).status).toBe(413);
    expect((await post('/v1/actions/%E0%A4%A')).body).toMatchObject({ reason: 'bad-request' });
    expect((await handleDoorRequest(req({ url: '/nothing' }), d)).body).toMatchObject({ reason: 'no-such-route' });
    expect((await handleDoorRequest(req({ url: '/v1' }), d)).status).toBe(404);
    expect((await handleDoorRequest(req({ method: 'DELETE', url: '/v1/actions' }), d)).status).toBe(405);
  });

  it('answers 500 when asking the page throws, and never says why', async () => {
    const out = await handleDoorRequest(req(), { key: () => KEY, ask: async () => Promise.reject(new Error('/home/me/secret/path blew up')) });
    expect(out.status).toBe(500);
    expect(JSON.stringify(out.body)).not.toContain('secret');
    const out2 = await handleDoorRequest({ ...req(), headers: undefined as never }, deps(() => LIST));
    expect(out2.status).toBe(500);
  });
});

describe('the shared helpers', () => {
  it('maps every verdict to a status', () => {
    expect(statusForVerdict({ ok: false, reason: 'off' })).toBe(503);
    expect(statusForVerdict({ ok: true, outcome: 'queued', position: 1 })).toBe(202);
  });
  it('cleans verdicts and lists', () => {
    expect(cleanVerdict({ ok: false, reason: 'cooldown', retryInMs: -5 })).toEqual({ ok: false, reason: 'cooldown', retryInMs: 0 });
    expect(cleanList({ on: false, actions: [] })).toEqual({ on: false, actions: [] });
    expect(cleanList({ on: true, actions: [{ id: 'a.b', label: 'x', kind: 'k', cooldownMs: 1, touchesDrawing: 1, extra: 'no' }] })?.actions[0]).toEqual({ id: 'a.b', label: 'x', kind: 'k', cooldownMs: 1, touchesDrawing: false, ready: true });
    expect(cleanList({ on: true, actions: [{ id: 'a.b', label: 'x', kind: 'k', cooldownMs: 1, ready: false }] })?.actions[0].ready).toBe(false);
    // A detail is one short word and nothing a viewer wrote can ride along in it.
    expect(cleanVerdict({ ok: false, reason: 'invalid', detail: 'closed' })).toEqual({ ok: false, reason: 'invalid', detail: 'closed' });
    for (const bad of ['No vote is running', 'x'.repeat(40), 'Closed', '', 5, null]) expect(cleanVerdict({ ok: false, reason: 'invalid', detail: bad }), String(bad)).toEqual({ ok: false, reason: 'invalid' });
  });
});
