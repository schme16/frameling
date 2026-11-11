// c1 "Inch": an inchworm mid-inch. Every body segment is a film frame, and the little drawing in each
// frame is the worm itself a bit further along its own arch, so the strip animates the creature.
import { INK, PAPER, C, mode, n, shape, detail, taper, frame, wobble, diamond, eye, arcTable, atDistance, groundMark, pixelCanvas, smooth } from './lib.mjs';

//spine control points per pose. tail planted left, head reaches right
export const POSES = {
	hero: { P: [[0, 0], [10, -300], [300, -330], [380, -40]], looks: [0.6, 0.7], scale: 1, tilt: -8 },
	squash: { P: [[0, 0], [-90, -330], [200, -400], [120, -20]], looks: [0.15, 0.9], arch: [0.8, 1, 1.1, 1.2], tilt: 14, scale: 0.95 },
	stretch: { P: [[0, 0], [150, 30], [300, -50], [480, -20]], looks: [0.8, -0.3], arch: [0, 0, 0.05, 0.1], tilt: -2, scale: 0.82 },
};

const WID = [74, 86, 94, 98];
const HGT = [92, 104, 112, 118];
const FILL = [C.rose, C.peach, C.rose, C.peach];
const ARCH = [0, 0.35, 0.7, 1];
const HEADW = 128;

function miniWorm(a) {
	//the drawing inside a frame: a stick-worm at arch amount a, head dot at the right
	const h = 6 + a * 26;
	const d = `M-17,10 C-12,${10 - h * 1.1} 8,${10 - h * 1.1} 17,${10 - h * 0.15}`;
	return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="5.5" stroke-linecap="round"/><circle cx="17" cy="${n(10 - h * 0.15)}" r="4.6" fill="${INK}"/>`;
}

//distances along the spine for each frame centre and the head, frames overlapping a little
export function chain() {
	const c = [];
	let d = 36;
	for (let i = 0; i < 4; i++) {
		c.push(d);
		const nw = i < 3 ? WID[i + 1] : HEADW;
		d += ((WID[i] + nw) / 2) * 1.0;
	}
	return { frames: c, head: d };
}

export function draw(poseName = 'hero', opt = {}) {
	const pose = typeof poseName === 'string' ? POSES[poseName] : poseName;
	const ch = chain();
	const raw = arcTable(pose.P);
	const k = (ch.head + 14) / raw.total;
	let P = pose.P.map(([x, y]) => [x * k, y * k]);
	//head centre lands at x ~ 330 and y ~ 330 so every pose sits on the same ground
	const dx = (opt.cx ?? 256) - (P[0][0] + P[3][0]) / 2 - 26;
	const dy = 332 - P[3][1];
	P = P.map(([x, y]) => [x + dx, y + dy]);
	const tab = arcTable(P);
	if (opt.debug) console.error(poseName, 'curve', Math.round(tab.total), 'head at', Math.round(ch.head));
	let out = '';
	const tail = atDistance(tab, 36).p;
	const hdp = atDistance(tab, ch.head + 10);
	out += groundMark(tail[0] - 50, tail[0] + 50, 430, 5, 0.18);
	out += groundMark(hdp.p[0] - 60, hdp.p[0] + 56, 438, 9, 0.18);
	for (let i = 0; i < 4; i++) {
		const { p, ang } = atDistance(tab, ch.frames[i]);
		const w = WID[i], h = HGT[i];
		const fr = frame(w, h, 24, 11 + i * 3);
		const deg = (ang * 180) / Math.PI;
		let g = `<g transform="translate(${n(p[0])} ${n(p[1])}) rotate(${n(deg)})">`;
		//tail clasper sits under the first frame
		if (i === 0) g += `<path d="M-26,${h / 2 - 6} C-30,${h / 2 + 12} -10,${h / 2 + 16} 8,${h / 2 + 12} C18,${h / 2 + 8} 14,${h / 2 - 2} 10,${h / 2 - 6}Z" fill="${INK}"/>`;
		g += shape(fr, FILL[i], { sw: 7.5, off: [2, 5.5] });
		if (!mode.sil) {
			const hy = h / 2 - 11;
			for (const sx of [-w * 0.2, w * 0.2]) {
				g += `<rect x="${n(sx - 6)}" y="${n(-hy - 4.5)}" width="12" height="9" rx="3" fill="${PAPER}" opacity="0.92"/>`;
				g += `<rect x="${n(sx - 6)}" y="${n(hy - 4.5)}" width="12" height="9" rx="3" fill="${PAPER}" opacity="0.92"/>`;
			}
			g += `<rect x="${n(-w / 2 + 13)}" y="${n(-h / 2 + 22)}" width="${n(w - 26)}" height="${n(h - 44)}" rx="6" fill="${PAPER}" stroke="${INK}" stroke-width="3.5" transform="rotate(${i % 2 ? -1.2 : 1})"/>`;
			g += `<g transform="translate(0 -1) scale(${n((w - 26) / 52)})">${miniWorm(pose.arch ? pose.arch[i] : ARCH[i])}</g>`;
		}
		g += `</g>`;
		out += g;
	}
	const hdeg = (hdp.ang * 180) / Math.PI * 0.5 + (pose.tilt ?? 6);
	let hg = `<g transform="translate(${n(hdp.p[0] + 6)} ${n(hdp.p[1] - 6)}) rotate(${n(hdeg)})">`;
	hg += `<path d="M-34,50 C-38,70 -26,78 -8,76 C-4,70 -6,60 -10,52Z" fill="${INK}"/><path d="M10,52 C8,72 22,80 40,74 C42,66 36,58 30,50Z" fill="${INK}"/>`;
	hg += shape(frame(HEADW, 124, 36, 77, 4), C.sunny, { sw: 8, off: [3, 6] });
	if (!mode.sil) {
		for (const sy of [-26, 6]) hg += `<rect x="-60" y="${sy}" width="10" height="15" rx="3.5" fill="${PAPER}" opacity="0.92"/>`;
		hg += `<path d="M-50,48 C-20,60 30,62 52,40 C48,52 40,58 24,60 C-8,64 -36,60 -50,48Z" fill="#f2a91c" opacity="0.8"/>`;
		const lk = pose.looks;
		hg += eye(-4, -10, 25, 28, { look: lk, lid: 0.12, pr: 14, sw: 6 });
		hg += eye(42, -16, 17, 19, { look: lk, lid: 0.5, pr: 10, sw: 5.5, rot: -10, lidTilt: -5 });
		hg += `<path d="M4,36 C18,44 36,42 44,28" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
		hg += `<path d="M44,28 L50,24" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`;
		hg += taper([[-30, -44], [-8, -54], [14, -48]], 2, 8);
		hg += taper([[30, -48], [46, -52], [58, -40]], 7, 2);
	}
	hg += taper([[-20, -58], [-26, -86], [-44, -112]], 8, 4);
	hg += diamond(-48, -120, 14, C.rose, 5, -14);
	hg += taper([[26, -60], [24, -92], [48, -106], [66, -92]], 8, 4);
	hg += diamond(70, -86, 11, C.sky, 5, 30);
	hg += `</g>`;
	out += hg;
	const sc = pose.scale ?? 0.85;
	return `<g transform="translate(256 430) scale(${sc}) translate(-256 -430)">${out}</g>`;
}

export function ground() {
	return '';
}

//the thing it's curious about
export function extras() {
	return diamond(468, 408, 11, C.sky, 4, 0);
}

export function icon() {
	//dark tile, three chunky frames in an arch, head with one big eye. built for 16px
	let s = `<rect width="512" height="512" rx="112" fill="#2a2638"/>`;
	const fr = (x, y, w, h, rot, fill, seed) => `<g transform="translate(${x} ${y}) rotate(${rot})">${shape(frame(w, h, 28, seed, 3), fill, { sw: 14, off: [4, 7] })}<rect x="${-w / 2 + 18}" y="${-12}" width="${w - 36}" height="24" rx="6" fill="${PAPER}"/></g>`;
	s += fr(108, 338, 108, 128, -14, C.rose, 3);
	s += fr(198, 244, 120, 144, -2, C.peach, 8);
	//head
	s += `<g transform="translate(340 322) rotate(10)">`;
	s += shape(frame(206, 200, 56, 5, 4), C.sunny, { sw: 14, off: [4, 8] });
	s += eye(-36, -12, 46, 54, { look: [0.7, 0.4], pr: 30, sw: 10, lid: 0.0 });
	s += eye(56, -22, 31, 36, { look: [0.7, 0.4], pr: 20, sw: 9, lid: 0.4, rot: -10, lidTilt: -6, lidSw: 8 });
	s += taper([[-10, 50], [24, 62], [58, 38]], 11, 11);
	s += taper([[34, -80], [44, -112], [74, -126]], 11, 6);
	s += `<g transform="translate(78 -134)">${diamond(0, 0, 18, C.rose, 8, 20)}</g>`;
	s += `</g>`;
	return s;
}

export function pixel() {
	const P = pixelCanvas(32);
	//frame: colour, paper window, sprocket holes down both long sides
	const strip = (x0, y0, w, h, col, vertical = true) => {
		P.seg((x, y) => x > x0 && x < x0 + w && y > y0 && y < y0 + h && !((x < x0 + 1.5 || x > x0 + w - 1.5) && (y < y0 + 1.5 || y > y0 + h - 1.5)), col);
		if (vertical) {
			P.rect(x0 + 2, y0 + 2, w - 4, h - 4, PAPER);
			for (let y = y0 + 1; y < y0 + h - 1; y += 2) { P.px(x0, y, PAPER); P.px(x0 + w - 1, y, PAPER); }
		} else {
			P.rect(x0 + 2, y0 + 2, w - 4, h - 4, PAPER);
			for (let x = x0 + 1; x < x0 + w - 1; x += 2) { P.px(x, y0, PAPER); P.px(x, y0 + h - 1, PAPER); }
		}
	};
	//an arch of frames stepping up, each window holding the worm a bit more arched
	strip(0, 20, 7, 9, C.rose);
	P.px(3, 25, INK); P.px(4, 24, INK);
	strip(5, 12, 7, 9, C.peach);
	P.px(7, 17, INK); P.px(8, 16, INK); P.px(9, 17, INK);
	strip(10, 6, 9, 7, C.rose, false);
	P.px(12, 10, INK); P.px(13, 9, INK); P.px(14, 9, INK); P.px(15, 9, INK); P.px(16, 10, INK);
	//head
	P.seg((x, y) => x > 18 && x < 31.5 && y > 12 && y < 27 && !((x < 19.8 || x > 29.7) && (y < 13.8 || y > 25.2)), C.sunny);
	//eyes: big one looks at the diamond, small one is half closed
	P.rect(20, 15, 4, 5, PAPER); P.rect(21, 17, 2, 3, INK); P.px(22, 17, PAPER);
	P.rect(26, 16, 3, 3, PAPER); P.px(27, 18, INK); P.px(28, 18, INK); P.line(26, 16, 28, 16, C.sunny); P.line(26, 15, 29, 14, INK);
	P.line(20, 14, 23, 13, INK);
	P.line(22, 22, 26, 23, INK); P.px(27, 22, INK); P.px(28, 21, INK);
	//antennae with diamond tips
	P.line(21, 11, 21, 8, INK); P.px(21, 6, C.rose); P.px(20, 7, C.rose); P.px(22, 7, C.rose); P.px(21, 7, C.rose);
	P.line(28, 11, 29, 9, INK); P.px(30, 7, C.sky); P.px(29, 8, C.sky); P.px(31, 8, C.sky); P.px(30, 8, C.sky);
	//feet
	P.rect(2, 29, 4, 1, INK); P.rect(21, 27, 3, 2, INK); P.rect(27, 27, 3, 2, INK);
	return P;
}
