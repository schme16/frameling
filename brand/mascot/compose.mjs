// Composes Quill poses from the part grids in brand/quill/quill-frames.mjs, the same way brand/quill/build.mjs does,
// into RawImages Frameling's own io can store. Used by add-sad.mjs and redraw-arms.mjs.
import {PALETTE, LAYERS, UPPER, B} from '../quill/quill-frames.mjs';
import {blank, stamp} from '../quill/lib.mjs';

export const g = s => s.trim().split('\n').map(r => r.trim());

//B with extra or replacement parts merged over it, layer by layer
export function withParts(extra, base = B) {
	const def = {...base, parts: {...base.parts}};
	for (const [layer, vs] of Object.entries(extra)) def.parts[layer] = {...def.parts[layer], ...vs};
	return def;
}

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

//faceFx: fx parts that ride with the head (a tear on the cheek) instead of staying put
export function compose(def, pose, {faceFx = [], sadDroop = false} = {}) {
	const N = def.size, cv = blank(N, N);
	const k = def.offsetScale || 1, sc = v => Math.trunc(v * k);
	const [bx, by] = def.base || [0, 0];
	const [dx, dy] = [sc(pose.dx || 0) + bx, sc(pose.dy || 0) + by];
	const [ux, uy] = (pose.up || [0, 0]).map(sc);
	const put = (layer, variant) => {
		const part = def.parts[layer]?.[variant];
		if (!part) throw new Error(`no part ${layer}.${variant}`);
		const rides = UPPER.includes(layer) || (layer === 'fx' && faceFx.includes(variant));
		const up = rides ? [ux, uy] : [0, 0];
		stamp(cv, part[2], part[0] + dx + up[0], part[1] + dy + up[1]);
	};
	for (const layer of LAYERS) {
		if (layer === 'pencils') {
			for (const p of def.pencils) {
				//sad droops a touch further than sleep does
				const droop = sadDroop ? [p.droop[0], p.droop[1] + (p.droop[1] ? 1 : 0)] : p.droop;
				const nudge = pose.quills === 'spread' ? p.spread : pose.quills === 'droop' ? droop : [0, 0];
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
export function toImage(grid) {
	const H = grid.length, W = grid[0].length, px = new Uint8ClampedArray(W * H * 4);
	grid.forEach((row, y) => [...row].forEach((ch, x) => {
		if (ch === '.') return;
		const [r, gg, b] = rgb(PALETTE[ch]);
		px.set([r, gg, b, 255], (y * W + x) * 4);
	}));
	return {width: W, height: H, pixels: px};
}

//a grid of frames at scale S on dark and light, rows of [image, ...], for checking by eye
export function contactSheet(lib, rows, S = 6, pad = 6) {
	const N = rows.flat().find(Boolean).width, cell = N * S;
	const cols = Math.max(...rows.map(r => r.length));
	const W = pad + cols * (cell + pad), H = pad + rows.length * 2 * (cell + pad);
	const sheet = lib.blankImage(W, H);
	const fill = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) sheet.pixels.set([...c, 255], (j * W + i) * 4); };
	fill(0, 0, W, H, [42, 39, 51]);
	rows.forEach((row, r) => row.forEach((img, i) => {
		if (!img) return;
		const big = lib.scaleNearest(img, S);
		for (const [bgI, bg] of [[0, [23, 21, 31]], [1, [243, 238, 230]]]) {
			const x0 = pad + i * (cell + pad), y0 = pad + (r * 2 + bgI) * (cell + pad);
			fill(x0, y0, cell, cell, bg);
			for (let j = 0; j < cell; j++) for (let k = 0; k < cell; k++) {
				const s = (j * cell + k) * 4;
				if (big.pixels[s + 3]) sheet.pixels.set(big.pixels.subarray(s, s + 4), ((y0 + j) * W + x0 + k) * 4);
			}
		}
	}));
	return sheet;
}
