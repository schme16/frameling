// c3 "Stub": a chunky, scruffy, slightly smudged caterpillar whose tail is a worn-down coloured pencil.
// It rears up to see what you are drawing, and the graphite tip is still dragging a line along the ground.
// The thin blue arc through its back is the animator's line of action, left in from the first sketch.
import { INK, PAPER, C, mode, n, shape, taper, wobble, diamond, eye, frame, groundMark, pixelCanvas, arcTable, atDistance, rng, smooth, svg } from './lib.mjs';

export const POSES = {
	hero: { P: [[0, 0], [140, 40], [250, 10], [262, -170]], tilt: 4, sc: 0.84 },
	squash: { P: [[0, 0], [30, -170], [220, -210], [250, -20]], tilt: 4, sc: 0.9 },
	stretch: { P: [[0, 0], [150, 30], [300, 20], [460, -40]], tilt: 14, sc: 0.74 },
};
const WID = [100, 106, 104];
const HGT = [96, 104, 108];
const FILL = [C.rose, C.peach, C.rose];
const PEN = 112; //how far the pencil sticks out behind the first segment centre

function chain() {
	const c = [];
	let d = 40;
	for (let i = 0; i < 3; i++) {
		c.push(d);
		const nw = i < 2 ? WID[i + 1] : 150;
		d += ((WID[i] + nw) / 2) * 0.8;
	}
	return { frames: c, head: d };
}

//short flicks along the back so it looks scruffy and hand-inked, not squeaky clean
function fuzz(w, h, seed, count = 4) {
	const r = rng(seed);
	let s = '';
	for (let i = 0; i < count; i++) {
		const x = -w * 0.34 + (i / (count - 1)) * w * 0.68 + (r() - 0.5) * 8;
		const y = -h * 0.5 + 4;
		const len = 12 + r() * 12;
		const lean = (r() - 0.4) * 18;
		s += taper([[x, y + 2], [x + lean * 0.4, y - len * 0.6], [x + lean, y - len]], 7, 1.5);
	}
	return s;
}

function hatch(w, h, seed) {
	if (mode.sil) return '';
	const r = rng(seed);
	let s = '';
	for (let i = 0; i < 4; i++) {
		const x = w * 0.02 + i * 9 + r() * 3;
		s += `<path d="M${n(x)},${n(h * 0.14)} l${n(-12 + r() * 3)},${n(22 + r() * 5)}" stroke="${INK}" stroke-width="${2.5 + r() * 1.5}" stroke-linecap="round" opacity=".4" fill="none"/>`;
	}
	return s;
}

function pencil() {
	//local x runs along the body, the stub points to negative x
	let s = '';
	const barrel = 'M-6,-30 C-30,-33 -62,-31 -88,-31 L-88,31 C-62,32 -30,33 -6,30 C0,12 2,-12 -6,-30Z';
	s += shape(barrel, C.grape, { sw: 8, off: [2, 5] });
	if (!mode.sil) {
		//paint ridge highlights, uneven
		s += taper([[-14, -14], [-50, -17], [-82, -15]], 3, 6, PAPER, 'opacity=".55"');
		s += taper([[-14, 18], [-52, 20], [-82, 19]], 6, 3, INK, 'opacity=".25"');
		//dented ferrule band where it meets the body
		s += `<path d="M-6,-30 C-2,-12 -1,12 -6,30 L-20,31 C-14,12 -15,-12 -20,-31Z" fill="${C.sunny}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
		s += `<path d="M-12,-24 l-1,48" stroke="${INK}" stroke-width="3" opacity=".4"/>`;
	}
	//wood cone with the zigzag where the paint stops
	const cone = 'M-88,-31 L-96,-22 L-90,-16 L-99,-8 L-92,-2 L-100,6 L-93,13 L-98,20 L-90,25 L-92,31 L-132,9 C-138,4 -138,-4 -132,-9Z';
	s += shape(cone, '#ffd9b3', { sw: 6.5, off: [2, 4] });
	if (!mode.sil) s += `<path d="M-120,-9 L-132,-9 C-138,-4 -138,4 -132,9 L-120,9Z" fill="${INK}"/>`;
	s += `<path d="M-120,-9 C-146,-5 -150,5 -148,12 C-146,18 -130,12 -120,9Z" fill="${INK}"/>`;
	return s;
}

export function draw(poseName = 'hero') {
	const pose = POSES[poseName];
	const ch = chain();
	const raw = arcTable(pose.P);
	const k = (ch.head + 30) / raw.total;
	let P = pose.P.map(([x, y]) => [x * k, y * k]);
	//tail on the ground at left, shifted so the pencil tip stays on canvas
	const dx = (poseName === 'stretch' ? 140 : poseName === 'squash' ? 200 : 166) - P[0][0];
	P = P.map(([x, y]) => [x + dx, y + 360]);
	const tab = arcTable(P);
	let out = '';
	const t0 = atDistance(tab, 6);
	const ground = 436;
	let penTip = [0, 0];
	if (!mode.sil) out += groundMark(t0.p[0] - 60, t0.p[0] + 160, ground + 6, 4, 0.12);
	//pencil stub: joins the spine just behind the first segment
	{
		const a = atDistance(tab, 14);
		const deg = (a.ang * 180) / Math.PI;
		out += `<g transform="translate(${n(a.p[0] + 6)} ${n(ground - 30)}) rotate(-7)">${pencil()}</g>`;
		penTip = [a.p[0] + 6 - 148, ground - 30 + 18];
	}
	if (!mode.sil) {
		const [tx, ty] = penTip;
		out += taper([[tx + 4, ty], [tx - 30, ty + 5], [tx - 62, ty - 4], [tx - 100, ty + 3]], 7, 1.5, INK, 'opacity=".55"').replace(/<circle[^>]*\/>/g, '');
		out += taper([[tx - 50, ty + 10], [tx - 78, ty + 6], [tx - 104, ty + 11]], 1.5, 4, INK, 'opacity=".25"').replace(/<circle[^>]*\/>/g, '');
	}
	for (let i = 0; i < 3; i++) {
		const { p, ang } = atDistance(tab, ch.frames[i]);
		const w = WID[i], h = HGT[i];
		const deg = (ang * 180) / Math.PI;
		let g = `<g transform="translate(${n(p[0])} ${n(p[1])}) rotate(${n(deg)})">`;
		g += taper([[-16, h / 2 - 4], [-20, h / 2 + 10], [-8, h / 2 + 15]], 14, 11);
		g += taper([[18, h / 2 - 4], [18, h / 2 + 9], [30, h / 2 + 13]], 14, 11);
		g += fuzz(w, h, 40 + i * 7, 4);
		g += shape(frame(w, h, 38, 21 + i * 4, 3.5), FILL[i], { sw: 8, off: [3, 6] });
		g += hatch(w, h, 30 + i);
		if (!mode.sil && i === 1) g += `<path d="${wobble(-8, 8, 26, 18, 3, 0.1, 0.3, 8)}" fill="${INK}" opacity=".12"/>`;
		g += `</g>`;
		out += g;
	}
	//line of action
	if (!mode.sil) {
		const loa = [tab.pts[0].p, tab.pts[Math.floor(tab.pts.length * 0.35)].p, tab.pts[Math.floor(tab.pts.length * 0.7)].p, tab.pts[tab.pts.length - 1].p];
		out += `<path d="${smooth(loa.map((p) => [p[0] + 4, p[1] - 4]), false)}" fill="none" stroke="${C.sky}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="14 7" opacity=".9"/>`;
	}
	//head
	const hd = atDistance(tab, ch.head);
	const hdeg = (hd.ang * 180) / Math.PI * 0.4 + pose.tilt;
	let hg = `<g transform="translate(${n(hd.p[0] + 4)} ${n(hd.p[1] - 8)}) rotate(${n(hdeg)})">`;
	hg += taper([[-30, 64], [-36, 82], [-22, 90]], 15, 11);
	hg += taper([[24, 64], [26, 82], [42, 88]], 15, 11);
	//tuft: three flicks that never lie flat
	hg += taper([[-16, -66], [-26, -92], [-48, -98]], 10, 2);
	hg += taper([[4, -68], [2, -98], [-12, -118]], 10, 2);
	hg += taper([[22, -64], [38, -88], [62, -86]], 10, 2);
	hg += shape(frame(152, 140, 44, 77, 4.5), C.sunny, { sw: 9, off: [3.5, 7] });
	if (!mode.sil) {
		hg += `<path d="M-64,50 C-30,64 30,66 62,42 C56,58 40,68 14,70 C-18,72 -48,66 -64,50Z" fill="#f2a91c" opacity=".8"/>`;
		hg += hatch(120, 140, 91).replace(/<path/g, '<path transform="translate(26 6)"');
		//eyes: big round one, small squinting one
		hg += eye(-26, -12, 30, 33, { look: [0.5, 0.3], pr: 16, sw: 6.5 });
		hg += eye(34, -18, 20, 22, { look: [0.5, 0.3], pr: 11, sw: 6, lid: 0.5, lidTilt: -3, rot: -6 });
		hg += taper([[-56, -50], [-26, -58], [-2, -48]], 3, 11);
		//grin with a gap tooth
		hg += `<path d="M-30,30 C-6,52 36,50 54,22 C34,36 0,40 -30,30Z" fill="${INK}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
		hg += `<path d="M8,38 L8,47 L20,46 L20,36Z" fill="${PAPER}"/>`;
		//a smear of graphite from someone's thumb
		hg += `<path d="${wobble(50, 40, 20, 12, 5, 0.12, -0.3, 8)}" fill="${INK}" opacity=".14"/>`;
	}
	hg += `</g>`;
	out += hg;
	return `<g transform="translate(256 436) scale(${pose.sc}) translate(-256 -436)">${out}</g>`;
}

export function icon() {
	let s = `<rect width="512" height="512" rx="112" fill="#2a2638"/>`;
	//pencil stub poking out the back, tip on the floor
	s += `<g transform="translate(196 408) rotate(-10) scale(1.08)">${pencil()}</g>`;
	s += `<g transform="translate(224 334) rotate(-6)">${shape(frame(146, 138, 54, 4, 4), C.rose, { sw: 14, off: [4, 8] })}</g>`;
	s += `<g transform="translate(340 244) rotate(6)">`;
	s += taper([[-30, -112], [-44, -150], [-76, -158]], 15, 3);
	s += taper([[8, -114], [6, -156], [-8, -180]], 15, 3);
	s += taper([[44, -108], [64, -146], [96, -142]], 15, 3);
	s += shape(frame(224, 208, 64, 7, 5), C.sunny, { sw: 15, off: [5, 10] });
	s += eye(-46, -14, 52, 57, { look: [0.5, 0.35], pr: 30, sw: 10 });
	s += eye(54, -22, 34, 38, { look: [0.5, 0.35], pr: 21, sw: 9, lid: 0.45, lidTilt: -4, rot: -6, lidSw: 8 });
	s += taper([[-84, -76], [-44, -88], [-8, -72]], 4, 17);
	s += `<path d="M-42,44 C-10,76 54,72 80,30 C52,52 8,58 -42,44Z" fill="${INK}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`;
	s += `<path d="M14,58 L14,72 L32,70 L32,53Z" fill="${PAPER}"/>`;
	s += `</g>`;
	return s;
}

export function pixel() {
	const P = pixelCanvas(32);
	const ell = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
	const rr = (x0, y0, x1, y1) => (x, y) => x > x0 && x < x1 && y > y0 && y < y1 && !((x < x0 + 1.6 || x > x1 - 1.6) && (y < y0 + 1.6 || y > y1 - 1.6));
	//graphite line dragged along the floor
	P.line(0, 28, 3, 28, '#4a4658'); P.px(1, 27, '#4a4658');
	//pencil: wood cone, graphite tip, grape barrel
	P.seg((x, y) => x > 3 && x < 8 && y > 22.5 && y < 28 && (x - 3) > Math.abs(y - 25.2) * 1.1, '#ffd9b3');
	P.px(4, 25, INK);
	P.seg((x, y) => x > 7 && x < 13 && y > 22 && y < 28, C.grape);
	P.line(8, 23, 11, 23, PAPER);
	P.rect(12, 23, 1, 4, C.sunny);
	//body
	P.seg(ell(15.5, 23.5, 4, 3.8), C.rose);
	P.seg(ell(20.5, 23, 4.2, 4.4), C.peach);
	//head
	P.seg((x, y) => x > 18.5 && x < 30.5 && y > 7 && y < 21 && !((x < 20 || x > 29) && (y < 8.5 || y > 19.5)), C.sunny);
	//tuft
	P.px(21, 6, INK); P.px(20, 5, INK); P.px(24, 6, INK); P.px(24, 5, INK); P.px(25, 4, INK); P.px(28, 6, INK); P.px(29, 5, INK);
	//eyes: one big, one squinting
	P.rect(20, 10, 4, 4, PAPER); P.rect(21, 11, 2, 3, INK);
	P.rect(26, 10, 3, 3, PAPER); P.px(27, 11, INK); P.px(28, 11, INK); P.line(26, 10, 28, 10, C.sunny);
	P.line(25, 9, 29, 9, INK); P.line(20, 9, 23, 8, INK);
	//grin and gap tooth
	P.line(21, 16, 28, 16, INK); P.px(29, 15, INK); P.px(20, 15, INK); P.line(22, 17, 27, 17, INK);
	P.px(24, 17, PAPER); P.px(25, 17, PAPER);
	//feet
	P.rect(14, 27, 2, 1, INK); P.rect(19, 27, 2, 1, INK); P.rect(24, 21, 0, 0, INK);
	return P;
}
