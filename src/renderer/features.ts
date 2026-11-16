// Every area registers its commands, panels, tools and help topics when imported. Order matters only for
// default toolbar and panel order, which the registries sort anyway. Features that can be turned off are not imported
// for their side effects: each one hands over a descriptor (src/features) and the host registers it, tagged, below.
import '../core/commands';
import '../history';
import '../brushes';
import '../trim';
import '../convert';
import '../ui';
import '../canvas';
import '../tools';
import '../tablet';
import '../gpu';
import '../geometry';
import '../timeline';
import '../symbols';
import '../artboards';
import '../io';
import '../aseprite';
import '../streamsafe';
import '../import';
import '../export';
import '../timelapse';
import '../effects';
import '../quests';
import '../popout';
import '../livereview';
import '../plugins';
import '../scripts';
import '../templates/app';
import { installBeta } from '../beta';
import { installUpdates } from '../update';
import { installAudience, syncGateCommands } from '../audience';
import { installStreamboard, syncBoardCommands } from '../streamboard';
import { registerFeatures } from '../features/host';
import '../features/streamCommands';
import { startRememberingUi } from '../tools/rememberUi';
import { startBrushPresets } from '../brushes';

// Beta reports: a panel and a command. Nothing is sent without the person pressing Send.
installBeta();
// New versions: a quiet check of this project's releases, an offer, and a command. Nothing is downloaded until you press Update now.
installUpdates();
// Audience features: the gate, the switch (off after install), the audience pill's commands and help.
installAudience();
// Stream control: a window of buttons for a second screen, on the commands above.
installStreamboard();
import '../features/sync';
import { audioFeature } from '../audio';
import { cameraFeature } from '../camera';
import { godotFeature } from '../export/godot';
import { flowFeature } from '../flow';
import { quillPetFeature } from '../quillpet';
import { interactivesFeature } from '../interactives';
import { particlesFeature } from '../particles';
import { rigFeature } from '../rig';
import { tilesFeature } from '../tiles';
import { textFeature } from '../text';
import { lipsyncFeature } from '../lipsync';
import { streamDoorFeature } from '../streamdoor';
import { streamOverlayFeature } from '../streamoverlay';
import { quillReactsFeature } from '../quillreacts';
import { daresFeature } from '../dares';
import { promptJarFeature } from '../promptjar';
import { votesFeature } from '../votes';
import { guessFeature } from '../guess';
import { penModsFeature } from '../penmods';
import { twitchFeature } from '../twitch';

registerFeatures([audioFeature, cameraFeature, flowFeature, godotFeature, interactivesFeature, lipsyncFeature, particlesFeature, quillPetFeature, rigFeature, textFeature, tilesFeature, streamDoorFeature, quillReactsFeature, daresFeature, promptJarFeature, votesFeature, penModsFeature, streamOverlayFeature, guessFeature, twitchFeature]);
// The gate's own commands follow the streaming features: out of the lists when they are all tucked away.
syncGateCommands();
syncBoardCommands();

// Brush, colours, loop playback and onion skin: put back as they were, and saved from here on.
startRememberingUi();

// Saved brushes: one palette command each, and the "save every change" choice.
startBrushPresets();
