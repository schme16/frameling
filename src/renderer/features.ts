// Every area registers its commands, panels, tools and help topics when imported. Order matters only for
// default toolbar and panel order, which the registries sort anyway. Features that can be turned off are not imported
// for their side effects: each one hands over a descriptor (src/features) and the host registers it, tagged, below.
import '../core/commands';
import '../ui';
import '../canvas';
import '../tools';
import '../geometry';
import '../timeline';
import '../symbols';
import '../artboards';
import '../rig';
import '../io';
import '../aseprite';
import '../platform/help';
import '../export';
import '../tiles';
import '../effects';
import '../quests';
import '../plugins';
import '../templates/app';
import { PLANNED_FEATURES } from '../features/planned';
import { registerFeatures } from '../features/host';
import '../features/sync';
import { audioFeature } from '../audio';
import { cameraFeature } from '../camera';
import { godotFeature } from '../export/godot';
import { flowFeature } from '../flow';
import { interactivesFeature } from '../interactives';
import { particlesFeature } from '../particles';
import { textFeature } from '../text';
import { lipsyncFeature } from '../lipsync';

registerFeatures([...PLANNED_FEATURES, audioFeature, cameraFeature, flowFeature, godotFeature, interactivesFeature, lipsyncFeature, particlesFeature, textFeature]);
