// c2 "Onion": the caterpillar is its own onion skin. One solid head leads; every body segment is an earlier
// frame of that same head, fainter and further back, squashed and stretched on its way. The ground is a
// timeline track with a keyframe diamond under each frame, and wider gaps mean it is going faster.
import { INK, PAPER, C, mode, n, shape, taper, wobble, diamond, groundMark, pixelCanvas, svg, rng } from './lib.mjs';

//x centre, width, height, lift off the ground, tilt degrees. the last one is the live head
export const POSES = {
	hero: [[110, 84, 70, 0, -4], [188, 98, 104, 0, 5], [270, 116, 88, 0, -2], [376, 136, 126, 0, 5]],
	crouch: [[150, 98, 56, 0, -2], [196, 104, 62, 0, 0], [244, 112, 66, 0, 2], [330, 152, 86, 0, 6]],
	stretch: [[64, 66, 82, 0, -8], [162, 80, 98, 6, -2], [286, 96, 112, 30, 6], [412, 112, 138, 58, 12]],
};
const GHOST_COL = [C.grape, C.rose, C.peach];
const ALPHA = [0.3, 0.5, 0.72];

function face(w, h, look, sil) {
	//eyes sit on the upper right of the head so the face leans into the direction of travel
	let s = '';
	const ew = w * 0.17, eh = h * 0.2;
	s += `<ellipse cx="${n(w * 0.02)}" cy="${n(-h * 0.1)}" rx="${n(ew * 1.0)}" ry="${n(eh * 1.15)}" fill="${PAPER}" stroke="${INK}" stroke-width="5.5"/>`;
	s += `<ellipse cx="${n(w * 0.32)}" cy="${n(-h * 0.16)}" rx="${n(ew * 0.8)}" ry="${n(eh * 0.95)}" fill="${PAPER}" stroke="${INK}" stroke-width="5.5"/>`;
	//pupils look back over the shoulder at the trail
	s += `<ellipse cx="${n(w * 0.02 + look[0] * ew * 0.45)}" cy="${n(-h * 0.1 + look[1] * eh * 0.4)}" rx="${n(ew * 0.55)}" ry="${n(eh * 0.7)}" fill="${INK}"/>`;
	s += `<ellipse cx="${n(w * 0.32 + look[0] * ew * 0.4)}" cy="${n(-h * 0.16 + look[1] * eh * 0.4)}" rx="${n(ew * 0.45)}" ry="${n(eh * 0.58)}" fill="${INK}"/>`;
	s += `<circle cx="${n(w * 0.02 + look[0] * ew * 0.45 + ew * 0.18)}" cy="${n(-h * 0.1 + look[1] * eh * 0.4 - eh * 0.25)}" r="${n(ew * 0.16)}" fill="${PAPER}"/>`;
	//heavy slanted lids: mischief
	s += taper([[-w * 0.2, -h * 0.34], [w * 0.05, -h * 0.3], [w * 0.17, -h * 0.2]], 3, 11);
	s += taper([[w * 0.2, -h * 0.35], [w * 0.4, -h * 0.34], [w * 0.5, -h * 0.4]], 11, 3);
	//smirk that runs up the right cheek
	s += `<path d="M${n(-w * 0.08)},${n(h * 0.22)} C${n(w * 0.1)},${n(h * 0.3)} ${n(w * 0.3)},${n(h * 0.3)} ${n(w * 0.42)},${n(h * 0.14)}" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
	s += `<path d="M${n(w * 0.42)},${n(h * 0.14)} l${n(w * 0.05)},${n(-h * 0.06)}" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`;
	return s;
}

//one frame of the head sitting on the ground
function frameAt(f, i, live, seed) {
	const [x, w, h, lift, tilt] = f;
	const cy = 420 - lift - h / 2 - 6;
	const d = wobble(0, 0, w / 2, h / 2, seed, live ? 0.03 : 0.025, 0, 11);
	let s = `<g transform="translate(${n(x)} ${n(cy)}) rotate(${tilt})">`;
	if (live) {
		//feet first, then the body over them
		s += taper([[-w * 0.2, h / 2 - 8], [-w * 0.24, h / 2 + 8], [-w * 0.12, h / 2 + 16]], 14, 10);
		s += taper([[w * 0.2, h / 2 - 8], [w * 0.22, h / 2 + 8], [w * 0.34, h / 2 + 14]], 14, 10);
		//antennae: one stiff, one lagging behind like it was caught mid-swing, with a keyframe diamond
		s += taper([[-w * 0.12, -h * 0.46], [-w * 0.2, -h * 0.82], [-w * 0.46, -h * 0.98]], 9, 4);
		s += `<circle cx="${n(-w * 0.5)}" cy="${n(-h * 1.0)}" r="9" fill="${mode.sil ? INK : C.rose}" stroke="${INK}" stroke-width="5"/>`;
		s += taper([[w * 0.2, -h * 0.46], [w * 0.3, -h * 0.9], [w * 0.52, -h * 1.0]], 9, 4);
		s += diamond(w * 0.57, -h * 1.02, 13, C.sky, 5, 15);
		s += shape(d, C.sunny, { sw: 8, off: [3.5, 6] });
		if (!mode.sil) {
			s += `<path d="M${n(-w * 0.46)},${n(h * 0.22)} C${n(-w * 0.3)},${n(h * 0.5)} ${n(w * 0.2)},${n(h * 0.52)} ${n(w * 0.46)},${n(h * 0.18)} C${n(w * 0.3)},${n(h * 0.4)} ${n(-w * 0.2)},${n(h * 0.42)} ${n(-w * 0.46)},${n(h * 0.22)}Z" fill="#f2a91c" opacity=".7"/>`;
			s += face(w, h, [-0.9, 0.35]);
		}
	} else if (!mode.sil) {
		const col = GHOST_COL[i];
		s = `<g opacity="${ALPHA[i]}">` + s;
		s += taper([[-w * 0.2, h / 2 - 8], [-w * 0.24, h / 2 + 8], [-w * 0.12, h / 2 + 15]], 12, 9);
		s += taper([[w * 0.2, h / 2 - 8], [w * 0.22, h / 2 + 8], [w * 0.34, h / 2 + 13]], 12, 9);
		s += `<path d="${d}" fill="${col}" stroke="${INK}" stroke-width="5"/>`;
		//the ghost of the face: just two dark ovals and a line, like a pencil test
		s += `<ellipse cx="${n(w * 0.02)}" cy="${n(-h * 0.1)}" rx="${n(w * 0.075)}" ry="${n(h * 0.14)}" fill="${INK}" opacity=".7"/><ellipse cx="${n(w * 0.32)}" cy="${n(-h * 0.16)}" rx="${n(w * 0.06)}" ry="${n(h * 0.11)}" fill="${INK}" opacity=".7"/>`;
		return s + `</g></g>`;
	} else {
		s += `<path d="${d}" fill="${INK}"/>`;
	}
	return s + `</g>`;
}

function track(frames) {
	if (mode.sil) return '';
	let s = `<path d="M30,448 C150,451 330,445 484,449" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`;
	for (let x = 44; x < 480; x += 22) s += `<path d="M${x},449 v${(x / 22) % 4 < 1 ? 15 : 8}" stroke="${INK}" stroke-width="${(x / 22) % 4 < 1 ? 4 : 3}" stroke-linecap="round" opacity=".6"/>`;
	for (const f of frames.slice(0, -1)) s += diamond(f[0], 468, 10, C.sky, 4.5, 0);
	s += diamond(frames[frames.length - 1][0], 468, 13, C.sunny, 5, 0);
	return s;
}

export function draw(poseName = 'hero') {
	const fr = POSES[poseName];
	let out = track(fr);
	for (let i = 0; i < fr.length; i++) out += frameAt(fr[i], i, i === fr.length - 1, 5 + i * 7);
	return out;
}
export function extras() { return ''; }

export function icon() {
	let s = `<rect width="512" height="512" rx="112" fill="#2a2638"/>`;
	const ghost = (x, y, w, h, col, a, seed) => `<g opacity="${a}"><path d="${wobble(x, y, w / 2, h / 2, seed, 0.03, 0, 11)}" fill="${col}" stroke="${INK}" stroke-width="10"/></g>`;
	s += ghost(106, 318, 112, 108, C.grape, 0.5, 3);
	s += ghost(196, 306, 150, 144, C.rose, 0.72, 5);
	s += `<g transform="translate(336 286) rotate(5)">`;
	s += taper([[-30, -98], [-46, -148], [-84, -164]], 15, 7);
	s += `<circle cx="-90" cy="-168" r="15" fill="${C.rose}" stroke="${INK}" stroke-width="9"/>`;
	s += taper([[50, -92], [70, -146], [110, -154]], 15, 7);
	s += diamond(118, -158, 20, C.sky, 8, 15);
	s += shape(wobble(0, 0, 134, 124, 9, 0.03, 0, 11), C.sunny, { sw: 14, off: [5, 9] });
	s += `<ellipse cx="-8" cy="-14" rx="40" ry="48" fill="${PAPER}" stroke="${INK}" stroke-width="10"/><ellipse cx="64" cy="-20" rx="30" ry="38" fill="${PAPER}" stroke="${INK}" stroke-width="10"/>`;
	s += `<ellipse cx="-22" cy="-6" rx="23" ry="32" fill="${INK}"/><ellipse cx="54" cy="-10" rx="18" ry="25" fill="${INK}"/>`;
	s += taper([[-42, -58], [-8, -54], [14, -40]], 5, 17);
	s += taper([[40, -52], [66, -56], [86, -68]], 17, 5);
	s += `<path d="M-14,56 C14,72 56,68 82,40" fill="none" stroke="${INK}" stroke-width="13" stroke-linecap="round"/>`;
	s += `</g>`;
	return s;
}

export function pixel() {
	const P = pixelCanvas(32);
	const ell = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
	//ghosts are dithered: a checkerboard of the colour, so they read as see-through
	const ghost = (fn, col) => {
		const m = P.mask(fn);
		const set = new Set(m.map(([x, y]) => x + ',' + y));
		for (const [x, y] of m) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!set.has(x + dx + ',' + (y + dy)) && (x + dx + y + dy) % 2 === 0) P.px(x + dx, y + dy, INK);
		for (const [x, y] of m) if ((x + y) % 2 === 0) P.px(x, y, col); else if (!P.get(x, y)) P.px(x, y, null);
	};
	ghost(ell(4.5, 20.5, 3.6, 3.4), C.grape);
	ghost(ell(9.5, 19.5, 4.6, 4.4), C.rose);
	ghost(ell(15, 18.5, 5.6, 5.4), C.peach);
	P.seg(ell(21.5, 17, 6.6, 6.6), C.sunny);
	//eyes
	P.rect(17, 13, 3, 4, PAPER); P.rect(17, 15, 2, 2, INK);
	P.rect(22, 13, 3, 3, PAPER); P.rect(22, 14, 2, 2, INK);
	P.line(17, 12, 20, 13, INK); P.line(22, 12, 25, 11, INK);
	P.line(18, 21, 23, 22, INK); P.px(24, 21, INK);
	//antennae
	P.line(18, 10, 17, 7, INK); P.px(17, 6, C.rose);
	P.line(25, 10, 27, 7, INK); P.px(27, 6, C.sky); P.px(26, 5, C.sky); P.px(28, 5, C.sky); P.px(27, 4, C.sky);
	//feet
	P.rect(18, 24, 2, 1, INK); P.rect(23, 24, 3, 1, INK);
	//timeline with a diamond per frame
	P.line(1, 27, 29, 27, INK);
	const dia = (x, c) => { P.px(x, 28, c); P.px(x - 1, 29, c); P.px(x + 1, 29, c); P.px(x, 30, c); };
	for (const x of [5, 10, 15]) dia(x, C.sky);
	dia(22, C.sunny);
	return P;
}
