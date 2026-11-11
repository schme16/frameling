//Small pixel helpers shared by build.mjs and the preview scripts: parse the ASCII grids,
//stamp parts onto a frame, and write PNGs with nothing but zlib.
import zlib from 'node:zlib';
import fs from 'node:fs';

export function grid(src) {
	const rows = src.replace(/^\n+|\n+\s*$/g, '').split('\n').map(r => r.replace(/\s+$/, '').replace(/^\s*\|/, ''));
	return rows;
}

export function blank(w, h) {
	return Array.from({length: h}, () => Array(w).fill('.'));
}

//Stamps a part (array of strings) onto a canvas at x,y. '.' is see-through,
//`swap` remaps letters (pencil colours), `flip` mirrors it left to right.
export function stamp(cv, part, x, y, {swap = {}, flip = false} = {}) {
	const pw = Math.max(...part.map(r => r.length));
	part.forEach((row, py) => {
		for (let px = 0; px < row.length; px++) {
			let ch = row[px];
			if (ch === '.' || ch === ' ') continue;
			if (swap[ch]) ch = swap[ch];
			const tx = x + (flip ? pw - 1 - px : px), ty = y + py;
			if (ty >= 0 && ty < cv.length && tx >= 0 && tx < cv[0].length) cv[ty][tx] = ch;
		}
	});
	return cv;
}

export function hexRGB(h) {
	return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

//RGBA buffer helpers
export function image(w, h, bg = null) {
	const px = Buffer.alloc(w * h * 4);
	if (bg) {
		const [r, g, b] = hexRGB(bg);
		for (let i = 0; i < w * h; i++) px.set([r, g, b, 255], i * 4);
	}
	return {w, h, px};
}

export function fillRect(img, x, y, w, h, hex) {
	const [r, g, b] = hexRGB(hex);
	for (let yy = Math.max(0, y); yy < Math.min(img.h, y + h); yy++)
		for (let xx = Math.max(0, x); xx < Math.min(img.w, x + w); xx++) img.px.set([r, g, b, 255], (yy * img.w + xx) * 4);
}

//Draws a char grid into an image at scale s (no blending, art pixels are opaque)
export function drawGrid(img, g, ox, oy, s, pal) {
	g.forEach((row, y) => {
		for (let x = 0; x < row.length; x++) {
			const c = row[x];
			if (c === '.' || c === ' ') continue;
			if (!pal[c]) throw new Error(`no palette entry for '${c}'`);
			fillRect(img, ox + x * s, oy + y * s, s, s, pal[c]);
		}
	});
}

const CRC = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();
function crc32(buf) {
	let c = 0xffffffff;
	for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
	const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
	const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
	return Buffer.concat([len, td, crc]);
}

export function writePNG(file, img) {
	const raw = Buffer.alloc((img.w * 4 + 1) * img.h);
	for (let y = 0; y < img.h; y++) {
		raw[y * (img.w * 4 + 1)] = 0;
		img.px.copy(raw, y * (img.w * 4 + 1) + 1, y * img.w * 4, (y + 1) * img.w * 4);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4);
	ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
	fs.writeFileSync(file, Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, {level: 9})), chunk('IEND', Buffer.alloc(0)),
	]));
}
