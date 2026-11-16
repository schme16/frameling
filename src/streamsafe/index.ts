// Stream-safe mode: one switch that shows friendly stand-ins for file paths, your name and keys, so sharing your screen
// gives nothing away. The helper every screen goes through is src/core/streamSafe.ts; this registers the command and the help.
import './commands';
import './help';
import './obsCommands';
import { startObsLink } from './obs';
import './debug';
import { registerQuietFamily } from '../ui/palette';
import { STREAM_WORDS } from '../ui/streamWords';

// Going live with OBS follows its preference from here on (nothing happens unless it was switched on).
startObsLink();

// The OBS commands are for streamers: they step back for ordinary words ("settings", "test"), and come forward for "obs", "stream" and "go live".
registerQuietFamily({ has: (c) => c.id.startsWith('stream.obs'), words: STREAM_WORDS, quiet: () => true });
