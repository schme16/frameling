// Layers attached to a bone: the drawing is moved or bent by the bone's pose. Registered for good when the rig folder
// loads, so a puppet still moves, exports and saves whether or not the Rig feature is switched on (that only hides the
// panel, tools and commands).
import { registerLayerBinder } from '../core/layerKinds';
import { boundDrawing } from './pose';

registerLayerBinder(boundDrawing);
