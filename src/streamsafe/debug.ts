// With ?debug in the page address, a pretend OBS for pictures and harnesses: `__framelingObs.fake()` stands one in for
// the desktop side (`fake({ up: false })` is OBS not running, `fake({ wrongPassword: true })` is one that asks for a password), `.go('stream', true)` starts it streaming, `.go('record', false)` stops a recording, `.quit()` closes it.
// Never on in normal use.
import type { ObsBridge } from '../preload/api';
import { obs } from './obs';

type Handler = Parameters<ObsBridge['onEvent']>[0];

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  let handler: Handler | null = null;
  let up = true;
  let password = false;
  let why: 'unreachable' | 'password' = 'unreachable';
  const bridge: ObsBridge = {
    status: async () => ({ canSave: true, hasPassword: password }),
    setPassword: async (pw) => {
      password = !!pw;
      return { hasPassword: password, saved: !!pw };
    },
    connect: async () => (up ? { ok: true, streaming: false, recording: false } : { ok: false, why }),
    disconnect: async () => undefined,
    onEvent: (h) => {
      handler = h;
      return () => void (handler = null);
    },
  };
  (window as unknown as { __framelingObs: unknown }).__framelingObs = {
    fake: (opts: { up?: boolean; password?: boolean; wrongPassword?: boolean } = {}) => {
      up = opts.up !== false && !opts.wrongPassword;
      why = opts.wrongPassword ? 'password' : 'unreachable';
      password = !!opts.password;
      obs.useBridge(bridge);
    },
    go: (kind: 'stream' | 'record', active: boolean) => handler?.({ type: 'output', kind, active }),
    quit: () => handler?.({ type: 'closed' }),
    state: () => obs.state,
  };
}
