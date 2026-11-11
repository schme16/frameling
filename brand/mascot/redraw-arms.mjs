// Redraws Quill's arms in brand/mascot/mascot.frameling with the chunky ones in arms.mjs. Every drawing that is one of
// the old generator's poses with an arm gets recomposed with the new arm, in place (same drawing, same timing), so
// clips and holds don't move. Drawings that don't match an old pose (edited by hand in Frameling) are left alone.
//   node brand/mascot/redraw-arms.mjs            redraw them
//   node brand/mascot/redraw-arms.mjs --preview  only write brand/ab/quill-arms/before-after.png
// The sad clips use the arms too: node brand/mascot/add-sad.mjs --force after this. Then npm run build:mascot.
import fs from 'node:fs';
import path from 'node:path';
import {loadMascotLib, ROOT} from '../../scripts/mascot/load.mjs';
import {B, ANIMS} from '../quill/quill-frames.mjs';
import {compose, contactSheet, toImage, withParts} from './compose.mjs';
import {ARMS} from './arms.mjs';

const lib = await loadMascotLib();
const before = B, after = withParts({arm: ARMS});
const armed = Object.keys(B.poses).filter(n => B.poses[n].arm);
const img = (def, n) => toImage(compose(def, B.poses[n]));

//before and after, one pair of rows per animation that has an arm in it
{
	const rows = [];
	for (const [name, a] of Object.entries(ANIMS)) {
		if (!a.frames.some(([p]) => B.poses[p].arm)) continue;
		const seen = [...new Set(a.frames.map(([p]) => p))];
		rows.push(seen.map(p => img(before, p)), seen.map(p => img(after, p)));
	}
	const dir = path.join(ROOT, 'brand/ab/quill-arms');
	fs.mkdirSync(dir, {recursive: true});
	fs.writeFileSync(path.join(dir, 'before-after.png'), lib.encodePng(contactSheet(lib, rows)));
	console.log('wrote brand/ab/quill-arms/before-after.png (each animation: old arm on top, new arm below)');
}
if (process.argv.includes('--preview')) process.exit(0);

const FILE = path.join(ROOT, 'brand/mascot/mascot.frameling');
const {doc, warnings} = lib.loadFile(new Uint8Array(fs.readFileSync(FILE)));
for (const w of warnings) console.warn(w);
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
let n = 0;
for (const pose of armed) {
	const old = img(before, pose).pixels;
	const d = Object.values(doc.drawings).find(d => d.kind === 'pixel' && same(d.pixels, old));
	if (!d) { console.warn(`no drawing matches the old ${pose}, left it alone`); continue; }
	d.pixels = img(after, pose).pixels;
	n++;
}
fs.writeFileSync(FILE, lib.saveFile(doc, 'redraw-arms', new Date('2026-11-11T00:00:00Z')));
console.log(`redrew the arm in ${n} of ${armed.length} poses. Now node brand/mascot/add-sad.mjs --force, then npm run build:mascot.`);
