// Builds every round two file in this folder: node brand/round2/build-round2.mjs
// Each concept module (c1..c5.mjs) draws the mascot from code, so the SVGs are generated, not traced.
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INK, PAPER, C, mode, svg, n } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const META = {
	c1: { name: 'Inch', idea: 'An inchworm mid-inch, every segment a film frame showing the worm a little further along its own arch.', poses: ['squash', 'stretch', 'hero'] },
	c2: { name: 'Onion', idea: 'The caterpillar is its own onion skin: one solid head, and a body made of its fainter earlier frames on a timeline.', poses: ['crouch', 'stretch', 'hero'] },
	c3: { name: 'Stub', idea: 'Chunky, scruffy and smudged, with a worn-down coloured pencil for a tail that is still drawing its own trail.', poses: ['squash', 'stretch', 'hero'] },
	c4: { name: 'Rez', idea: 'Born as big pixels and finer with every segment until the head is clean vector: sketch to finished art in one creature.', poses: ['crouch', 'stretch', 'hero'] },
	c5: { name: 'Hold', idea: 'A timeline that crawls: segments held for 1, 2, 1, 3 frames, keyframe diamonds on the joints, ruler ticks for legs, a playhead for a head.', poses: ['squash', 'stretch', 'hero'] },
};
const LABELS = ['1  anticipate', '2  stretch', '3  settle'];
const out = (f, t) => writeFileSync(join(here, f), t);
const all = {};

for (const id of Object.keys(META)) {
	const m = await import(`./${id}.mjs`);
	const meta = META[id];
	const title = `Frameling round 2, ${id.toUpperCase()} ${meta.name}`;
	mode.sil = false;
	const hero = m.draw('hero') + (m.extras ? m.extras() : '');
	const mascot = svg(hero, `${title}: mascot`);
	out(`${id}.svg`, mascot);

	//model sheet: three poses on one card
	let sheet = `<rect x="6" y="6" width="1524" height="578" rx="26" fill="${PAPER}" stroke="${INK}" stroke-width="4"/>`;
	meta.poses.forEach((p, i) => {
		const inner = m.draw(p) + (p === 'hero' && m.extras ? m.extras() : '');
		sheet += `<svg x="${i * 510 + 4}" y="12" width="510" height="510" viewBox="0 0 512 512">${inner}</svg>`;
		sheet += `<text x="${i * 510 + 40}" y="556" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" font-weight="700" fill="${INK}" letter-spacing="1">${LABELS[i].toUpperCase()}</text>`;
		if (i < 2) sheet += `<path d="M${i * 510 + 492},470 c14,-14 30,-14 44,0" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" opacity=".5"/><path d="M${i * 510 + 530},457 l10,13 l-17,4" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/>`;
	});
	out(`${id}-poses.svg`, svg(sheet, `${title}: poses, anticipate stretch settle`, 1536, 590));

	//silhouette in solid ink on paper
	mode.sil = true;
	const sil = `<rect width="512" height="512" fill="${PAPER}"/>` + m.draw('hero');
	mode.sil = false;
	out(`${id}-silhouette.svg`, svg(sil, `${title}: silhouette`));

	out(`${id}-pixel.svg`, m.pixel().toSVG(16, `${title}: 32 by 32 pixel version`));
	out(`${id}-icon.svg`, svg(m.icon(), `${title}: app icon`));
	all[id] = { meta, files: ['', '-poses', '-silhouette', '-pixel', '-icon'].map((s) => `${id}${s}.svg`) };
}
writeFileSync(join(here, 'manifest.json'), JSON.stringify(all, null, 1));
console.log('built', Object.keys(all).join(' '));
