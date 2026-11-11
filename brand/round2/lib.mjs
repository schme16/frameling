// Shared drawing helpers for the round two caterpillars. Hand-drawn feel comes from jittered
// catmull-rom outlines, tapered brush strokes and an offset ink "shadow" instead of an even stroke.
export const INK = '#1d1b26';
export const PAPER = '#fffaf0';
export const C = { sunny: '#ffc94a', peach: '#ff9e6d', rose: '#ff6f91', grape: '#9b7bff', sky: '#5ab8ff', mint: '#4fd1a5' };

//silhouette mode flips every fill and stroke to ink and drops the interior detail
export const mode = { sil: false };

export const n = (v) => +v.toFixed(1);

export function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

//closed (or open) catmull-rom through points, as cubic beziers
export function smooth(pts, closed = true, tension = 1) {
	const p = pts;
	const N = p.length;
	const get = (i) => (closed ? p[(i + N) % N] : p[Math.max(0, Math.min(N - 1, i))]);
	let d = `M${n(p[0][0])},${n(p[0][1])}`;
	const segs = closed ? N : N - 1;
	for (let i = 0; i < segs; i++) {
		const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
		const k = tension / 6;
		const c1 = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
		const c2 = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
		d += `C${n(c1[0])},${n(c1[1])} ${n(c2[0])},${n(c2[1])} ${n(p2[0])},${n(p2[1])}`;
	}
	return d + (closed ? 'Z' : '');
}

//a slightly wonky ellipse
export function wobble(cx, cy, rx, ry, seed = 1, amt = 0.05, rot = 0, count = 9) {
	const r = rng(seed);
	const pts = [];
	const cr = Math.cos(rot), sr = Math.sin(rot);
	for (let i = 0; i < count; i++) {
		const a = (i / count) * Math.PI * 2;
		const k = 1 + (r() - 0.5) * 2 * amt;
		const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
		pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
	}
	return smooth(pts);
}

//a squircle-ish frame with jittered corners, centred on 0,0
export function frame(w, h, r, seed = 1, amt = 2.5) {
	const rn = rng(seed);
	const hw = w / 2, hh = h / 2;
	const pts = [];
	const corner = (cx, cy, a0) => {
		for (let i = 0; i < 3; i++) {
			const a = a0 + (i / 2) * (Math.PI / 2);
			pts.push([cx + Math.cos(a) * r + (rn() - 0.5) * amt * 2, cy + Math.sin(a) * r + (rn() - 0.5) * amt * 2]);
		}
	};
	corner(hw - r, hh - r, 0);
	pts.push([0 + (rn() - 0.5) * amt, hh + (rn() - 0.5) * amt]);
	corner(-hw + r, hh - r, Math.PI / 2);
	pts.push([-hw + (rn() - 0.5) * amt, 0 + (rn() - 0.5) * amt]);
	corner(-hw + r, -hh + r, Math.PI);
	pts.push([0 + (rn() - 0.5) * amt, -hh + (rn() - 0.5) * amt]);
	corner(hw - r, -hh + r, Math.PI * 1.5);
	pts.push([hw + (rn() - 0.5) * amt, 0 + (rn() - 0.5) * amt]);
	return smooth(pts, true, 0.9);
}

//sample an open catmull curve into points
export function sample(pts, per = 12, tension = 1) {
	const N = pts.length;
	const get = (i) => pts[Math.max(0, Math.min(N - 1, i))];
	const out = [];
	for (let i = 0; i < N - 1; i++) {
		const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
		const k = tension / 6;
		const c1 = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
		const c2 = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
		for (let j = 0; j < per; j++) {
			const t = j / per, u = 1 - t;
			out.push([
				u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0],
				u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1],
			]);
		}
	}
	out.push(pts[N - 1]);
	return out;
}

//a brush stroke that thickens or thins along its length
export function taper(pts, w0, w1, fill = INK, extra = '') {
	const s = sample(pts, 10);
	const L = [], R = [];
	for (let i = 0; i < s.length; i++) {
		const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)];
		let dx = b[0] - a[0], dy = b[1] - a[1];
		const len = Math.hypot(dx, dy) || 1;
		dx /= len; dy /= len;
		const t = i / (s.length - 1);
		const w = (w0 + (w1 - w0) * t) / 2;
		L.push([s[i][0] - dy * w, s[i][1] + dx * w]);
		R.push([s[i][0] + dy * w, s[i][1] - dx * w]);
	}
	const poly = L.concat(R.reverse());
	let d = `M${n(poly[0][0])},${n(poly[0][1])}`;
	for (let i = 1; i < poly.length; i++) d += `L${n(poly[i][0])},${n(poly[i][1])}`;
	const e = s[s.length - 1], st = s[0];
	const cap = (pt, w) => `<circle cx="${n(pt[0])}" cy="${n(pt[1])}" r="${n(w / 2)}" fill="${mode.sil ? INK : fill}"/>`;
	return `<path d="${d}Z" fill="${mode.sil ? INK : fill}" ${extra}/>` + (w0 > 3 ? cap(st, w0) : '') + (w1 > 3 ? cap(e, w1) : '');
}

//ink-outlined shape with a heavier offset "cast" line on the lower right, so the outline is not one weight
export function shape(d, fill, o = {}) {
	const sw = o.sw ?? 7;
	const off = o.off ?? [3.5, 5];
	const f = mode.sil ? INK : fill;
	let s = '';
	if (!mode.sil && off) s += `<path d="${d}" transform="translate(${off[0]} ${off[1]})" fill="${INK}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`;
	s += `<path d="${d}" fill="${f}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"${o.extra ? ' ' + o.extra : ''}/>`;
	return s;
}

//interior detail, dropped in silhouette mode
export const detail = (s) => (mode.sil ? '' : s);

export const poly = (pts, fill) => `<path d="M${pts.map((p) => n(p[0]) + ',' + n(p[1])).join('L')}Z" fill="${mode.sil ? INK : fill}" stroke="${mode.sil ? INK : INK}" stroke-width="${mode.sil ? 6 : 0}" stroke-linejoin="round"/>`;

export const diamond = (cx, cy, r, fill, sw = 4, rot = 0) =>
	`<path d="M${n(cx)},${n(cy - r)}L${n(cx + r * 0.9)},${n(cy)}L${n(cx)},${n(cy + r)}L${n(cx - r * 0.9)},${n(cy)}Z" transform="rotate(${rot} ${n(cx)} ${n(cy)})" fill="${mode.sil ? INK : fill}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`;

let eyeUid = 0;
//an eye: ink rim, paper white, pupil that looks somewhere, optional heavy upper lid
export function eye(cx, cy, rx, ry, o = {}) {
	if (mode.sil) return '';
	const look = o.look ?? [0, 0];
	const lid = o.lid ?? 0; //0..1 how far the lid comes down
	const rot = o.rot ?? 0;
	const pr = o.pr ?? Math.min(rx, ry) * 0.62;
	const id = `e${eyeUid++}`;
	let s = `<g transform="rotate(${rot} ${n(cx)} ${n(cy)})">`;
	s += `<clipPath id="${id}"><ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}"/></clipPath>`;
	s += `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${PAPER}" stroke="${INK}" stroke-width="${o.sw ?? 5}"/>`;
	s += `<g clip-path="url(#${id})">`;
	s += `<ellipse cx="${n(cx + look[0] * rx * 0.5)}" cy="${n(cy + look[1] * ry * 0.5)}" rx="${n(pr)}" ry="${n(pr * 1.12)}" fill="${INK}"/>`;
	s += `<circle cx="${n(cx + look[0] * rx * 0.5 + pr * 0.32)}" cy="${n(cy + look[1] * ry * 0.5 - pr * 0.38)}" r="${n(pr * 0.24)}" fill="${PAPER}"/>`;
	if (lid > 0) s += `<rect x="${n(cx - rx - 4)}" y="${n(cy - ry - 4)}" width="${n(rx * 2 + 8)}" height="${n(ry * 2 * lid + 4)}" fill="${o.lidFill ?? C.sunny}"/><path d="M${n(cx - rx - 4)},${n(cy - ry + ry * 2 * lid)}L${n(cx + rx + 4)},${n(cy - ry + ry * 2 * lid - (o.lidTilt ?? 0))}" stroke="${INK}" stroke-width="${o.lidSw ?? 5}" fill="none"/>`;
	s += `</g></g>`;
	return s;
}

export function bezierAt(P, t) {
	const u = 1 - t;
	const x = u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0];
	const y = u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1];
	return [x, y];
}

//arc-length table for a cubic, so frames can be spaced by distance
export function arcTable(P, steps = 400) {
	const pts = [];
	let len = 0;
	let prev = bezierAt(P, 0);
	pts.push({ t: 0, len: 0, p: prev });
	for (let i = 1; i <= steps; i++) {
		const t = i / steps;
		const p = bezierAt(P, t);
		len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
		pts.push({ t, len, p });
		prev = p;
	}
	return { pts, total: len };
}
export function atDistance(tab, d) {
	const { pts } = tab;
	d = Math.max(0, Math.min(tab.total, d));
	let lo = 0, hi = pts.length - 1;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (pts[mid].len < d) lo = mid; else hi = mid;
	}
	const a = pts[lo], b = pts[hi];
	const k = (d - a.len) / (b.len - a.len || 1);
	const p = [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k];
	const ang = Math.atan2(b.p[1] - a.p[1], b.p[0] - a.p[0]);
	return { p, ang };
}

export const svg = (inner, title, w = 512, h = 512, vb = `0 0 ${w} ${h}`) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}" role="img" aria-label="${title}">\n<title>${title}</title>\n${inner}\n</svg>\n`;

//a loose scribble of ground under the feet
export function groundMark(x0, x1, y, seed = 3, a = 0.14) {
	if (mode.sil) return '';
	const r = rng(seed);
	return taper([[x0, y + r() * 3], [(x0 + x1) / 2, y + 4 + r() * 4], [x1, y - 2 + r() * 3]], 3, 12, INK, `opacity="${a}"`).replace(/<circle[^>]*\/>/g, '');
}

//----- pixel canvas -----
export function pixelCanvas(N = 32) {
	const g = Array.from({ length: N }, () => Array(N).fill(null));
	const inb = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
	const api = {
		N, g,
		px(x, y, c) { x = Math.round(x); y = Math.round(y); if (inb(x, y)) g[y][x] = c; },
		get(x, y) { return inb(x, y) ? g[y][x] : null; },
		mask(fn) {
			const m = [];
			for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (fn(x + 0.5, y + 0.5)) m.push([x, y]);
			return m;
		},
		//ring first (ink around the mask), then the fill, so later segments overlap earlier ones with a line between
		seg(fn, color, ring = INK) {
			const m = api.mask(fn);
			const set = new Set(m.map(([x, y]) => x + ',' + y));
			for (const [x, y] of m) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const k = (x + dx) + ',' + (y + dy);
				if (!set.has(k) && inb(x + dx, y + dy)) g[y + dy][x + dx] = ring;
			}
			for (const [x, y] of m) g[y][x] = color;
			return m;
		},
		rect(x0, y0, w, h, c) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) api.px(x, y, c); },
		line(x0, y0, x1, y1, c) {
			const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
			for (let i = 0; i <= steps; i++) { const t = steps ? i / steps : 0; api.px(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c); }
		},
		toSVG(scale = 16, title = 'pixel', bg = null) {
			let s = '';
			if (bg) s += `<rect width="${N * scale}" height="${N * scale}" fill="${bg}"/>`;
			const byColor = {};
			for (let y = 0; y < N; y++) {
				let x = 0;
				while (x < N) {
					const c = g[y][x];
					if (!c) { x++; continue; }
					let x2 = x;
					while (x2 + 1 < N && g[y][x2 + 1] === c) x2++;
					(byColor[c] ??= []).push(`M${x * scale},${y * scale}h${(x2 - x + 1) * scale}v${scale}h${-(x2 - x + 1) * scale}z`);
					x = x2 + 1;
				}
			}
			for (const [c, ds] of Object.entries(byColor)) s += `<path d="${ds.join('')}" fill="${c}"/>`;
			return `<svg xmlns="http://www.w3.org/2000/svg" width="${N * scale}" height="${N * scale}" viewBox="0 0 ${N * scale} ${N * scale}" shape-rendering="crispEdges" role="img" aria-label="${title}">\n<title>${title}</title>\n${s}\n</svg>\n`;
		},
	};
	return api;
}
