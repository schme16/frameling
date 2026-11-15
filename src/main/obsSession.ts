// The desktop side of going live with OBS: one connection to OBS's WebSocket server (obs-websocket 5.x, built into OBS
// 28 and newer), watching only the streaming and recording switches. It reads nothing else from OBS and sends nothing
// but the password. No electron import here, and the client is passed in, so tests run it against a fake.
import { classifyFailure, outputActive, parseObsAddress, type ObsFailure } from '../streamsafe/obsLogic';

/** The small part of obs-websocket-js this uses. */
export interface ObsClientLike {
  connect(url: string, password?: string, opts?: { eventSubscriptions?: number }): Promise<unknown>;
  disconnect(): Promise<void>;
  call(request: 'GetStreamStatus' | 'GetRecordStatus'): Promise<{ outputActive?: boolean }>;
  on(event: string, handler: (data: any) => void): unknown;
}

/** What goes up to the page. */
export type ObsMessage = { type: 'output'; kind: 'stream' | 'record'; active: boolean } | { type: 'closed' };

export type ObsConnectResult = { ok: true; streaming: boolean; recording: boolean } | { ok: false; why: ObsFailure };

/** The Outputs group of OBS's events (streaming, recording, replay buffer...), the only ones asked for. */
export const OUTPUT_EVENTS = 1 << 6;

export interface ObsSessionDeps {
  make: () => ObsClientLike;
  emit: (m: ObsMessage) => void;
  /** Longer than this with no answer counts as OBS not being there. */
  timeoutMs?: number;
}

export class ObsSession {
  private client: ObsClientLike | null = null;
  private password = '';
  private run = 0;

  constructor(private deps: ObsSessionDeps) {}

  /** The password for the next connection. Empty means OBS has none. Kept in memory only. */
  setPassword(password: string): void {
    this.password = password;
  }

  get connected(): boolean {
    return this.client !== null;
  }

  async connect(address: string): Promise<ObsConnectResult> {
    const a = parseObsAddress(address);
    if (!a.ok) return { ok: false, why: 'address' };
    await this.disconnect();
    const mine = ++this.run;
    let client: ObsClientLike;
    try {
      client = this.deps.make();
    } catch {
      return { ok: false, why: 'unreachable' };
    }
    const alive = () => this.run === mine && this.client === client;
    client.on('ConnectionClosed', () => {
      if (!alive()) return;
      this.client = null;
      this.deps.emit({ type: 'closed' });
    });
    client.on('StreamStateChanged', (d: { outputActive?: boolean; outputState?: string }) => {
      if (alive()) this.send('stream', d);
    });
    client.on('RecordStateChanged', (d: { outputActive?: boolean; outputState?: string }) => {
      if (alive()) this.send('record', d);
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      this.client = client;
      await Promise.race([
        client.connect(a.url, this.password || undefined, { eventSubscriptions: OUTPUT_EVENTS }),
        new Promise((_, no) => {
          timer = setTimeout(() => no({ code: 'ETIMEDOUT', message: 'No answer from OBS.' }), this.deps.timeoutMs ?? 4000);
        }),
      ]);
      clearTimeout(timer);
      const [s, r] = await Promise.all([client.call('GetStreamStatus'), client.call('GetRecordStatus')]);
      if (this.run !== mine) return { ok: false, why: 'unreachable' };
      return { ok: true, streaming: !!s.outputActive, recording: !!r.outputActive };
    } catch (e) {
      clearTimeout(timer);
      if (this.client === client) this.client = null;
      void client.disconnect().catch(() => undefined);
      return { ok: false, why: classifyFailure(e) };
    }
  }

  async disconnect(): Promise<void> {
    this.run++;
    const c = this.client;
    this.client = null;
    if (c) await c.disconnect().catch(() => undefined);
  }

  private send(kind: 'stream' | 'record', d: { outputActive?: boolean; outputState?: string }): void {
    const active = d.outputState ? outputActive(d.outputState) : d.outputActive;
    // Stopping, and anything this does not know, change nothing: it is still on until OBS says Stopped.
    if (active === undefined) return;
    this.deps.emit({ type: 'output', kind, active });
  }
}
