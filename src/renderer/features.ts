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
import '../camera';
import '../artboards';
import '../flow';
import '../rig';
import '../audio';
import '../io';
import '../platform/help';
import '../export';
import '../tiles';
import '../effects';
import '../particles';
import '../text';
import '../quests';
import '../plugins';
import '../templates/app';
import '../interactives';
import { PLANNED_FEATURES } from '../features/planned';
import { registerFeatures } from '../features/host';
import '../features/sync';
import { lipsyncFeature } from '../lipsync';

registerFeatures([...PLANNED_FEATURES, lipsyncFeature]);
