import { defineFeature } from '../../src/features/feature';

/** Stands in for the Audio feature (still on the old import path) so Lip sync's requirement is met in a test. */
export const audioFeatureStub = defineFeature({ id: 'audio', name: 'Audio', about: 'Sound.', optional: true, legacy: true });
