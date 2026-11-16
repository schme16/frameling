// The Transform tool as a before/after look: shapes, then pixels, each moved, stretched, squashed, slanted and turned.
// Run: npm run help:media -- --entries scripts/docs/ab --out <dir> (see brand/ab/transform-tool/note.md).
const { shapeSteps, pixelSteps, SHAPE_CROP, PIXEL_CROP } = require('../transform-story.cjs');

module.exports = [
  { name: 'shapes', prefs: { showTips: false }, steps: shapeSteps({ rec: '@', crop: SHAPE_CROP, every: 70 }) },
  { name: 'pixels', prefs: { showTips: false }, steps: pixelSteps({ rec: '@', crop: PIXEL_CROP, every: 70 }) },
];
