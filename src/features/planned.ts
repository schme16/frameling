// The optional features that still register themselves when their folder is imported, so they cannot be switched
// yet. Each one moves onto its own descriptor (and drops `legacy`) as it is converted; until then this keeps the list
// of what will be switchable in one place.
import { defineFeature, type FeatureDescriptor } from './feature';

const planned = (id: string, name: string, about: string): FeatureDescriptor => defineFeature({ id, name, about, optional: true, legacy: true });

export const PLANNED_FEATURES: FeatureDescriptor[] = [
  planned('particles', 'Particles', 'Sparks, snow, smoke and confetti that move on their own.'),
  planned('text', 'Text', 'Words on your drawing that stay editable and can be animated.'),
  planned('tiles', 'Tiles', 'Tilemaps and tilesets for building game levels.'),
  planned('camera', 'Camera', 'A camera you can move, zoom and shake over the scene, for parallax and cut-scenes.'),
  planned('godot-export', 'Godot exports', 'Send your animation to the Godot game engine: an add-on, sprite frames and scenes.'),
  planned('rig', 'Rig', 'Bones and skins to pose a character like a puppet.'),
];
