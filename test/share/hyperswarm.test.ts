// The same share, over the real Hyperswarm and the real encrypted connection, on a small test network on this machine
// (hyperdht's own testnet: a few DHT nodes on 127.0.0.1). It proves the pieces this feature leans on: that a connection
// carries a handshake hash for the binding, that two peers find each other by the topic, that a wrong code leaks nothing
// over a real stream, and that a lone swarm with nobody to find says so. The public network is not used here.
import { describe, expect, it } from 'vitest';
import { parseCode } from '../../src/share/code';
import { startReceive, startSend } from '../../src/share/swarm';
import { hyperswarmMaker } from '../../src/main/share';
import type { ReceiveEvent, SendEvent } from '../../src/share/types';
import { until } from './helpers';

const drawing = () => new Uint8Array(Array.from({ length: 150_000 }, (_, i) => (i * 7) & 0xff));

describe('over the real Hyperswarm, on a local test network', () => {
  it('sends a drawing with a code, a wrong code gets nothing, and a missing sender is reported', async () => {
    const { default: createTestnet } = await import('hyperdht/testnet');
    const testnet = await createTestnet(4);
    try {
      const make = hyperswarmMaker({ bootstrap: testnet.bootstrap });
      const sent: SendEvent[] = [];
      const send = startSend({ bytes: drawing(), makeSwarm: make, emit: (e) => sent.push(e), maxWrong: 3 });
      await until(() => sent.some((e) => e.type === 'ready'), 20_000);
      const code = (sent.find((e) => e.type === 'ready') as Extract<SendEvent, { type: 'ready' }>).code;

      // A wrong secret over a real connection: refused, counted, nothing sent.
      const words = code.split('-');
      const wrong = [...words.slice(0, 2), ...(words[2] === 'wolf' ? ['young', 'wood'] : ['wolf', 'young'])].join('-');
      const bad: ReceiveEvent[] = [];
      const badParsed = parseCode(wrong);
      if (!badParsed.ok) throw new Error('test code');
      const badJob = startReceive({ code: badParsed.code, makeSwarm: make, emit: (e) => bad.push(e), findMs: 20_000 });
      await until(() => bad.some((e) => e.type === 'wrong' || e.type === 'refused'), 20_000);
      expect(bad.some((e) => e.type === 'received')).toBe(false);
      expect(sent.some((e) => e.type === 'wrong')).toBe(true);
      badJob.cancel();

      // The right code, over the same network.
      const got: ReceiveEvent[] = [];
      const parsed = parseCode(code);
      if (!parsed.ok) throw new Error('test code');
      startReceive({ code: parsed.code, makeSwarm: make, emit: (e) => got.push(e) });
      await until(() => got.some((e) => e.type === 'received'), 20_000);
      const done = got.find((e) => e.type === 'received') as Extract<ReceiveEvent, { type: 'received' }>;
      expect(Buffer.from(done.bytes).equals(Buffer.from(drawing()))).toBe(true);
      await until(() => sent.some((e) => e.type === 'sent'), 10_000);
      send.cancel();

      // Nobody is announcing this code: the receiver reports that nobody answered, rather than waiting for ever.
      const lone: ReceiveEvent[] = [];
      startReceive({ code: parsed.code, makeSwarm: make, emit: (e) => lone.push(e), findMs: 3000 });
      await until(() => lone.some((e) => e.type === 'noOne' || e.type === 'offline'), 15_000);
      expect(lone.some((e) => e.type === 'received')).toBe(false);
    } finally {
      await testnet.destroy();
    }
  }, 90_000);
});
