// The Transform tool's help clip: two shapes moved, stretched, squashed, slanted and turned, then Enter and one undo to
// show it was one step. The steps (and the pixel version of them) are in scripts/docs/transform-story.cjs.
const { shapeSteps, SHAPE_CROP } = require('../transform-story.cjs');

module.exports = [
  {
    name: 'transform',
    prefs: { showTips: false },
    steps: shapeSteps({ rec: '@', crop: SHAPE_CROP, every: 70 }),
  },
];
