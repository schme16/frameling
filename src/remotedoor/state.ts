// What the page knows about the remote door. Whether it is on is NOT remembered: every start of Frameling begins with it
// off. Only the port the person prefers is kept.
import { createStore, readJson, writeJson } from '../ui/mini';
import { closedRemote, REMOTE_DEFAULT_PORT, validRemotePort, type RemoteStatus } from '../shared/remoteDoor';

const KEY = 'frameling.remotedoor.v1';

export const remoteStatus = createStore<RemoteStatus>(closedRemote());
/** When the door last did something for a caller (ms since 1970), or 0. The pill glows for a moment after. */
export const lastDriven = createStore<number>(0);

export function preferredRemotePort(): number {
  const p = readJson<{ port: number }>(KEY, { port: REMOTE_DEFAULT_PORT }).port;
  return validRemotePort(p) ? p : REMOTE_DEFAULT_PORT;
}

export function setPreferredRemotePort(port: number): boolean {
  if (!validRemotePort(port)) return false;
  writeJson(KEY, { port });
  remoteStatus.set((s) => (s.running ? s : { ...s, port }));
  return true;
}
