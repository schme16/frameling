// Strokes from each kind of pixel brush the second slice adds, side by side, top to bottom: dynamics, grain, dual tip, colour.
const { picture } = require('./_rows.cjs');
module.exports = [picture('kinds', ['plain', 'pressure', 'taper', 'speed', 'chalk', 'spatter', 'bristles', 'rainbow', 'wet'], 200)];
