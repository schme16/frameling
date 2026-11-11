// c5 "Hold": the caterpillar is a timeline. Each body segment is a hold of a different length ("on twos", "on threes"),
// a keyframe diamond sits on every joint, the legs are the ruler ticks (tall every fourth one) and the head is a
// playhead pin turned to face forward, with the playhead line as one antenna.
import { INK, PAPER, C, mode, n, shape, taper, wobble, diamond, eye, groundMark, pixelCanvas, smooth, rng } from './lib.mjs';

//hold lengths in frames: the body is 1, 2, 1 and 3 frames long. u = pixels per frame, hs = height scale
export const HOLDS = [1, 2, 1, 3];
export const POSES = {
	hero: { u: 34, hs: 1, lift: [0, 0, 0, 0], tilt: [-2, 1, -3, 2], head: [140, 134, 6, 4], look: [0.7, -0.45], sc: 1 },
	squash: { u: 28, hs: 1.12, lift: [0, 0, 0, 0], tilt: [0, 0, 0, 0], head: [146, 122, 0, 9], look: [0.2, 0.6], sc: 1 },
	stretch: { u: 40, hs: 0.88, lift: [6, 14, 24, 36], tilt: [-4, 2, -5, 5], head: [130, 120, 40, 12], look: [0.8, -0.7], sc: 0.88 },
};
const FILL = [C.rose, C.peach, C.rose, C.peach];

//polygon with rounded corners, slightly uneven, as a path
function roundPoly(pts, r, seed = 1, amt = 2) {
	const rn = rng(seed);
	const N = pts.length;
	let d = '';
	for (let i = 0; i < N; i++) {
		const p0 = pts[(i + N - 1) % N], p1 = pts[i], p2 = pts[(i + 1) % N];
		const rr = r[i] ?? r[0];
		const v1 = [p0[0] - p1[0], p0[1] - p1[1]], v2 = [p2[0] - p1[0], p2[1] - p1[1]];
		const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
		const a = [p1[0] + (v1[0] / l1) * rr + (rn() - 0.5) * amt, p1[1] + (v1[1] / l1) * rr + (rn() - 0.5) * amt];
		const b = [p1[0] + (v2[0] / l2) * rr + (rn() - 0.5) * amt, p1[1] + (v2[1] / l2) * rr + (rn() - 0.5) * amt];
		d += (i ? 'L' : 'M') + n(a[0]) + ',' + n(a[1]) + 'Q' + n(p1[0]) + ',' + n(p1[1]) + ' ' + n(b[0]) + ',' + n(b[1]);
	}
	return d + 'Z';
}

export function draw(poseName = 'hero') {
	const P = POSES[poseName];
	let out = '';
	const base = 420; //ground
	let x = 34;
	const placed = [];
	if (!mode.sil) {
		for (let i = 0; i < 4; i++) out += `<path d="M${12 + i * 11},${base - 46} h6" stroke="${INK}" stroke-width="5" stroke-linecap="round" opacity="${0.12 + i * 0.12}"/>`;
	}
	const baseH = [62, 84, 70, 106];
	for (let i = 0; i < 4; i++) {
		const w = 14 + HOLDS[i] * P.u;
		const h = baseH[i] * P.hs;
		placed.push({ cx: x + w / 2, cy: base - h / 2 - P.lift[i] - 16, w, h, tilt: P.tilt[i], i });
		x += w + 8;
	}
	//ruler-tick legs: one long tick at the start of each hold, short ones on every frame inside it
	for (const sg of placed) {
		const r = rng(80 + sg.i);
		const bottom = sg.cy + sg.h / 2 - 6;
		for (let k = 0; k < HOLDS[sg.i]; k++) {
			const tx = sg.cx - sg.w / 2 + 14 + k * P.u + (k === 0 ? 4 : 0);
			const len = k === 0 ? 30 : 17;
			out += taper([[tx, bottom - 6], [tx + (r() - 0.5) * 2, bottom + len * 0.5], [tx + (k === 0 ? 0 : 1), bottom + len]], k === 0 ? 10 : 8, k === 0 ? 7 : 5.5);
		}
	}
	for (const sg of placed) {
		const { cx, cy, w, h, tilt, i } = sg;
		const d = roundPoly([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], [i === 0 ? 30 : 22, 24, 24, i === 0 ? 30 : 20], 3 + i * 5, 2.5);
		let g = `<g transform="translate(${n(cx)} ${n(cy)}) rotate(${tilt})">`;
		g += shape(d, FILL[i], { sw: 8, off: [2.5, 5] });
		if (!mode.sil) {
			//frame boundaries inside the hold, drawn like pencil registration marks
			for (let k = 1; k < HOLDS[i]; k++) {
				const bx = -w / 2 + 14 + k * P.u + 4;
				g += taper([[bx, -h / 2 + 12], [bx + 1, 0], [bx, h / 2 - 12]], 3, 3, INK, 'opacity=".3"');
			}
			g += `<path d="M${n(-w / 2 + 10)},${n(h / 2 - 6)} C${n(-w / 4)},${n(h / 2 + 2)} ${n(w / 4)},${n(h / 2 + 2)} ${n(w / 2 - 8)},${n(h / 2 - 6)} L${n(w / 2 - 8)},${n(h / 2 - 16)} C${n(w / 4)},${n(h / 2 - 9)} ${n(-w / 4)},${n(h / 2 - 9)} ${n(-w / 2 + 10)},${n(h / 2 - 16)}Z" fill="${INK}" opacity=".16"/>`;
		}
		g += `</g>`;
		out += g;
	}
	//the track row runs through the gaps and a keyframe diamond sits on every joint
	{
		const ty = base - 58;
		for (const sg of placed) {
			const gx = sg.cx + sg.w / 2;
			out += taper([[gx - 8, ty], [gx + 4, ty + 1], [gx + 16, ty]], 8, 8, INK).replace(/<circle[^>]*\/>/g, '');
			if (!mode.sil) out += diamond(gx + 4, ty, 15, C.sky, 5.5, 0);
		}
	}
	//head: a playhead pin turned to face forward
	const [hw, hh, hl, ht] = P.head;
	const last = placed[3];
	const hx = last.cx + last.w / 2 + 8 + hw * 0.46;
	const hy = base - hh / 2 - hl - 16;
	let hg = `<g transform="translate(${n(hx)} ${n(hy)}) rotate(${ht})">`;
	hg += taper([[-hw * 0.2, -hh * 0.46], [-hw * 0.22, -hh * 0.9], [-hw * 0.23, -hh * 1.3]], 9, 5);
	hg += diamond(-hw * 0.23, -hh * 1.4, 12, C.rose, 5, 0);
	hg += taper([[hw * 0.1, -hh * 0.48], [hw * 0.12, -hh * 0.86], [hw * 0.38, -hh * 1.0], [hw * 0.5, -hh * 0.84]], 9, 5);
	hg += `<circle cx="${n(hw * 0.52)}" cy="${n(-hh * 0.8)}" r="9" fill="${mode.sil ? INK : C.sky}" stroke="${INK}" stroke-width="5"/>`;
	hg += taper([[-hw * 0.2, hh * 0.44], [-hw * 0.22, hh * 0.6], [-hw * 0.2, hh * 0.68]], 11, 8);
	hg += taper([[hw * 0.12, hh * 0.44], [hw * 0.14, hh * 0.58], [hw * 0.2, hh * 0.64]], 11, 8);
	const pin = roundPoly([[-hw / 2, -hh / 2], [hw * 0.08, -hh / 2], [hw * 0.54, 0], [hw * 0.08, hh / 2], [-hw / 2, hh / 2]], [26, 14, 12, 14, 26], 29, 3);
	hg += shape(pin, C.sunny, { sw: 8.5, off: [3.5, 6] });
	if (!mode.sil) {
		hg += `<path d="M${n(-hw * 0.46)},${n(hh * 0.32)} C${n(-hw * 0.2)},${n(hh * 0.5)} ${n(hw * 0.2)},${n(hh * 0.5)} ${n(hw * 0.46)},${n(hh * 0.14)} L${n(hw * 0.4)},${n(hh * 0.3)} C${n(hw * 0.16)},${n(hh * 0.44)} ${n(-hw * 0.2)},${n(hh * 0.44)} ${n(-hw * 0.46)},${n(hh * 0.34)}Z" fill="#f2a91c" opacity=".7"/>`;
		const lk = P.look;
		hg += eye(-hw * 0.08, -hh * 0.1, hw * 0.2, hh * 0.25, { look: lk, pr: hw * 0.11, sw: 6 });
		hg += eye(hw * 0.27, -hh * 0.14, hw * 0.15, hh * 0.19, { look: lk, pr: hw * 0.08, sw: 5.5 });
		hg += taper([[-hw * 0.26, -hh * 0.4], [-hw * 0.07, -hh * 0.46], [hw * 0.06, -hh * 0.4]], 3, 9);
		hg += taper([[hw * 0.18, -hh * 0.52], [hw * 0.32, -hh * 0.5], [hw * 0.42, -hh * 0.36]], 9, 3);
		hg += `<path d="${wobble(hw * 0.14, hh * 0.24, 9, 11, 5, 0.1, 0, 7)}" fill="${INK}"/>`;
	}
	hg += `</g>`;
	out += hg;
	out += groundMark(20, 470, base + 26, 6, 0.1);
	//fit the strip into the canvas whatever the pose
	const right = hx + hw * 0.62, left = 12;
	const sc = Math.min(1, 470 / (right - left));
	const tx = 20 - left * sc + (470 - (right - left) * sc) / 2;
	return `<g transform="translate(${n(tx)} ${n(440 - 440 * sc)}) scale(${n(sc)})">${out}</g>`;
}
export function icon() {
	let s = `<rect width="512" height="512" rx="112" fill="#2a2638"/>`;
	const bar = (x, y, w, h, fill, seed) => shape(roundPoly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], [30, 30, 30, 30], seed, 3), fill, { sw: 14, off: [4, 8] });
	s += bar(38, 296, 78, 110, C.rose, 3);
	s += bar(140, 252, 104, 154, C.peach, 8);
	s += taper([[112, 346], [128, 347], [144, 346]], 10, 10).replace(/<circle[^>]*\/>/g, '');
	s += taper([[238, 346], [254, 347], [270, 346]], 10, 10).replace(/<circle[^>]*\/>/g, '');
	s += diamond(128, 346, 20, C.sky, 8, 0) + diamond(254, 346, 20, C.sky, 8, 0);
	s += `<g transform="translate(372 270) rotate(4)">`;
	s += taper([[-44, -92], [-46, -150], [-48, -196]], 14, 8);
	s += diamond(-48, -210, 18, C.rose, 8, 0);
	s += shape(roundPoly([[-100, -100], [20, -100], [112, 0], [20, 100], [-100, 100]], [40, 24, 20, 24, 40], 29, 4), C.sunny, { sw: 15, off: [5, 9] });
	s += eye(-24, -16, 46, 54, { look: [0.7, -0.4], pr: 28, sw: 10 });
	s += eye(56, -22, 31, 38, { look: [0.7, -0.4], pr: 19, sw: 9 });
	s += taper([[-62, -66], [-26, -76], [0, -64]], 5, 17);
	s += `<path d="${wobble(24, 52, 14, 17, 5, 0.1, 0, 7)}" fill="${INK}"/>`;
	s += `</g>`;
	return s;
}

export function pixel() {
	const P = pixelCanvas(32);
	const bar = (x0, y0, x1, y1, c) => P.seg((x, y) => x > x0 && x < x1 && y > y0 && y < y1 && !((x < x0 + 1.6 || x > x1 - 1.6) && (y < y0 + 1.6 || y > y1 - 1.6)), c);
	bar(1, 18, 7.5, 28, C.rose);
	bar(9.5, 15, 17.5, 28, C.peach);
	//keyframe diamonds in the gaps
	for (const [x, y] of [[8, 23], [8.5, 23]].slice(0, 1)) { for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) P.px(x + dx, y + dy, C.sky); }
	//head: pentagon pointing right
	P.seg((x, y) => x > 17 && x < 31 && y > 9 && y < 27.5 && (x < 25 || Math.abs(y - 18.2) <= (31 - x) * 1.45 + 0.3), C.sunny);
	P.rect(19, 13, 3, 4, PAPER); P.rect(20, 14, 2, 3, INK);
	P.rect(24, 13, 3, 3, PAPER); P.rect(25, 14, 2, 2, INK);
	P.line(19, 12, 22, 12, INK); P.line(24, 11, 27, 12, INK);
	P.px(24, 20, INK); P.px(25, 20, INK); P.px(24, 21, INK); P.px(25, 21, INK);
	//playhead line antenna and curl
	P.line(19, 8, 19, 3, INK); P.px(19, 2, C.rose); P.px(18, 3, C.rose); P.px(20, 3, C.rose); P.px(19, 1, C.rose);
	P.line(25, 8, 26, 5, INK); P.px(27, 4, C.sky);
	//tick legs
	for (const x of [3, 5, 11, 14]) P.rect(x, 29, 1, 2, INK);
	P.rect(20, 28, 1, 2, INK); P.rect(25, 28, 1, 2, INK);
	return P;
}
