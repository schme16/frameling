// The remote door: a way for another program on this computer to drive Frameling, for testing and automation. Off every
// time Frameling starts and until the person switches it on; while it is off nothing listens (the server is in the desktop
// side, src/main/remoteDoor.ts, and does not exist until it is asked to open). It reaches what the Scripts panel reaches
// (commands, choices, scripts, a summary of the drawing) and nothing else. It is not an audience door: a remote caller is
// not a viewer, goes through none of the gate's allowances, and is closed by Stop everything. See docs/remote-door.md.
import './help';
import { registerCommands } from '../core/registry';
import { remoteDoorCommands } from './commands';

registerCommands(remoteDoorCommands);

export { RemoteBadge } from './RemoteBadge';
export { RemoteDoorPrefsRow } from './PrefsRow';
