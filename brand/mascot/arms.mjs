// Quill's arms, redrawn chunky: a round shoulder that melts into the body, a band of even width (so it never changes
// thickness between frames), and a round paw with a rose palm pad. Each arm is a shoulder point and a paw point in
// frame coordinates (48 x 48, standing pose); the part grids are built from those so every arm matches.
// Used by redraw-arms.mjs (the old animations) and add-sad.mjs (the goodbye wave).
import {B} from '../quill/quill-frames.mjs';

//band width across the arm, inside the outline. 3 reads chunky at 48 px without swallowing the face
const W = 3;
const SHOULDER_R = 2.3, PAW_R = 2.5;
//where his tummy is filled in (frame coordinates), so the arm can melt into it there and nowhere else
const TUMMY = new Set();
{
	const [bx, by, rows] = B.parts.body.idle;
	rows.forEach((r, y) => [...r].forEach((c, x) => c !== '.' && c !== 'k' && TUMMY.add(`${bx + x + B.base[0]},${by + y + B.base[1]}`)));
}
//first row of tummy under the face (the face covers the rows above)
const BODY_TOP = 36;

function build({shoulder: S, paw: P, pad = true, nub = null, pencil = null}) {
	const px = new Map();
	const set = (x, y, c) => px.set(`${x},${y}`, {x, y, c});
	const disc = ([cx, cy], r) => {
		for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
			for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
				const dx = x - cx, dy = y - cy;
				if (dx * dx + dy * dy <= r * r) set(x, y, dx + dy > r * 0.7 ? 'P' : 'p');
			}
	};

	//the pencil goes in first so the paw closes round it
	if (pencil) for (const [x, y, c] of pencil) set(x, y, c);

	disc(S, SHOULDER_R);
	//the band: steep arms go row by row, flat ones column by column, always W wide. Underside (right or below) shaded
	const [dx, dy] = [P[0] - S[0], P[1] - S[1]];
	if (Math.abs(dy) >= Math.abs(dx)) {
		for (let y = Math.min(S[1], P[1]); y <= Math.max(S[1], P[1]); y++) {
			const cx = S[0] + ((y - S[1]) / dy) * dx, x0 = Math.round(cx - (W - 1) / 2);
			for (let i = 0; i < W; i++) set(x0 + i, y, i === W - 1 ? 'P' : 'p');
		}
	} else {
		for (let x = Math.min(S[0], P[0]); x <= Math.max(S[0], P[0]); x++) {
			const cy = S[1] + ((x - S[0]) / dx) * dy, y0 = Math.round(cy - (W - 1) / 2);
			for (let i = 0; i < W; i++) set(x, y0 + i, i === W - 1 ? 'P' : 'p');
		}
	}
	disc(P, PAW_R);
	if (nub) for (const [x, y, c] of nub) set(x, y, c);
	if (pad) { set(P[0] - 1, P[1], 'r'); set(P[0], P[1], 'r'); }

	//ring it in ink, except on the body side of the shoulder, where the arm just carries on into him
	const ink = [];
	for (const {x, y} of [...px.values()])
		for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const [nx, ny] = [x + ox, y + oy];
			if (px.has(`${nx},${ny}`)) continue;
			//only below the face, so the arm still gets a line where it crosses his cheek
			if (ny >= BODY_TOP && TUMMY.has(`${nx},${ny}`)) continue;
			ink.push([nx, ny]);
		}
	for (const [x, y] of ink) set(x, y, 'k');

	const all = [...px.values()];
	const x0 = Math.min(...all.map(p => p.x)), y0 = Math.min(...all.map(p => p.y));
	const w = Math.max(...all.map(p => p.x)) - x0 + 1, h = Math.max(...all.map(p => p.y)) - y0 + 1;
	const rows = Array.from({length: h}, () => Array(w).fill('.'));
	for (const p of all) rows[p.y - y0][p.x - x0] = p.c;
	//parts sit in idle coordinates, which are frame coordinates less B's base
	return [x0 - B.base[0], y0 - B.base[1], rows.map(r => r.join(''))];
}

//a pencil held upright, eraser up, point down (frame coordinates, x is its left edge)
function pencilAt(x, top, bottom) {
	const out = [];
	const row = (y, s) => [...s].forEach((c, i) => c !== '.' && out.push([x + i, y, c]));
	row(top, '.kk.');
	row(top + 1, 'krRk');
	row(top + 2, 'kYYk');
	for (let y = top + 3; y < bottom - 1; y++) row(y, 'ksSk');
	row(bottom - 1, 'kwwk');
	row(bottom, '.kk.');
	return out;
}

//the shoulder sits in his side, under the face, and every arm swings from it. Paws stop at x 44 so the outline fits
const SH = [37, 38];
export const ARMS = {
	wave1: build({shoulder: SH, paw: [43, 31]}),
	wave2: build({shoulder: SH, paw: [44, 29]}),
	up: build({shoulder: SH, paw: [44, 24]}),
	point: build({shoulder: SH, paw: [43, 37], pad: false, nub: [[46, 36, 'p'], [46, 37, 'P']]}),
	draw1: build({shoulder: SH, paw: [43, 37], pad: false, pencil: pencilAt(42, 29, 42)}),
	draw2: build({shoulder: SH, paw: [44, 37], pad: false, pencil: pencilAt(43, 29, 42)}),
	chin: build({shoulder: SH, paw: [34, 34], pad: false}),
};
