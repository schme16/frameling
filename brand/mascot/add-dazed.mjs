// Adds Quill's `dazed` clip to brand/mascot/mascot.frameling: swirly eyes, hair on end, a plaster on his head and
// little stars going round it. Drawn from the part grids in brand/quill/quill-frames.mjs plus the new parts below.
// Appends after the last clip and leaves every existing clip alone. Run again with --force to redraw just this one.
//   node brand/mascot/add-dazed.mjs            add it (refuses if it's already there)
//   node brand/mascot/add-dazed.mjs --force    replace it
//   node brand/mascot/add-dazed.mjs --preview  only write the 6x contact sheet to brand/ab/quill-crash/
// Then npm run build:mascot.
import fs from 'node:fs';
import path from 'node:path';
import {loadMascotLib, ROOT} from '../../scripts/mascot/load.mjs';
import {compose, contactSheet, g, toImage, withParts} from './compose.mjs';
const NEW = ['dazed'];

//new parts, in B's idle coordinates like the rest
const PARTS = {
	eyes: {
		//two spirals, a quarter turn apart, so the eyes seem to spin
		swirlA: [23, 21, g(`
			kkkkk....kkkkk
			kwwwk....kwwwk
			kwkwk....kwkwk
			kwkkk....kwkkk
			kwwwk....kwwwk
			.kkk......kkk.
		`)],
		swirlB: [23, 21, g(`
			.kkk......kkk.
			kwwwk....kwwwk
			kkkwk....kkkwk
			kwkwk....kwkwk
			kwwwk....kwwwk
			kkkkk....kkkkk
		`)],
	},
	mouth: {
		//a loose, lopsided wobble
		woozy: [27, 28, g(`
			k.kk.k
			.k..k.
		`)],
	},
	fx: {
		//a plaster across the forehead, a little crooked
		plaster: [30, 16, g(`
			..kkkkkkkk
			.kwwwYYwwk
			.kwwYYYYwk
			kwwwwYYwwk
			kkkkkkkk..
		`)],
		//stars going round his head, in two spots each
		starsA: [41, 6, g(`
			.y.....
			yyy....
			.y...y.
			....yyy
			.....y.
		`)],
		starsB: [41, 8, g(`
			.....y.
			....yyy
			.y...y.
			yYy....
			.y.....
		`)],
	},
};

//quills spread out (hair on end), ears flat, head wobbling about a bit
const stun = {quills: 'spread', ear: 'flat', feet: 'stand', mouth: 'woozy'};
const POSES = {
	dz0: {...stun, eyes: 'swirlA', fx: ['plaster', 'starsA'], up: [-1, 0]},
	dz1: {...stun, eyes: 'swirlB', fx: ['plaster', 'starsB'], up: [0, 1]},
	dz2: {...stun, eyes: 'swirlA', fx: ['plaster', 'starsB'], up: [1, 0]},
	dz3: {...stun, eyes: 'swirlB', fx: ['plaster', 'starsA'], up: [0, 1]},
};

//[pose, ms], like the old ANIMS. The first frame is the still one (reduced motion shows only that)
const ANIMS = {
	dazed: {loop: true, frames: [['dz0', 260], ['dz1', 260], ['dz2', 260], ['dz3', 260]]},
};

/* -------------------------------------------- go ------ */

const def = withParts(PARTS);
const lib = await loadMascotLib();
const faceFx = ['plaster'];
const images = Object.fromEntries(Object.keys(POSES).map(n => [n, toImage(compose(def, POSES[n], {faceFx}))]));

//contact sheet at 6x on dark and light, for checking by eye
{
	const sheet = contactSheet(lib, Object.values(ANIMS).map(a => a.frames.map(([p]) => images[p])));
	const dir = path.join(ROOT, 'brand/ab/quill-crash');
	fs.mkdirSync(dir, {recursive: true});
	fs.writeFileSync(path.join(dir, 'contact-6x.png'), lib.encodePng(sheet));
	console.log('wrote brand/ab/quill-crash/contact-6x.png');
}
if (process.argv.includes('--preview')) process.exit(0);

const FILE = path.join(ROOT, 'brand/mascot/mascot.frameling');
const {doc, warnings} = lib.loadFile(new Uint8Array(fs.readFileSync(FILE)));
for (const w of warnings) console.warn(w);
const layer = doc.layers.find(l => l.id === 'layer-mascot');
if (!layer) throw new Error('mascot.frameling has no "Mascot" layer');

const already = doc.clips.filter(c => NEW.includes(c.name));
if (already.length) {
	if (!process.argv.includes('--force')) {
		console.error(`mascot.frameling already has ${already.map(c => c.name).join(' and ')}. Pass --force to redraw it.`);
		process.exit(1);
	}
	//it was appended last, so everything from it on goes
	const from = Math.min(...already.map(c => c.start));
	if (doc.clips.some(c => !NEW.includes(c.name) && c.end >= from)) throw new Error('another clip comes after the dazed one, redraw it by hand in Frameling');
	doc.clips = doc.clips.filter(c => !NEW.includes(c.name));
	layer.cels = layer.cels.filter(c => c.start < from);
	for (const id of Object.keys(doc.drawings)) if (id.startsWith('dazed-')) delete doc.drawings[id];
	doc.length = from;
}

const FPS = doc.fps;
let at = doc.length, celN = 0;
for (const [name, a] of Object.entries(ANIMS)) {
	const start = at;
	for (const [pose, ms] of a.frames) {
		const did = 'dazed-' + pose;
		if (!doc.drawings[did]) {
			const img = images[pose];
			doc.drawings[did] = {id: did, kind: 'pixel', width: img.width, height: img.height, pixels: img.pixels};
		}
		const length = Math.max(1, Math.round(ms * FPS / 1000));
		layer.cels.push({id: `cel-dazed-${++celN}`, start: at, length, drawingId: did});
		at += length;
	}
	doc.clips.push({id: 'clip-' + name, name, start, end: at - 1, loop: a.loop});
}
doc.length = at;
fs.writeFileSync(FILE, lib.saveFile(doc, 'add-dazed', new Date('2026-11-14T00:00:00Z')));
console.log(`added ${NEW.join(', ')} to brand/mascot/mascot.frameling (${doc.clips.length} clips, ${doc.length} frames). Now npm run build:mascot.`);
