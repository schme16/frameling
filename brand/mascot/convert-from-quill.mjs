// ONE-TIME conversion, kept for the record. Turned the old generator's output (brand/quill/b/quill.png + quill.json and
// brand/quill/icons/icon32.png + icon16.png) into the Frameling documents that are now the mascot's source:
//   brand/mascot/mascot.frameling       48 x 48, one pixel layer, one clip per animation, 100 fps (1 frame = 10 ms)
//   brand/mascot/mascot-icon.frameling  32 x 32, the big icon on frame 0 and the 16 px one on frame 1
// Running it again throws away any edits made to those files in Frameling, so it refuses unless given --force.
import fs from 'node:fs';
import path from 'node:path';
import {loadMascotLib, ROOT} from '../../scripts/mascot/load.mjs';
import {PALETTE} from '../quill/quill-frames.mjs';

const OUT = path.join(ROOT, 'brand/mascot');
const SHEET = path.join(OUT, 'mascot.frameling'), ICON = path.join(OUT, 'mascot-icon.frameling');
if (!process.argv.includes('--force') && (fs.existsSync(SHEET) || fs.existsSync(ICON))) {
	console.error('brand/mascot already has the mascot files. Edit those in Frameling instead (or pass --force to overwrite them).');
	process.exit(1);
}

const lib = await loadMascotLib();
const png = f => lib.decodePng(fs.readFileSync(path.join(ROOT, f)));

//the palette as named swatches, so they're right there in Frameling's swatch panel
const NAMES = {k: 'Ink', w: 'Paper', y: 'Sunny', Y: 'Sunny deep', p: 'Peach', P: 'Peach shade', r: 'Rose', R: 'Rose shade', g: 'Grape', G: 'Grape shade', s: 'Sky', S: 'Sky shade', m: 'Mint', M: 'Mint shade'};
const swatches = Object.entries(PALETTE).map(([k, color]) => ({id: 'sw-' + (k === k.toUpperCase() ? k.toLowerCase() + '2' : k), name: NAMES[k] || k, color}));

const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'brand/quill/b/quill.json'), 'utf8'));
const doc = lib.sheetToDoc(png('brand/quill/b/quill.png'), meta, swatches, 'Mascot');
const icons = lib.iconsToDoc(png('brand/quill/icons/icon32.png'), png('brand/quill/icons/icon16.png'), swatches);

const when = new Date('2026-11-11T00:00:00Z');
fs.writeFileSync(SHEET, lib.saveFile(doc, 'convert-from-quill', when));
fs.writeFileSync(ICON, lib.saveFile(icons, 'convert-from-quill', when));
console.log(`wrote ${path.relative(ROOT, SHEET)} (${Object.keys(doc.drawings).length} drawings, ${doc.clips.length} clips, ${doc.length} frames) and ${path.relative(ROOT, ICON)}`);
