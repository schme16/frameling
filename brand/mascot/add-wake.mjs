// Adds Quill's `wake` clip to brand/mascot/mascot.frameling: the few frames between being asleep and being up. A little
// stir, one eye cracking open, a big yawning stretch, a settle, a blink. Every part is one that already exists (the
// sleeping eyes, the half-open eyes, the paws-up arm, the spread quills); only the poses are new, so it is a reuse of
// his drawn pieces in a new order, not new drawing. Draw over any frame in Frameling when you want it your way.
// Appends after the last clip and leaves every existing clip alone. Run again with --force to redraw just this one.
//   node brand/mascot/add-wake.mjs            add it (refuses if it's already there)
//   node brand/mascot/add-wake.mjs --force    replace it
//   node brand/mascot/add-wake.mjs --preview  only write the 6x contact sheet to brand/ab/quill-wake/
// Then npm run build:mascot.
import fs from 'node:fs';
import path from 'node:path';
import {loadMascotLib, ROOT} from '../../scripts/mascot/load.mjs';
import {compose, contactSheet, toImage, withParts} from './compose.mjs';
const NEW = ['wake'];

//the sleeping pose without its Zs: curled up, quills drooping, no feet showing
const nap = {up: [0, 3], dy: 1, eyes: 'sleep', mouth: 'flat', quills: 'droop', feet: 'none'};
const POSES = {
	//the Zs are gone and his head gives a small twitch
	wk0: {...nap, up: [1, 3]},
	//a heavy-lidded peek, still curled
	wk1: {...nap, up: [0, 3], eyes: 'half'},
	//pushing himself up, quills coming back, still bleary
	wk1b: {dy: 0, up: [0, 2], eyes: 'half', mouth: 'flat', quills: 'rest', feet: 'stand'},
	//eyes screwed shut, starting a yawn
	wk2: {dy: 0, up: [0, 1], eyes: 'shut', mouth: 'o', quills: 'rest', feet: 'stand', arm: 'up'},
	//the big stretch: up on his toes, paws high, quills fanned out
	wk3: {dy: -1, up: [0, -1], eyes: 'shut', mouth: 'open', quills: 'spread', feet: 'stand', arm: 'up'},
	//the flop back down, a little squashed
	wk4: {up: [0, 2], eyes: 'half', mouth: 'smile', quills: 'rest', feet: 'stand'},
	//eyes open, ready
	wk5: {up: [0, 1], eyes: 'open', mouth: 'smile', quills: 'rest', feet: 'stand'},
};

//[pose, ms], like the old ANIMS. A one-shot; the app plays it once and then settles into idle. The first frame is the
//still one (reduced motion skips the whole thing anyway).
const ANIMS = {
	wake: {loop: false, frames: [['wk0', 180], ['wk1', 220], ['wk1b', 120], ['wk2', 200], ['wk3', 340], ['wk4', 160], ['wk5', 140]]},
};

/* -------------------------------------------- go ------ */

const def = withParts({});
const lib = await loadMascotLib();
const images = Object.fromEntries(Object.keys(POSES).map(n => [n, toImage(compose(def, POSES[n]))]));

//contact sheet at 6x on dark and light, for checking by eye
{
	const sheet = contactSheet(lib, Object.values(ANIMS).map(a => a.frames.map(([p]) => images[p])));
	const dir = path.join(ROOT, 'brand/ab/quill-wake');
	fs.mkdirSync(dir, {recursive: true});
	fs.writeFileSync(path.join(dir, 'contact-6x.png'), lib.encodePng(sheet));
	console.log('wrote brand/ab/quill-wake/contact-6x.png');
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
	if (doc.clips.some(c => !NEW.includes(c.name) && c.end >= from)) throw new Error('another clip comes after the wake one, redraw it by hand in Frameling');
	doc.clips = doc.clips.filter(c => !NEW.includes(c.name));
	layer.cels = layer.cels.filter(c => c.start < from);
	for (const id of Object.keys(doc.drawings)) if (id.startsWith('wake-')) delete doc.drawings[id];
	doc.length = from;
}

const FPS = doc.fps;
let at = doc.length, celN = 0;
for (const [name, a] of Object.entries(ANIMS)) {
	const start = at;
	for (const [pose, ms] of a.frames) {
		const did = 'wake-' + pose;
		if (!doc.drawings[did]) {
			const img = images[pose];
			doc.drawings[did] = {id: did, kind: 'pixel', width: img.width, height: img.height, pixels: img.pixels};
		}
		const length = Math.max(1, Math.round(ms * FPS / 1000));
		layer.cels.push({id: `cel-wake-${++celN}`, start: at, length, drawingId: did});
		at += length;
	}
	doc.clips.push({id: 'clip-' + name, name, start, end: at - 1, loop: a.loop});
}
doc.length = at;
fs.writeFileSync(FILE, lib.saveFile(doc, 'add-wake', new Date('2026-11-14T00:00:00Z')));
console.log(`added ${NEW.join(', ')} to brand/mascot/mascot.frameling (${doc.clips.length} clips, ${doc.length} frames). Now npm run build:mascot.`);
