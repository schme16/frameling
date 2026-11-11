// c4 "Rez": born as pixels, and the further along it gets the smoother it is. The tail is a handful of big
// blocks, each segment after it has a finer grid, and the head is finished vector. Its antennae do the same trick.
// Resolution as the character: that is the whole product, raw sketch to clean art, in one creature.
import { INK, PAPER, C, mode, n, shape, taper, wobble, diamond, eye, groundMark, pixelCanvas, rng } from './lib.mjs';

//cx, cy, rx, ry, grid size (0 = smooth). tail first, head last
export const POSES = {
	hero: { s: [[96, 372, 50, 48, 5], [188, 350, 56, 52, 8], [282, 320, 62, 58, 13], [382, 272, 76, 72, 0]], tilt: -6, look: [0.7, -0.4] },
	crouch: { s: [[132, 380, 52, 38, 5], [216, 370, 58, 46, 8], [300, 356, 64, 52, 13], [396, 340, 82, 62, 0]], tilt: 4, look: [0.3, 0.5] },
	stretch: { s: [[78, 388, 42, 42, 5], [160, 372, 48, 46, 8], [250, 350, 54, 52, 13], [372, 298, 66, 78, 0]], tilt: -12, look: [0.8, -0.6] },
};
const COL = [C.grape, C.rose, C.peach];

//a pixel circle with n cells across, the classic way: cell centres inside the ellipse
function cells(nx, ny) {
	const out = [];
	for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
		const ci = i + 0.5 - nx / 2, cj = j + 0.5 - ny / 2;
		if ((ci / (nx / 2)) ** 2 + (cj / (ny / 2)) ** 2 <= 1.04) out.push([i, j]);
	}
	return out;
}
const runs = (cs, g, ox, oy, test = () => true) => {
	const rows = {};
	for (const [i, j] of cs) if (test(i, j)) (rows[j] ??= []).push(i);
	let d = '';
	for (const j of Object.keys(rows)) {
		const r = rows[j].sort((a, b) => a - b);
		let a = r[0], b = r[0];
		const flush = () => (d += `M${n(ox + a * g)},${n(oy + j * g)}h${(b - a + 1) * g}v${g}h${-(b - a + 1) * g}z`);
		for (let k = 1; k < r.length; k++) { if (r[k] === b + 1) b = r[k]; else { flush(); a = b = r[k]; } }
		flush();
	}
	return d;
};

function pixelSeg(sg, col, i) {
	const [cx, cy, rx, ry, nx] = sg;
	const g = Math.round((rx * 2) / nx);
	const ny = Math.max(2, Math.round((ry * 2) / g));
	const ox = Math.round(cx - (nx * g) / 2), oy = Math.round(cy - (ny * g) / 2);
	const cs = cells(nx, ny);
	const set = new Set(cs.map(([a, b]) => a + ',' + b));
	const all = runs(cs, g, ox, oy);
	let s = `<g shape-rendering="crispEdges">`;
	for (const f of [0.22, 0.62]) {
		const gi = Math.round(f * nx);
		s += `<rect x="${ox + gi * g}" y="${oy + ny * g - 4}" width="${Math.max(g, 12)}" height="${g > 15 ? 15 : 11}" fill="${INK}"/>`;
	}
	s += `<path d="${all}" fill="${INK}" stroke="${INK}" stroke-width="${g > 20 ? 14 : 11}" stroke-linejoin="miter"/>`;
	s += `<path d="${all}" fill="${mode.sil ? INK : col}"/>`;
	if (!mode.sil) {
		//one row of shade along the underside, like a pixel artist would
		const shade = runs(cs, g, ox, oy, (a, b) => !set.has(a + ',' + (b + 1)));
		s += `<path d="${shade}" fill="${INK}" opacity=".2"/>`;
	}
	return s + `</g>`;
}

//loose pixels drifting off the tail end, getting smaller
function dust(sg) {
	if (mode.sil) return '';
	const [cx, cy, rx, ry] = sg;
	let s = '';
	const spec = [[-rx - 36, -ry * 0.15, 20, C.grape, 1], [-rx - 62, ry * 0.35, 14, C.grape, 0.85], [-rx - 28, ry * 0.8, 12, C.grape, 0.7], [-rx - 86, -ry * 0.4, 10, C.grape, 0.6], [-rx - 96, ry * 0.05, 8, C.grape, 0.45]];
	for (const [dx, dy, z, c, a] of spec) {
		const x = Math.round((cx + dx) / 2) * 2, y = Math.round((cy + dy) / 2) * 2;
		s += `<rect x="${x}" y="${y}" width="${z}" height="${z}" fill="${INK}" opacity="${a}" shape-rendering="crispEdges"/><rect x="${x + 3}" y="${y + 3}" width="${z - 6}" height="${z - 6}" fill="${c}" opacity="${a}" shape-rendering="crispEdges"/>`;
	}
	return s;
}

function stepAntenna(x0, y0) {
	//blocks that shrink and wander, ending in a diamond that is actually smooth
	let s = '';
	const pts = [[0, 0, 16], [10, -20, 13], [22, -38, 10], [38, -50, 8]];
	s += `<g shape-rendering="crispEdges">`;
	for (const [dx, dy, z] of pts) s += `<rect x="${x0 + dx - z / 2 - 3}" y="${y0 + dy - z / 2 - 3}" width="${z + 6}" height="${z + 6}" fill="${INK}"/>`;
	for (const [dx, dy, z] of pts) s += `<rect x="${x0 + dx - z / 2}" y="${y0 + dy - z / 2}" width="${z}" height="${z}" fill="${mode.sil ? INK : C.sky}"/>`;
	s += `</g>`;
	s += diamond(x0 + 56, y0 - 64, 14, C.rose, 5, 0);
	return s;
}

export function draw(poseName = 'hero') {
	const pose = POSES[poseName];
	let out = '';
	out += groundMark(40, 300, 440, 3, 0.15) + groundMark(330, 480, 442, 6, 0.12);
	out += dust(pose.s[0]);
	for (let i = 0; i < 3; i++) out += pixelSeg(pose.s[i], COL[i], i);
	//head
	const [hx, hy, rx, ry] = pose.s[3];
	let h = `<g transform="translate(${hx} ${hy}) rotate(${pose.tilt})">`;
	h += taper([[-rx * 0.5, ry * 0.7], [-rx * 0.52, ry * 1.02], [-rx * 0.36, ry * 1.1]], 14, 10);
	h += taper([[rx * 0.25, ry * 0.75], [rx * 0.28, ry * 1.0], [rx * 0.46, ry * 1.06]], 14, 10);
	h += taper([[-rx * 0.2, -ry * 0.8], [-rx * 0.32, -ry * 1.3], [-rx * 0.6, -ry * 1.5]], 9, 4);
	h += `<circle cx="${n(-rx * 0.66)}" cy="${n(-ry * 1.55)}" r="9" fill="${mode.sil ? INK : C.rose}" stroke="${INK}" stroke-width="5"/>`;
	h += `<g transform="translate(${n(rx * 0.26)} ${n(-ry * 0.74)}) rotate(4)">${stepAntenna(0, 0)}</g>`;
	h += shape(wobble(0, 0, rx, ry, 17, 0.03, 0, 12), C.sunny, { sw: 8, off: [3.5, 6] });
	if (!mode.sil) {
		h += `<path d="M${n(-rx * 0.82)},${n(ry * 0.3)} C${n(-rx * 0.4)},${n(ry * 0.95)} ${n(rx * 0.5)},${n(ry * 0.95)} ${n(rx * 0.86)},${n(ry * 0.24)} C${n(rx * 0.6)},${n(ry * 0.7)} ${n(-rx * 0.2)},${n(ry * 0.82)} ${n(-rx * 0.82)},${n(ry * 0.3)}Z" fill="#f2a91c" opacity=".75"/>`;
		const lk = pose.look;
		h += eye(-rx * 0.1, -ry * 0.1, rx * 0.3, ry * 0.36, { look: lk, pr: rx * 0.17, sw: 6 });
		h += eye(rx * 0.5, -ry * 0.2, rx * 0.22, ry * 0.26, { look: lk, pr: rx * 0.12, sw: 5.5 });
		//square glints: the pixel shows up even in the finished eye
		h += `<rect x="${n(-rx * 0.1 + rx * 0.04)}" y="${n(-ry * 0.1 - ry * 0.22)}" width="9" height="9" fill="${PAPER}"/>`;
		h += taper([[-rx * 0.32, -ry * 0.58], [-rx * 0.1, -ry * 0.66], [rx * 0.1, -ry * 0.6]], 3, 9);
		h += taper([[rx * 0.34, -ry * 0.7], [rx * 0.52, -ry * 0.62], [rx * 0.66, -ry * 0.46]], 9, 3);
		h += `<path d="M${n(-rx * 0.02)},${n(ry * 0.32)} C${n(rx * 0.18)},${n(ry * 0.56)} ${n(rx * 0.5)},${n(ry * 0.5)} ${n(rx * 0.6)},${n(ry * 0.22)}" fill="none" stroke="${INK}" stroke-width="6.5" stroke-linecap="round"/>`;
	}
	h += `</g>`;
	out += h;
	return out;
}
export function icon() {
	let s = `<rect width="512" height="512" rx="112" fill="#2a2638"/>`;
	s += pixelSeg([82, 380, 51, 51, 3], C.grape, 0);
	s += pixelSeg([186, 352, 87, 87, 5], C.rose, 1);
	s += `<g transform="translate(336 258) rotate(-5)">`;
	s += taper([[-30, -110], [-48, -168], [-90, -186]], 16, 6);
	s += `<circle cx="-98" cy="-190" r="15" fill="${C.sky}" stroke="${INK}" stroke-width="9"/>`;
	s += `<g shape-rendering="crispEdges"><rect x="42" y="-166" width="30" height="30" fill="${INK}"/><rect x="48" y="-160" width="18" height="18" fill="${C.sky}"/><rect x="76" y="-196" width="24" height="24" fill="${INK}"/><rect x="82" y="-190" width="12" height="12" fill="${C.sky}"/></g>`;
	s += diamond(122, -214, 20, C.rose, 8, 0);
	s += shape(wobble(0, 0, 138, 132, 17, 0.03, 0, 12), C.sunny, { sw: 15, off: [5, 9] });
	s += eye(-38, -8, 50, 57, { look: [0.7, -0.3], pr: 30, sw: 10 });
	s += eye(66, -22, 35, 42, { look: [0.7, -0.3], pr: 22, sw: 9 });
	s += taper([[-76, -66], [-34, -76], [0, -66]], 5, 17);
	s += `<rect x="-30" y="-44" width="14" height="14" fill="${PAPER}"/>`;
	s += `<path d="M-22,52 C10,82 62,72 88,32" fill="none" stroke="${INK}" stroke-width="14" stroke-linecap="round"/>`;
	s += `</g>`;
	return s;
}

export function pixel() {
	const P = pixelCanvas(32);
	//same blocky quantising as the big one: coarser blocks the further back
	const blocky = (cx, cy, rx, ry, bs) => (x, y) => {
		const bx = (Math.floor((x - cx + rx + bs * 4) / bs) * bs) - bs * 4 + bs / 2 + cx - rx;
		const by = (Math.floor((y - cy + ry + bs * 4) / bs) * bs) - bs * 4 + bs / 2 + cy - ry;
		return ((bx - cx) / rx) ** 2 + ((by - cy) / ry) ** 2 <= 1.05;
	};
	P.seg(blocky(4.5, 23.5, 3.5, 3.5, 3), C.grape);
	P.seg(blocky(10, 22.5, 4.2, 4.2, 2), C.rose);
	//finer one gets a shade row, like it has been through more passes
	P.seg(blocky(16, 21, 4.8, 5, 1), C.peach);
	for (let x = 12; x < 20; x++) if (P.get(x, 25) === C.peach) P.px(x, 25, '#e0825a');
	//head: smooth as pixels get, with AA-ish step pixels on the edge
	P.seg((x, y) => ((x - 23.5) / 6.8) ** 2 + ((y - 15.5) / 7.2) ** 2 <= 1, C.sunny);
	for (let x = 18; x < 30; x++) if (P.get(x, 21) === C.sunny) P.px(x, 21, '#f2a91c');
	for (let x = 18; x < 30; x++) if (P.get(x, 22) === C.sunny) P.px(x, 22, '#f2a91c');
	P.rect(20, 12, 3, 4, PAPER); P.rect(21, 12, 2, 2, INK); P.px(21, 14, INK); P.px(22, 14, INK);
	P.rect(25, 12, 3, 3, PAPER); P.rect(26, 12, 2, 2, INK);
	P.line(20, 10, 23, 10, INK); P.line(25, 10, 28, 11, INK);
	P.line(22, 18, 24, 19, INK); P.line(25, 19, 27, 17, INK);
	//antennae: one smooth-ish, one blocks
	P.line(20, 8, 19, 5, INK); P.px(18, 4, C.rose);
	P.px(26, 7, INK); P.px(27, 6, INK); P.px(28, 5, INK); P.px(29, 4, C.sky); P.px(28, 3, C.rose); P.px(29, 3, C.rose);
	//feet and floating dust at the tail
	P.rect(4, 27, 2, 1, INK); P.rect(10, 27, 2, 1, INK); P.rect(16, 27, 2, 1, INK); P.rect(22, 23, 0, 0, INK);
	P.px(0, 21, C.grape); P.px(1, 19, C.grape);
	return P;
}
