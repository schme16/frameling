// Adds Quill's `sad` and `wave-sad` clips to brand/mascot/mascot.frameling, drawn from the old part grids in
// brand/quill/quill-frames.mjs plus a few new parts below (watery eyes, a frown, tears, a little splash).
// Appends after the last clip and leaves every existing clip alone. Run again with --force to redraw just these two.
//   node brand/mascot/add-sad.mjs            add them (refuses if they're already there)
//   node brand/mascot/add-sad.mjs --force    replace them
//   node brand/mascot/add-sad.mjs --preview  only write the 6x contact sheet to brand/ab/sad-quill/
// Then npm run build:mascot.
import fs from 'node:fs';
import path from 'node:path';
import {loadMascotLib, ROOT} from '../../scripts/mascot/load.mjs';
import {compose, contactSheet, g, toImage, withParts} from './compose.mjs';
import {ARMS} from './arms.mjs';
const NEW = ['sad', 'wave-sad'];

//new parts, in B's idle coordinates like the rest
const PARTS = {
	eyes: {
		//looking down, brows tipped up in the middle, a wet glint along the bottom
		sad: [23, 20, g(`
			...kk....kk...
			.kk........kk.
			..............
			.kkk......kkk.
			.kkk......kkk.
			.wks......wks.
		`)],
		//eyes squeezed for a sniff
		sniff: [23, 20, g(`
			...kk....kk...
			.kk........kk.
			..............
			..............
			kkkkk....kkkkk
		`)],
		//a brave little smile-squint, still a bit wet
		brave: [23, 20, g(`
			...kk....kk...
			.kk........kk.
			..............
			..............
			.kkk.....kkk..
			k...k....k...k
		`)],
	},
	mouth: {
		frown: [28, 28, g(`
			.kk.
			k..k
		`)],
		//the wobbly brave smile
		wobbly: [27, 28, g(`
			k....k
			.kk.k.
		`)],
	},
	fx: {
		//a tear welling on the cheek, then falling past the body and plinking on the floor
		tear0: [24, 26, g(`
			s
			S
		`)],
		tear1: [23, 29, g(`
			w
			s
			S
		`)],
		tear2: [22, 34, g(`
			w
			s
			S
		`)],
		tear3: [21, 39, g(`
			s
			S
		`)],
		plink: [19, 42, g(`
			s...s
			.s.s.
		`)],
		tearR: [35, 26, g(`
			s
			S
		`)],
	},
};

//the redrawn chunky arms (redraw-arms.mjs) wave goodbye too
const def = withParts({...PARTS, arm: ARMS});

const droop = {quills: 'droop', ear: 'flat', cheek: 'idle'};
const POSES = {
	sad0:     {...droop, up: [0, 1], eyes: 'sad', mouth: 'frown', fx: ['tear0']},
	sadFall1: {...droop, up: [0, 1], eyes: 'sad', mouth: 'frown', fx: ['tear1']},
	sadFall2: {...droop, up: [0, 1], eyes: 'sad', mouth: 'frown', fx: ['tear2']},
	sadFall3: {...droop, up: [0, 1], eyes: 'sad', mouth: 'frown', fx: ['tear3']},
	sadPlink: {...droop, up: [0, 1], eyes: 'sad', mouth: 'frown', fx: ['plink']},
	sadDry:   {...droop, up: [0, 1], eyes: 'sad', mouth: 'frown'},
	sadSniff: {...droop, up: [0, 2], eyes: 'sniff', mouth: 'frown', fx: ['tearR']},
	sadWell:  {...droop, up: [0, 1], eyes: 'sad', mouth: 'frown', fx: ['tearR']},
	bye0: {...droop, eyes: 'brave', mouth: 'wobbly', arm: 'wave1', fx: ['tear0']},
	bye1: {...droop, eyes: 'brave', mouth: 'wobbly', arm: 'wave2', fx: ['tear0']},
	bye2: {...droop, up: [0, 1], eyes: 'brave', mouth: 'wobbly', arm: 'wave1', fx: ['tear1']},
	bye3: {...droop, up: [0, 1], eyes: 'brave', mouth: 'wobbly', arm: 'wave2', fx: ['tear2']},
	byeEnd: {...droop, up: [0, 1], eyes: 'brave', mouth: 'wobbly'},
};

//[pose, ms], like the old ANIMS. sad's first frame is the still one (reduced motion shows only that)
const ANIMS = {
	sad: {loop: true, frames: [
		['sad0', 600], ['sadFall1', 110], ['sadFall2', 110], ['sadFall3', 90], ['sadPlink', 150], ['sadDry', 500],
		['sadSniff', 150], ['sadDry', 250], ['sadSniff', 150], ['sadWell', 500],
	]},
	'wave-sad': {loop: false, frames: [
		['bye0', 260], ['bye1', 300], ['bye0', 260], ['bye1', 300], ['bye2', 200], ['bye3', 200], ['byeEnd', 600],
	]},
};

/* -------------------------------------------- go ------ */

const lib = await loadMascotLib();
const images = Object.fromEntries(Object.keys(POSES).map(n => [n, toImage(compose(def, POSES[n], {faceFx: ['tear0', 'tearR'], sadDroop: true}))]));

//contact sheet at 6x on dark and light, one row per anim, for checking by eye
{
	const sheet = contactSheet(lib, Object.values(ANIMS).map(a => a.frames.map(([p]) => images[p])));
	const dir = path.join(ROOT, 'brand/ab/sad-quill');
	fs.mkdirSync(dir, {recursive: true});
	fs.writeFileSync(path.join(dir, 'contact-6x.png'), lib.encodePng(sheet));
	console.log('wrote brand/ab/sad-quill/contact-6x.png');
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
		console.error(`mascot.frameling already has ${already.map(c => c.name).join(' and ')}. Pass --force to redraw them.`);
		process.exit(1);
	}
	//they were appended last, so everything from the first of them on goes
	const from = Math.min(...already.map(c => c.start));
	if (doc.clips.some(c => !NEW.includes(c.name) && c.end >= from)) throw new Error('another clip comes after the sad ones, redraw them by hand in Frameling');
	doc.clips = doc.clips.filter(c => !NEW.includes(c.name));
	layer.cels = layer.cels.filter(c => c.start < from);
	for (const id of Object.keys(doc.drawings)) if (id.startsWith('sad-')) delete doc.drawings[id];
	doc.length = from;
}

const FPS = doc.fps;
let at = doc.length, celN = 0;
for (const [name, a] of Object.entries(ANIMS)) {
	const start = at;
	for (const [pose, ms] of a.frames) {
		const did = 'sad-' + pose;
		if (!doc.drawings[did]) {
			const img = images[pose];
			doc.drawings[did] = {id: did, kind: 'pixel', width: img.width, height: img.height, pixels: img.pixels};
		}
		const length = Math.max(1, Math.round(ms * FPS / 1000));
		layer.cels.push({id: `cel-sad-${++celN}`, start: at, length, drawingId: did});
		at += length;
	}
	doc.clips.push({id: 'clip-' + name, name, start, end: at - 1, loop: a.loop});
}
doc.length = at;
fs.writeFileSync(FILE, lib.saveFile(doc, 'add-sad', new Date('2026-11-11T00:00:00Z')));
console.log(`added ${NEW.join(', ')} to brand/mascot/mascot.frameling (${doc.clips.length} clips, ${doc.length} frames). Now npm run build:mascot.`);
