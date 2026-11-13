// Every area registers its commands, panels, tools and help topics when imported. Order matters only for
// default toolbar and panel order, which the registries sort anyway. Features that can be turned off are not imported
// for their side effects: each one hands over a descriptor (src/features) and the host registers it, tagged, below.
import '../core/commands';
import '../ui';
import '../canvas';
import '../tools';
import '../tablet';
import '../geometry';
import '../timeline';
import '../symbols';
import '../artboards';
import '../io';
import '../aseprite';
import '../export';
import '../effects';
import '../quests';
import '../plugins';
import '../templates/app';
import { installBeta } from '../beta';
import { registerFeatures } from '../features/host';

// Beta reports: a panel and a command. Nothing is sent without the person pressing Send.
installBeta();
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
