// A ball shaded with each vector dry brush, for judging the look as a drawing and not as test marks. ONLY=a,b limits the brushes.
const { ball, INK } = require('./_draw.cjs');
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
module.exports = Object.keys(INK)
  .filter((id) => !only || only.includes(id))
  .map((id) => ({ name: `ball-${id}`, prefs: { firstDrawn: true, showTips: false }, width: 800, steps: [...ball(id, { size: process.env.SIZE ? Number(process.env.SIZE) : undefined }), { shot: '@', el: '.cv-root', pad: 0 }] }));
