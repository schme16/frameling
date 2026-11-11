// Builds Quill's sprite sheets, metadata, previews and the app icon from quill-frames.mjs.
//   node brand/quill/build.mjs           everything (B goes to public/mascot, A to brand/quill/a)
//   node brand/quill/build.mjs --quick   sheets, json and contact sheets only (no gif/mp4)
// Needs ffmpeg on the PATH for the gifs and the mp4. PNGs are written with zlib, nothing else.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PALETTE, LAYERS, UPPER, A, ANIMS} from './quill-frames.mjs';
import * as frames from './quill-frames.mjs';
import {blank, stamp, image, fillRect, drawGrid, writePNG, hexRGB} from './lib.mjs';
import {ICONS} from './quill-icons.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const QUICK = process.argv.includes('--quick');
const DARK = '#17151f', LIGHT = '#f3eee6';

//B (48px) won the A/B and is what the app ships. A (32px) still builds, into brand/quill/a, for reference.
const VARIANTS = [
	{name: 'a', label: 'A 32PX', def: A, anims: ANIMS, sheet: path.join(HERE, 'a'), prev: path.join(HERE, 'a')},
	{name: 'b', label: 'B 48PX', def: frames.B, anims: frames.ANIMS_B || ANIMS, sheet: path.join(ROOT, 'public/mascot'), prev: path.join(HERE, 'b')},
];

/* ---------------------------------------------------------------- composing ------ */

//Rings a layer in ink: any see-through pixel touching a coloured one (not diagonally) goes ink
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

function compose(def, pose) {
	const N = def.size, cv = blank(N, N);
	//B reuses A's poses, so its nudges get scaled up (1 stays 1, 2 becomes 3)
	const k = def.offsetScale || 1, sc = v => Math.trunc(v * k);
	const [bx, by] = def.base || [0, 0];
	const [dx, dy] = [sc(pose.dx || 0) + bx, sc(pose.dy || 0) + by];
	const [ux, uy] = (pose.up || [0, 0]).map(sc);
	const put = (layer, variant, extra = [0, 0]) => {
		const part = def.parts[layer]?.[variant];
		if (!part) throw new Error(`no part ${layer}.${variant}`);
		const up = UPPER.includes(layer) ? [ux, uy] : [0, 0];
		stamp(cv, part[2], part[0] + dx + up[0] + extra[0], part[1] + dy + up[1] + extra[1]);
	};
	for (const layer of LAYERS) {
		if (layer === 'pencils') {
			for (const p of def.pencils) {
				const nudge = pose.quills === 'spread' ? p.spread : pose.quills === 'droop' ? p.droop : [0, 0];
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

/* ---------------------------------------------------------------- pixel font ------ */

//3x5 capitals for labels, so the previews don't depend on a system font
const FONT = {
	A: '111101111101101', B: '110101110101110', C: '111100100100111', D: '110101101101110', E: '111100110100111',
	F: '111100110100100', G: '111100101101111', H: '101101111101101', I: '111010010010111', J: '001001001101111',
	K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '111101101101111',
	P: '111101111100100', Q: '111101101111001', R: '110101110101101', S: '111100111001111', T: '111010010010010',
	U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
	Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111',
	4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111',
	9: '111101111001111', ' ': '000000000000000', '-': '000000111000000', '.': '000000000000010', '/': '001001010100100',
};
function text(img, str, x, y, s, hex) {
	for (const ch of str.toUpperCase()) {
		const f = FONT[ch] || FONT[' '];
		for (let i = 0; i < 15; i++) if (f[i] === '1') fillRect(img, x + (i % 3) * s, y + Math.floor(i / 3) * s, s, s, hex);
		x += 4 * s;
	}
}
const textW = (str, s) => str.length * 4 * s - s;

/* ---------------------------------------------------------------- per variant ------ */

function buildVariant(v) {
	const {def} = v, N = def.size;
	const poseNames = [...new Set(Object.values(v.anims).flatMap(a => a.frames.map(f => f[0])))];
	for (const n of poseNames) if (!def.poses[n]) throw new Error(`${v.name}: anim uses unknown pose ${n}`);
	const grids = Object.fromEntries(poseNames.map(n => [n, compose(def, def.poses[n])]));

	//sheet: one row per animation's unique poses would waste space, so it's a plain grid
	const cols = 8, rows = Math.ceil(poseNames.length / cols);
	const sheet = image(cols * N, rows * N);
	const where = {};
	poseNames.forEach((n, i) => {
		const x = (i % cols) * N, y = Math.floor(i / cols) * N;
		where[n] = {x, y};
		drawGrid(sheet, grids[n], x, y, 1, PALETTE);
	});
	fs.mkdirSync(v.sheet, {recursive: true});
	writePNG(path.join(v.sheet, 'quill.png'), sheet);
	const meta = {frameW: N, frameH: N, anims: {}};
	for (const [name, a] of Object.entries(v.anims))
		meta.anims[name] = {loop: a.loop, frames: a.frames.map(([p, ms]) => ({...where[p], ms}))};
	fs.writeFileSync(path.join(v.sheet, 'quill.json'), JSON.stringify(meta, null, '\t') + '\n');

	//flattened ascii of every frame, for reading diffs and fixing pixels by eye
	fs.mkdirSync(v.prev, {recursive: true});
	fs.writeFileSync(path.join(v.prev, `frames-${N}.txt`), poseNames.map(n => `# ${n}\n${grids[n].join('\n')}\n`).join('\n'));

	//contact sheet: one row per animation, each frame on dark then light, 4x
	const S = 4, cell = N * S, pad = 8, lab = 22;
	const maxF = Math.max(...Object.values(v.anims).map(a => a.frames.length));
	const animNames = Object.keys(v.anims);
	const cs = image(pad + maxF * (cell + pad), lab + animNames.length * (2 * cell + lab + pad), '#2a2733');
	text(cs, `QUILL ${v.label} CONTACT SHEET`, pad, 6, 3, '#fffaf0');
	animNames.forEach((an, r) => {
		const y0 = lab + r * (2 * cell + lab + pad);
		text(cs, `${an}  ${v.anims[an].frames.map(f => f[1]).join(' ')} MS`, pad, y0 + 4, 2, '#ffc94a');
		v.anims[an].frames.forEach(([p], i) => {
			const x = pad + i * (cell + pad);
			fillRect(cs, x, y0 + lab, cell, cell, DARK);
			fillRect(cs, x, y0 + lab + cell, cell, cell, LIGHT);
			drawGrid(cs, grids[p], x, y0 + lab, S, PALETTE);
			drawGrid(cs, grids[p], x, y0 + lab + cell, S, PALETTE);
		});
	});
	writePNG(path.join(v.prev, 'contact-sheet.png'), cs);
	return {grids, poseNames};
}

/* ---------------------------------------------------------------- video bits ------ */

//Expands an anim to one grid per tick of `fps`, for `ms` total (loops or holds the last frame)
function timeline(anim, grids, fps, ms) {
	const out = [], total = anim.frames.reduce((t, f) => t + f[1], 0);
	for (let t = 0; t < ms; t += 1000 / fps) {
		let tt = anim.loop ? t % total : Math.min(t, total - 1), i = 0;
		while (tt >= anim.frames[i][1] && i < anim.frames.length - 1) tt -= anim.frames[i++][1];
		out.push(grids[anim.frames[i][0]]);
	}
	return out;
}

function ffmpeg(args, input) {
	const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {input, maxBuffer: 1 << 30});
	if (r.status !== 0) throw new Error('ffmpeg failed: ' + r.stderr);
}

function gifFor(v, built, name) {
	const anim = v.anims[name], N = v.def.size, S = 6, fps = 50;
	const total = anim.frames.reduce((t, f) => t + f[1], 0);
	const ticks = timeline(anim, built.grids, fps, anim.loop ? total : total + 600);
	const W = 2 * N * S, H = N * S, raw = Buffer.alloc(W * H * 4 * ticks.length);
	ticks.forEach((g, i) => {
		const img = image(W, H);
		fillRect(img, 0, 0, N * S, H, DARK); fillRect(img, N * S, 0, N * S, H, LIGHT);
		drawGrid(img, g, 0, 0, S, PALETTE); drawGrid(img, g, N * S, 0, S, PALETTE);
		img.px.copy(raw, i * W * H * 4);
	});
	ffmpeg(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-',
		'-filter_complex', 'split[a][b];[a]palettegen=max_colors=32:reserve_transparent=0[p];[b][p]paletteuse=dither=none',
		'-loop', '0', path.join(v.prev, `preview-${name}.gif`)], raw);
}

/* ---------------------------------------------------------------- A/B ------ */

const KEY = [['idle', 'idle'], ['wave', 'wave2'], ['talk', 'talk0'], ['point', 'point0'], ['cheer', 'cheerPeak'], ['think', 'think3'], ['draw', 'draw1'], ['sleep', 'sleep2'], ['oops', 'oops2']];

function abSheet(built) {
	const S = 6, pad = 16, lab = 56;
	const widths = VARIANTS.map(v => v.def.size * S);
	const W = pad + KEY.length * (Math.max(...widths) + pad);
	const H = lab + VARIANTS.reduce((t, v) => t + 2 * v.def.size * S + lab + pad, 0);
	const img = image(W, H, '#2a2733');
	let y = 8;
	VARIANTS.forEach((v, vi) => {
		const N = v.def.size, cell = N * S;
		text(img, `${v.label}`, pad, y, 5, '#ffc94a');
		y += lab;
		KEY.forEach(([an, pose], i) => {
			const x = pad + i * (Math.max(...widths) + pad);
			const g = built[vi].grids[pose] || compose(v.def, v.def.poses[pose]);
			fillRect(img, x, y, cell, cell, DARK); fillRect(img, x, y + cell, cell, cell, LIGHT);
			drawGrid(img, g, x, y, S, PALETTE); drawGrid(img, g, x, y + cell, S, PALETTE);
			if (vi === 0) text(img, an, x, y - 14, 2, '#fffaf0');
		});
		y += 2 * cell + pad;
	});
	writePNG(path.join(HERE, 'ab.png'), img);
}

function abVideo(built) {
	//each animation plays ~1.5s, A and B side by side at 6x, on dark over light
	const S = 6, fps = 30, per = 1500, pad = 24, lab = 60;
	const cellW = VARIANTS.map(v => v.def.size * S);
	let W = pad + cellW.reduce((t, w) => t + w + pad, 0), H = lab + 2 * Math.max(...cellW) + pad + 40;
	W += W % 2; H += H % 2;
	const chunks = [];
	for (const [an] of KEY) {
		const tl = VARIANTS.map((v, vi) => timeline(v.anims[an], built[vi].grids, fps, per));
		for (let t = 0; t < tl[0].length; t++) {
			const img = image(W, H, '#2a2733');
			text(img, an, pad, 14, 6, '#fffaf0');
			let x = pad;
			VARIANTS.forEach((v, vi) => {
				const N = v.def.size, cell = N * S;
				text(img, v.label, x, lab + 2 * Math.max(...cellW) + 12, 4, '#ffc94a');
				fillRect(img, x, lab, cell, cell, DARK); fillRect(img, x, lab + cell, cell, cell, LIGHT);
				drawGrid(img, tl[vi][t], x, lab, S, PALETTE); drawGrid(img, tl[vi][t], x, lab + cell, S, PALETTE);
				x += cell + pad;
			});
			chunks.push(Buffer.from(img.px));
		}
	}
	ffmpeg(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-',
		'-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', '-movflags', '+faststart',
		path.join(HERE, 'ab.mp4')], Buffer.concat(chunks));
}

/* ---------------------------------------------------------------- icons ------ */

function buildIcons() {
	const big = ICONS.icon32, small = ICONS.icon16;
	const dir = path.join(ROOT, 'build'), sets = path.join(dir, 'icons');
	fs.mkdirSync(sets, {recursive: true});
	const scaled = (g, s) => {
		const n = g.length, img = image(n * s, n * s);
		drawGrid(img, g, 0, 0, s, ICONS.palette);
		return img;
	};
	writePNG(path.join(dir, 'icon.png'), scaled(big, 32));
	for (const size of [16, 32, 48, 64, 128, 256, 512]) {
		const g = size === 16 || size === 48 ? small : big;
		writePNG(path.join(sets, `${size}x${size}.png`), scaled(g, size / g.length));
	}
	//the in-app logo (top bar), drawn at 1x and scaled up crisply by the page
	writePNG(path.join(ROOT, 'public', 'mascot', 'logo.png'), scaled(big, 1));
	//svg twin of the 32px art: one rect per horizontal run of a colour
	let rects = '';
	big.forEach((row, y) => {
		for (let x = 0; x < row.length;) {
			const c = row[x];
			let e = x;
			while (row[e + 1] === c) e++;
			if (c !== '.') rects += `<rect x="${x}" y="${y}" width="${e - x + 1}" height="1" fill="${ICONS.palette[c]}"/>`;
			x = e + 1;
		}
	});
	fs.writeFileSync(path.join(dir, 'icon.svg'),
		`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 32 32" shape-rendering="crispEdges">${rects}</svg>\n`);
	//preview of the icon at every size on both backgrounds
	const sizes = [16, 32, 48, 64, 128, 256], pad = 16, W = pad + sizes.reduce((t, s) => t + s + pad, 0), H = 2 * (256 + pad) + pad;
	const pv = image(W, H);
	fillRect(pv, 0, 0, W, H / 2, DARK); fillRect(pv, 0, H / 2, W, H / 2, LIGHT);
	let x = pad;
	for (const s of sizes) {
		const g = s === 16 || s === 48 ? small : big, k = s / g.length;
		for (const y0 of [pad, H / 2 + pad]) drawGrid(pv, g, x, y0 + 256 - s, k, ICONS.palette);
		x += s + pad;
	}
	writePNG(path.join(HERE, 'icon-preview.png'), pv);
}

/* ---------------------------------------------------------------- go ------ */

const built = VARIANTS.map(buildVariant);
buildIcons();
if (!QUICK) {
	VARIANTS.forEach((v, vi) => { for (const name of Object.keys(v.anims)) gifFor(v, built[vi], name); });
	abSheet(built);
	if (VARIANTS.length > 1) abVideo(built);
}
console.log('built', VARIANTS.map(v => v.name).join(', '), QUICK ? '(quick)' : '');
