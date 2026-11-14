// Builds every mascot the app has (src/ui/mascot/mascots.json) from its Frameling source files. For Quill:
//   brand/mascot/mascot.frameling       -> public/mascot/mascot.png + mascot.json (one animation per clip)
//   brand/mascot/mascot-icon.frameling  -> build/icon.png, build/icon.svg, build/icons/*.png, public/mascot/logo.png
// A mascot that lacks a clip the app asks for fails the build. See docs/mascots.md.
// Edit those files in Frameling, save, then `npm run build:mascot` (npm run build runs it too).
// Uses the app's own .frameling reader (src/io/file.ts), so whatever Frameling saves, this reads.
import fs from 'node:fs';
import path from 'node:path';
import {loadMascotLib, ROOT} from './mascot/load.mjs';

const lib = await loadMascotLib();
const open = f => {
	const {doc, warnings} = lib.loadFile(new Uint8Array(fs.readFileSync(path.join(ROOT, f))));
	for (const w of warnings) console.warn(`${f}: ${w}`);
	return doc;
};

let wrote = 0;
//only touches a file when its bytes change, so a rebuild with no edits leaves git clean
const put = (rel, bytes) => {
	const file = path.join(ROOT, rel);
	const next = Buffer.from(bytes);
	if (fs.existsSync(file) && fs.readFileSync(file).equals(next)) return;
	fs.mkdirSync(path.dirname(file), {recursive: true});
	fs.writeFileSync(file, next);
	wrote++;
	console.log('  wrote ' + rel);
};

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/ui/mascot/mascots.json'), 'utf8'));
let broken = 0;

for (const m of manifest.mascots) {
	const sheet = lib.docToSheet(open(m.source));
	for (const w of sheet.warnings) console.warn(`${m.source}: ${w}`);
	// The clip contract (see docs/mascots.md): a mascot missing a clip the app asks for stops the build.
	const problems = lib.sheetProblems(sheet.meta);
	if (problems.length) {
		broken++;
		console.error(`${m.name} (${m.source}) breaks the clip contract: ${problems.join(', ')}.`);
	}
	put('public/' + m.sheet, lib.encodePng(sheet.image));
	put('public/' + m.meta, JSON.stringify(sheet.meta, null, '\t') + '\n');
	const anims = Object.keys(sheet.meta.anims);
	console.log(`mascot ${m.id}: ${anims.length} animations (${anims.join(', ')})`);

	// The app icon and logo belong to the app, so only the mascot that lists one makes them.
	if (m.appIcon) {
		const icons = lib.docToIcons(open(m.appIcon));
		for (const [rel, img] of Object.entries(icons.pngs)) put(rel, lib.encodePng(img));
		put('build/icon.svg', icons.svg);
	}
}

if (broken) process.exit(1);
console.log(wrote ? `${wrote} file(s) updated` : 'nothing changed');
