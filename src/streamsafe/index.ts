// Stream-safe mode: one switch that shows friendly stand-ins for file paths, your name and keys, so sharing your screen
// gives nothing away. The helper every screen goes through is src/core/streamSafe.ts; this registers the command and the help.
import './commands';
import './help';
import './obsCommands';
import { startObsLink } from './obs';
import './debug';

// Going live with OBS follows its preference from here on (nothing happens unless it was switched on).
startObsLink();
