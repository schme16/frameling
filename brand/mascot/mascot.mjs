// Quill's one script. His drawing lives in brand/mascot/mascot.frameling, and you change him by opening that in
// Frameling and drawing on it. This script only does the two jobs Frameling can't yet:
//
//   node brand/mascot/mascot.mjs                   what is in the file: layers, then every clip and how many poses it has
//   node brand/mascot/mascot.mjs poses             pictures of every pose, a row per clip: brand/mascot/poses-dark.png and poses-light.png
//   node brand/mascot/mascot.mjs copy <clip> <new> add a copy of a clip, named <new>, after the last one, ready to draw over
//
// Then save in Frameling and run npm run build:mascot (npm run build does it too).
// The file is laid out as the parts of a pose, one layer each (Body, Feet, Hood, Pencil quills, Ear, Face, Cheeks,
// Eyes, Mouth, Arms, Extras), grouped into folders. A clip is one animation, and a pose is whatever the layers show at
// one moment. To make a new pose, copy the nearest clip and change only the layer that differs (usually Eyes or Mouth).
import fs from 'node:fs';
import path from 'node:path';
import {loadMascotLib, ROOT} from '../../scripts/mascot/load.mjs';

//glyphs as five rows of three, joined by spaces
const FONT = Object.fromEntries(Object.entries({
	'a': '.#. #.# ### #.# #.#',
	'b': '##. #.# ##. #.# ##.',
	'c': '.## #.. #.. #.. .##',
	'd': '##. #.# #.# #.# ##.',
	'e': '### #.. ##. #.. ###',
	'f': '### #.. ##. #.. #..',
	'g': '.## #.. #.# #.# .##',
	'h': '#.# #.# ### #.# #.#',
	'i': '### .#. .#. .#. ###',
	'j': '..# ..# ..# #.# .#.',
	'k': '#.# #.# ##. #.# #.#',
	'l': '#.. #.. #.. #.. ###',
	'm': '#.# ### ### #.# #.#',
	'n': '##. #.# #.# #.# #.#',
	'o': '.#. #.# #.# #.# .#.',
	'p': '##. #.# ##. #.. #..',
	'q': '.#. #.# #.# ##. .##',
	'r': '##. #.# ##. #.# #.#',
	's': '.## #.. .#. ..# ##.',
	't': '### .#. .#. .#. .#.',
	'u': '#.# #.# #.# #.# ###',
	'v': '#.# #.# #.# #.# .#.',
	'w': '#.# #.# ### ### #.#',
	'x': '#.# #.# .#. #.# #.#',
	'y': '#.# #.# .#. .#. .#.',
	'z': '### ..# .#. #.. ###',
	'-': '... ... ### ... ...',
	'(': '.#. #.. #.. #.. .#.',
	')': '.#. ..# ..# ..# .#.',
	' ': '... ... ... ... ...',
	'0': '### #.# #.# #.# ###',
	'1': '.#. ##. .#. .#. ###',
	'2': '##. ..# .#. #.. ###',
	'3': '##. ..# .#. ..# ##.',
	'4': '#.# #.# ### ..# ..#',
	'5': '### #.. ##. ..# ##.',
	'6': '.## #.. ### #.# ###',
	'7': '### ..# .#. .#. .#.',
	'8': '### #.# ### #.# ###',
	'9': '### #.# ### ..# ##.',
}).map(([k, v]) => [k, v.split(' ')]));

const FILE = path.join(ROOT, 'brand/mascot/mascot.frameling');
const lib = await loadMascotLib();
const {doc} = lib.loadFile(new Uint8Array(fs.readFileSync(FILE)));
const [cmd = 'list', ...args] = process.argv.slice(2);

const frameCount = (sheet, name) => new Set(sheet.meta.anims[name].frames.map(f => f.x + ',' + f.y)).size;

if (cmd === 'list') {
	const sheet = lib.docToSheet(doc);
	const folders = doc.folders || {};
	console.log(`layers, top to bottom:`);
	for (const l of [...doc.layers].reverse()) console.log(`  ${l.name}${l.folder ? `  (in ${folders[l.folder]?.name})` : ''}`);
	console.log(`clips, in order:`);
	for (const c of doc.clips) console.log(`  ${c.name.padEnd(10)} ${String(frameCount(sheet, c.name)).padStart(2)} poses, frames ${c.start + 1} to ${c.end + 1}${c.loop ? ', loops' : ''}`);
} else if (cmd === 'copy') {
	const [from, to] = args;
	if (!from || !to) { console.error('Usage: node brand/mascot/mascot.mjs copy <clip> <new name>'); process.exit(1); }
	let clip;
	try { clip = lib.copyClip(doc, from, to); } catch (e) { console.error(e.message); process.exit(1); }
	fs.writeFileSync(FILE, lib.saveFile(doc, 'mascot.mjs', new Date()));
	console.log(`Added "${clip.name}" as a copy of "${from}": frames ${clip.start + 1} to ${clip.end + 1} of ${doc.length}, ${doc.layers.filter(l => l.cels.some(c => c.start >= clip.start)).length} layers drawn on.`);
	console.log(`Open ${path.relative(ROOT, FILE)} in Frameling, click the "${clip.name}" bar above the timeline, draw over the layers that should change, save, then npm run build:mascot.`);
} else if (cmd === 'poses') {
	const sheet = lib.docToSheet(doc);
	for (const [theme, bg, ink] of [['dark', [23, 21, 31], [243, 238, 230]], ['light', [243, 238, 230], [29, 27, 38]]]) {
		const S = 3, N = sheet.meta.frameW * S, pad = 10, labelH = 18;
		const rows = doc.clips.map(c => {
			const seen = new Set(), tiles = [];
			for (const f of sheet.meta.anims[c.name].frames) if (!seen.has(f.x + ',' + f.y)) { seen.add(f.x + ',' + f.y); tiles.push(f); }
			return {name: c.name, tiles};
		});
		const cols = Math.max(...rows.map(r => r.tiles.length));
		const W = pad + cols * (N + pad), H = pad + rows.length * (labelH + N + pad);
		const img = lib.blankImage(W, H);
		for (let i = 0; i < W * H; i++) img.pixels.set([...bg, 255], i * 4);
		rows.forEach((r, ri) => {
			const y0 = pad + ri * (labelH + N + pad);
			text(img, `${r.name} (${r.tiles.length})`, pad, y0 + 2, ink);
			r.tiles.forEach((f, i) => {
				const big = lib.scaleNearest(lib.crop(sheet.image, f.x, f.y, sheet.meta.frameW, sheet.meta.frameH), S);
				const x0 = pad + i * (N + pad);
				for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
					const s = (j * N + k) * 4;
					if (big.pixels[s + 3]) img.pixels.set(big.pixels.subarray(s, s + 4), ((y0 + labelH + j) * W + x0 + k) * 4);
				}
			});
		});
		const out = path.join(ROOT, `brand/mascot/poses-${theme}.png`);
		fs.writeFileSync(out, lib.encodePng(img));
		console.log('wrote ' + path.relative(ROOT, out));
	}
	console.log(`${doc.clips.length} clips, ${new Set(Object.values(sheet.meta.anims).flatMap(a => a.frames.map(f => f.x + ',' + f.y))).size} different poses.`);
} else {
	console.error(`Unknown command "${cmd}". Try: list, poses, copy.`);
	process.exit(1);
}

//a tiny 3 x 5 pixel font for the clip names, at 2x
function text(img, s, x, y, [r, g, b]) {
	for (const ch of s.toLowerCase()) {
		const rows = FONT[ch] || FONT[' '];
		rows.forEach((row, j) => [...row].forEach((c, i) => {
			if (c !== '#') return;
			for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) img.pixels.set([r, g, b, 255], ((y + j * 2 + dy) * img.width + x + i * 2 + dx) * 4);
		}));
		x += 8;
	}
}
