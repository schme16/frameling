// What the settings screen shows about the door, and the port the person prefers. Never the key: it is asked for only
// at the moment someone reveals or copies it.
import { createStore, readJson, writeJson } from '../ui/mini';
import { closedStatus, DEFAULT_DOOR_PORT, validDoorPort, type DoorStatus } from '../shared/streamDoor';

const KEY = 'frameling.streamdoor.v1';

export const doorStatus = createStore<DoorStatus>(closedStatus());

export function preferredPort(): number {
  const p = readJson<{ port: number }>(KEY, { port: DEFAULT_DOOR_PORT }).port;
  return validDoorPort(p) ? p : DEFAULT_DOOR_PORT;
}

export function setPreferredPort(port: number): boolean {
  if (!validDoorPort(port)) return false;
  writeJson(KEY, { port });
  doorStatus.set((s) => (s.running ? s : { ...s, port }));
  return true;
}
