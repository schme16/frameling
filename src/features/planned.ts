// The optional features that still register themselves when their folder is imported, so they cannot be switched
// yet. Each one moves onto its own descriptor (and drops `legacy`) as it is converted; until then this keeps the list
// of what will be switchable in one place.
import { defineFeature, type FeatureDescriptor } from './feature';

const planned = (id: string, name: string, about: string): FeatureDescriptor => defineFeature({ id, name, about, optional: true, legacy: true });

export const PLANNED_FEATURES: FeatureDescriptor[] = [
  planned('tiles', 'Tiles', 'Tilemaps and tilesets for building game levels.'),
  planned('rig', 'Rig', 'Bones and skins to pose a character like a puppet.'),
];
