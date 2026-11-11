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
import {PALETTE, LAYERS, UPPER, B} from '../quill/quill-frames.mjs';
import {blank, stamp} from '../quill/lib.mjs';

const g = s => s.trim().split('\n').map(r => r.trim());
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

const def = {...B, parts: {...B.parts}};
for (const [layer, vs] of Object.entries(PARTS)) def.parts[layer] = {...def.parts[layer], ...vs};

//a slow, droopy, not-quite-all-the-way-up wave
def.parts.arm = {...def.parts.arm, low: def.parts.arm.wave1, lowUp: def.parts.arm.wave2};

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

/* -------------------------------------------- composing (same as brand/quill/build.mjs) ------ */

function outline(cv) {
	const h = cv.length, w = cv[0].length, out = cv.map(r => r.slice());
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		if (cv[y][x] !== '.') continue;
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const c = cv[y + dy]?.[x + dx];
			if (c && c !== '.' && c !== 'k') { out[y][x] = 'k'; break; }
		}
	}
	return out;
}

function compose(pose) {
	const N = def.size, cv = blank(N, N);
	const k = def.offsetScale || 1, sc = v => Math.trunc(v * k);
	const [bx, by] = def.base || [0, 0];
	const [dx, dy] = [sc(pose.dx || 0) + bx, sc(pose.dy || 0) + by];
	const [ux, uy] = (pose.up || [0, 0]).map(sc);
	const put = (layer, variant) => {
		const part = def.parts[layer]?.[variant];
		if (!part) throw new Error(`no part ${layer}.${variant}`);
		const up = UPPER.includes(layer) ? [ux, uy] : [0, 0];
		//tears ride with the face until they let go of it
		const fxUp = layer === 'fx' && (variant === 'tear0' || variant === 'tearR') ? [ux, uy] : [0, 0];
		stamp(cv, part[2], part[0] + dx + up[0] + fxUp[0], part[1] + dy + up[1] + fxUp[1]);
	};
	for (const layer of LAYERS) {
		if (layer === 'pencils') {
			for (const p of def.pencils) {
				//sad droops a touch further than sleep does
				const nudge = pose.quills === 'spread' ? p.spread : pose.quills === 'droop' ? [p.droop[0], p.droop[1] + (p.droop[1] ? 1 : 0)] : [0, 0];
				const tmp = blank(N, N);
				stamp(tmp, p.rows, p.at[0] + dx + ux + nudge[0], p.at[1] + dy + uy + nudge[1], {swap: {c: p.c, C: p.C}});
				stamp(cv, outline(tmp), 0, 0);
			}
			continue;
		}
		if (layer === 'fx') { for (const f of pose.fx || []) put('fx', f); continue; }
		const v = pose[layer] ?? {body: 'idle', feet: 'stand', hood: 'idle', ear: 'idle', face: 'idle', cheek: 'idle', eyes: 'open', mouth: 'smile', arm: null}[layer];
		if (v && v !== 'none') put(layer, v);
	}
	return cv.map(r => r.join(''));
}

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
function toImage(grid) {
	const N = def.size, px = new Uint8ClampedArray(N * N * 4);
	grid.forEach((row, y) => [...row].forEach((ch, x) => {
		if (ch === '.') return;
		const [r, gg, b] = rgb(PALETTE[ch]);
		px.set([r, gg, b, 255], (y * N + x) * 4);
	}));
	return {width: N, height: N, pixels: px};
}

/* -------------------------------------------- go ------ */

const lib = await loadMascotLib();
const images = Object.fromEntries(Object.keys(POSES).map(n => [n, toImage(compose(POSES[n]))]));

//contact sheet at 6x on dark and light, one row per anim, for checking by eye
{
	const S = 6, N = def.size, cell = N * S, pad = 6;
	const cols = Math.max(...Object.values(ANIMS).map(a => a.frames.length));
	const rows = Object.keys(ANIMS).length * 2;
	const W = pad + cols * (cell + pad), H = pad + rows * (cell + pad);
	const sheet = lib.blankImage(W, H);
	const fill = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) sheet.pixels.set([...c, 255], (j * W + i) * 4); };
	fill(0, 0, W, H, [42, 39, 51]);
	Object.values(ANIMS).forEach((a, r) => a.frames.forEach(([p], i) => {
		for (const [bgI, bg] of [[0, [23, 21, 31]], [1, [243, 238, 230]]]) {
			const x0 = pad + i * (cell + pad), y0 = pad + (r * 2 + bgI) * (cell + pad);
			fill(x0, y0, cell, cell, bg);
			const big = lib.scaleNearest(images[p], S);
			for (let j = 0; j < cell; j++) for (let k = 0; k < cell; k++) {
				const s = (j * cell + k) * 4;
				if (big.pixels[s + 3]) sheet.pixels.set(big.pixels.subarray(s, s + 4), ((y0 + j) * W + x0 + k) * 4);
			}
		}
	}));
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
