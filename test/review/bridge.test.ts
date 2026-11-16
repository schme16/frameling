// A whole live review in one process: a real store and mirror on the sharer's side, the main-process bridges on both ends, the
// real share handshake over the in-memory network, and a picture window's copy (Replica) on each reviewer's end. What the
// reviewer ends up holding has to be the sharer's drawing, minus what a reviewer is not sent, and what the reviewer says has
// to come back safely.
import { promisify } from 'node:util';
import { deflate, inflate } from 'node:zlib';
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing } from '../../src/core/doc';
import type { Doc, PixelDrawing } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { Mirror } from '../../src/popout/mirror';
import { Replica } from '../../src/popout/replica';
import type { Look } from '../../src/popout/protocol';
import { parseCode } from '../../src/share/code';
import { ReviewGuestBridge } from '../../src/main/reviewGuest';
import { ReviewHostBridge, type HostUiEvent, type PortLike } from '../../src/main/reviewHost';
import { FakeNet, until } from '../share/helpers';

const squeeze = { deflate: async (b: Uint8Array) => new Uint8Array(await promisify(deflate)(b)), inflate: async (b: Uint8Array) => new Uint8Array(await promisify(inflate)(b)) };
const FAST = { handshakeMs: 4000, idleMs: 4000, knockMs: 3000 };
const THEME = { dark: true, bg: '#000', text: '#fff', muted: '#888', accent: '#a0f', raised: '#222' };

/** Two ends of a message port: what one posts the other hears a moment later, copied as a real port copies. */
function ports(): [PortLike, PortLike] {
  const make = () => {
    let fn: (m: unknown) => void = () => {};
    let peer: PortLike | null = null;
    const self: PortLike & { set(p: PortLike): void; hear(m: unknown): void } = {
      postMessage: (m) => void setImmediate(() => (peer as unknown as { hear(m: unknown): void }).hear(structuredClone(m))),
      onMessage: (f) => void (fn = f),
      close: () => {},
      set: (p) => void (peer = p),
      hear: (m) => fn(m),
    };
    return self;
  };
  const a = make();
  const b = make();
  a.set(b);
  b.set(a);
  return [a, b];
}

const lookOf = (s: ReturnType<ReturnType<typeof store>['get']>): Look => ({ name: 'Doc', frame: s.ui.frame, playing: s.ui.playing, activeLayerId: s.ui.activeLayerId, camera: false, marks: true, theme: THEME });

let net: FakeNet;
let doc: Doc;
let pixId: string;
let host: ReviewHostBridge;
let ui: HostUiEvent[];
let mirror: Mirror;
let code = '';

async function sharer() {
  const [drawing, bridgeEnd] = ports();
  mirror = new Mirror({ get: () => store().get(), lastChange: () => store().lastChange() }, (m) => drawing.postMessage(m), lookOf);
  store().subscribe(() => mirror.sync());
  drawing.onMessage((m) => (m as { t: string }).t === 'hello' && mirror.hello());
  host = new ReviewHostBridge({ makeSwarm: net.make(), port: bridgeEnd, ui: (e) => ui.push(e), sharerName: () => 'Doc', times: FAST, ...squeeze });
  host.start();
  await until(() => ui.some((e) => e.type === 'ready'));
  code = (ui.find((e) => e.type === 'ready') as { code: string }).code;
}

interface Reviewer {
  bridge: ReviewGuestBridge;
  replica: Replica;
  pageSaid: unknown[];
  say(m: unknown): void;
  statuses: string[];
  waiting: number;
  pointers: unknown[];
  acks: string[][];
}

function reviewer(name: string, gid: string): Reviewer {
  const parsed = parseCode(code);
  if (!parsed.ok) throw new Error('code');
  const [page, bridgeEnd] = ports();
  const r = { replica: new Replica(), pageSaid: [], statuses: [], waiting: 0, pointers: [], acks: [] } as unknown as Reviewer;
  page.onMessage((m) => {
    const msg = m as { t: string; state?: string; count?: number };
    if (msg.t === 'status') r.statuses.push(msg.state!);
    else if (msg.t === 'waiting') r.waiting = msg.count!;
    else if (msg.t === 'pointer') r.pointers.push(m);
    else if (msg.t === 'ack') r.acks.push((m as { ids: string[] }).ids);
    else if (msg.t === 'admitted' || msg.t === 'bye') r.pageSaid.push(m);
    else if (r.replica.apply(m as never)) page.postMessage({ t: 'hello' });
  });
  r.say = (m) => page.postMessage(m);
  r.bridge = new ReviewGuestBridge({ makeSwarm: net.make(), port: bridgeEnd, code: parsed.code, name, gid, times: FAST, findMs: 4000, retryMs: 3000, ...squeeze });
  r.bridge.start();
  return r;
}

async function letIn(i: number) {
  await until(() => ui.filter((e) => e.type === 'knock').length > i);
  host.admit((ui.filter((e) => e.type === 'knock')[i] as { conn: number }).conn);
}

beforeEach(() => {
  net = new FakeNet();
  ui = [];
  doc = newDoc({ width: 200, height: 150, length: 6, pixel: { pixelSize: 1 } });
  const d: PixelDrawing = { ...newPixelDrawing(200, 150) };
  doc.drawings[d.id] = d;
  pixId = d.id;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 6, drawingId: d.id });
  doc.notes = [{ id: 'mine', x: 1, y: 1, text: 'my private note to self' }];
  resetStore(doc);
});

const same = (a: Doc | null, b: Doc) => !!a && JSON.stringify(a.layers) === JSON.stringify(b.layers) && Buffer.compare(Buffer.from((a.drawings[pixId] as PixelDrawing).pixels), Buffer.from((b.drawings[pixId] as PixelDrawing).pixels)) === 0;
const paint = (n: number) =>
  store().update('stroke', (d) => {
    const px = (d.drawings[pixId] as PixelDrawing).pixels.slice();
    for (let i = 0; i < 30; i++) px[((n * 7 + (i >> 3)) * 200 + n * 3 + (i & 7)) * 4 + 3] = 255;
    (d.drawings[pixId] as PixelDrawing).pixels = px;
  });

describe('a live review, whole', () => {
  it('a reviewer sees the drawing as the sharer has it, never the sharer\'s own notes, and follows every stroke', async () => {
    await sharer();
    const r = reviewer('Sam', 'sam-1');
    await letIn(0);
    await until(() => r.statuses.includes('in') && !!r.replica.doc);
    expect(r.replica.doc!.notes).toBeUndefined();
    expect(same(r.replica.doc, store().get().doc)).toBe(true);
    for (let i = 1; i <= 5; i++) paint(i);
    await until(() => same(r.replica.doc, store().get().doc));
    // Pixel strokes went as rectangles, not whole pictures.
    expect(host.stats.patches).toBeGreaterThanOrEqual(5);
    expect(host.stats.bytes).toBeLessThan(40_000);
    expect((r.pageSaid[0] as { t: string; name: string }).name).toBe('Doc');
    r.bridge.leave();
    host.stop();
  });

  it('what a reviewer says arrives in the inbox events, is acknowledged, and is never an edit', async () => {
    await sharer();
    const r = reviewer('Sam', 'sam-2');
    await letIn(0);
    await until(() => r.statuses.includes('in') && !!r.replica.doc);
    const undoBefore = store().canUndo();
    const docBefore = store().get().doc;
    r.say({ t: 'note', id: 'n1', x: 10, y: 20, text: 'the elbow pops here ‮', frame: 2 });
    r.say({ t: 'mark', mark: { id: 'm1', kind: 'circle', pts: [5, 5, 40, 40] } });
    r.say({ t: 'point', n: 1, x: 33, y: 44 });
    // Everything a window could try to say that is not on the list is dropped on the floor.
    r.say({ t: 'patch', seq: 99, patches: [{ op: 'replace', path: ['name'], value: 'hacked' }] });
    r.say({ t: 'doc', doc: { name: 'hacked' } });
    await until(() => ui.filter((e) => e.type === 'item').length === 2 && ui.some((e) => e.type === 'pointer'));
    const item = ui.find((e) => e.type === 'item') as Extract<HostUiEvent, { type: 'item' }>;
    expect(item.name).toBe('Sam');
    expect((item.item as { text: string }).text).toBe('the elbow pops here');
    expect(ui.find((e) => e.type === 'pointer')).toMatchObject({ seat: 0, x: 33, y: 44 });
    // The inbox says it has them: the outbox empties.
    expect(r.waiting).toBeGreaterThanOrEqual(1);
    host.ack(0, ['n1', 'm1']);
    await until(() => r.waiting === 0 && r.bridge.outbox.waiting === 0);
    // And the drawing was never touched.
    expect(store().get().doc).toBe(docBefore);
    expect(store().canUndo()).toBe(undoBefore);
    r.bridge.leave();
    host.stop();
  });

  it('the sharer\'s pointer reaches the reviewer', async () => {
    await sharer();
    const r = reviewer('Sam', 'sam-3');
    await letIn(0);
    await until(() => r.statuses.includes('in'));
    host.pointer(12, 34);
    await until(() => r.pointers.length > 0);
    expect(r.pointers.at(-1)).toMatchObject({ t: 'pointer', x: 12, y: 34 });
    r.bridge.leave();
    host.stop();
  });

  it('four reviewers at once all hold the drawing, and a fifth is told it is full', async () => {
    await sharer();
    const rs: Reviewer[] = [];
    for (let i = 0; i < 4; i++) {
      rs.push(reviewer('R' + i, 'g' + i));
      await letIn(i);
      await until(() => rs[i].statuses.includes('in') && !!rs[i].replica.doc);
    }
    paint(2);
    paint(3);
    await until(() => rs.every((r) => same(r.replica.doc, store().get().doc)));
    const fifth = reviewer('Late', 'g5');
    await until(() => fifth.statuses.includes('full'));
    for (const r of rs) r.bridge.leave();
    host.stop();
  }, 120_000);

  it('a reviewer who joins late is caught up from the cache with no new request to the drawing window', async () => {
    await sharer();
    const a = reviewer('A', 'ga');
    await letIn(0);
    await until(() => !!a.replica.doc);
    paint(1);
    paint(2);
    await until(() => same(a.replica.doc, store().get().doc));
    const before = host.stats.catchUps;
    const b = reviewer('B', 'gb');
    await letIn(1);
    await until(() => same(b.replica.doc, store().get().doc));
    expect(host.stats.catchUps).toBeGreaterThan(before);
    a.bridge.leave();
    b.bridge.leave();
    host.stop();
  });

  it('a dropped link comes back as the same person, and what they wrote while away is sent again', async () => {
    await sharer();
    const r = reviewer('Sam', 'sam-9');
    await letIn(0);
    await until(() => r.statuses.includes('in') && !!r.replica.doc);
    const job = (host as unknown as { job: { host: { seats: { wire: { destroy(): void } }[] } } }).job;
    job.host.seats[0].wire.destroy();
    await until(() => r.statuses.includes('dropped'));
    r.say({ t: 'note', id: 'while-away', x: 1, y: 2, text: 'written offline' });
    await until(() => r.waiting === 1);
    const sw = net.swarms[net.swarms.length - 1];
    sw.join(Buffer.from(net.servers.keys().next().value!, 'hex'), { client: true, server: false });
    await until(() => ui.some((e) => e.type === 'item'));
    expect((ui.find((e) => e.type === 'item') as { item: { id: string } }).item.id).toBe('while-away');
    expect(ui.filter((e) => e.type === 'knock')).toHaveLength(1);
    r.bridge.leave();
    host.stop();
  }, 120_000);
});
