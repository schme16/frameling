// Writes compare.html: one self-contained page with every round two asset embedded. node brand/round2/build-compare.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8'));
const data = {};
for (const [id, m] of Object.entries(manifest)) {
	data[id] = { name: m.meta.name, idea: m.meta.idea };
	['mascot', 'poses', 'silhouette', 'pixel', 'icon'].forEach((k, i) => (data[id][k] = readFileSync(join(here, m.files[i]), 'utf8').replace(/<\?xml[^>]*>/, '')));
}
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Frameling mascot, round two</title>
<style>
	:root { --ink: #1d1b26; --paper: #fffaf0; }
	* { box-sizing: border-box; }
	body { margin: 0; font: 15px/1.45 "DejaVu Sans", system-ui, sans-serif; background: #f3eee6; color: var(--ink); }
	header { padding: 28px 32px 8px; }
	h1 { margin: 0 0 6px; font-size: 26px; }
	header p { margin: 0; max-width: 70ch; }
	.band { padding: 24px 32px 36px; overflow-x: auto; }
	.band h2 { margin: 0 0 14px; font-size: 13px; letter-spacing: .14em; text-transform: uppercase; opacity: .7; }
	.band.dark { background: #17151f; color: #f3eee6; }
	.band.light { background: #f3eee6; color: var(--ink); }
	.grid { display: grid; grid-template-columns: repeat(5, 440px); gap: 28px; width: max-content; }
	.cell h3 { margin: 0; font-size: 20px; }
	.cell h3 span { opacity: .55; font-weight: 400; margin-right: 6px; }
	.cell p.idea { margin: 4px 0 14px; min-height: 66px; font-size: 13px; opacity: .85; }
	.row { margin: 0 0 18px; }
	.row > .label { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; opacity: .55; margin-bottom: 6px; }
	.sizes { display: flex; align-items: flex-end; gap: 14px; }
	.sizes figure { margin: 0; text-align: center; }
	.sizes figcaption { font-size: 10px; opacity: .5; margin-top: 3px; }
	.sizes img { display: block; }
	.dark .sil img { filter: invert(1); }
	.pix img { image-rendering: pixelated; }
</style>
</head>
<body>
<header>
	<h1>Frameling mascot, round two</h1>
	<p>Five caterpillar-led concepts, each drawn from code in this folder. Every asset is shown at 256, 64, 32 and 16 px on dark and light. The model sheets are shown at 256 and 128 px wide, since a three-pose strip is unreadable below that. On dark the ink outlines sink into the background, which is the honest answer to how the mascot sits on a dark page.</p>
</header>
<main id="root"></main>
<script>
const D = ${JSON.stringify(data)};
const uri = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
const rows = [
	['mascot', 'mascot', [256, 64, 32, 16], ''],
	['poses', 'model sheet: anticipate, stretch, settle', [256, 128], ''],
	['silhouette', 'silhouette test', [256, 64, 32, 16], 'sil'],
	['pixel', 'pixel 32 x 32', [256, 64, 32, 16], 'pix'],
	['icon', 'app icon', [256, 64, 32, 16], ''],
];
const root = document.getElementById('root');
for (const theme of ['dark', 'light']) {
	const band = document.createElement('section');
	band.className = 'band ' + theme;
	band.innerHTML = '<h2>On ' + theme + '</h2>';
	const grid = document.createElement('div');
	grid.className = 'grid';
	Object.entries(D).forEach(([id, c]) => {
		const cell = document.createElement('div');
		cell.className = 'cell';
		cell.innerHTML = '<h3><span>' + id.toUpperCase() + '</span>' + c.name + '</h3><p class="idea">' + c.idea + '</p>';
		for (const [key, label, sizes, cls] of rows) {
			const row = document.createElement('div');
			row.className = 'row ' + cls;
			row.innerHTML = '<div class="label">' + label + '</div>';
			const wrap = document.createElement('div');
			wrap.className = 'sizes';
			for (const w of sizes) {
				const f = document.createElement('figure');
				const img = document.createElement('img');
				img.src = uri(c[key]);
				img.alt = c.name + ' ' + label + ' at ' + w + ' px';
				img.width = w;
				if (key === 'poses') img.height = Math.round(w * 590 / 1536);
				else img.height = w;
				f.appendChild(img);
				f.insertAdjacentHTML('beforeend', '<figcaption>' + w + '</figcaption>');
				wrap.appendChild(f);
			}
			row.appendChild(wrap);
			cell.appendChild(row);
		}
		grid.appendChild(cell);
	});
	band.appendChild(grid);
	root.appendChild(band);
}
</script>
</body>
</html>
`;
writeFileSync(join(here, 'compare.html'), html);
console.log('compare.html', html.length);
