// Every area registers its commands, panels, tools and help topics when imported. Order matters only for
// default toolbar and panel order, which the registries sort anyway. Features that can be turned off are not imported
// for their side effects: each one hands over a descriptor (src/features) and the host registers it, tagged, below.
import '../core/commands';
import '../history';
import '../brushes';
import '../trim';
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
import '../import';
import '../export';
import '../effects';
import '../quests';
import '../popout';
import '../plugins';
import '../templates/app';
import { installBeta } from '../beta';
import { installUpdates } from '../update';
import { registerFeatures } from '../features/host';
import { startRememberingUi } from '../tools/rememberUi';
import { startBrushPresets } from '../brushes';

// Beta reports: a panel and a command. Nothing is sent without the person pressing Send.
installBeta();
// New versions: a quiet check of this project's releases, an offer, and a command. Nothing is downloaded until you press Update now.
installUpdates();
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

registerFeatures([audioFeature, cameraFeature, flowFeature, godotFeature, interactivesFeature, lipsyncFeature, particlesFeature, quillPetFeature, rigFeature, textFeature, tilesFeature]);

// Brush, colours, loop playback and onion skin: put back as they were, and saved from here on.
startRememberingUi();

// Saved brushes: one palette command each, and the "save every change" choice.
startBrushPresets();
