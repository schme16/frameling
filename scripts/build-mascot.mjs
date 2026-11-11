// Builds the mascot (Quill) the app shows from its Frameling source files:
//   brand/mascot/mascot.frameling       -> public/mascot/mascot.png + mascot.json (one animation per clip)
//   brand/mascot/mascot-icon.frameling  -> build/icon.png, build/icon.svg, build/icons/*.png, public/mascot/logo.png
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

const sheet = lib.docToSheet(open('brand/mascot/mascot.frameling'));
for (const w of sheet.warnings) console.warn('mascot.frameling: ' + w);
put('public/mascot/mascot.png', lib.encodePng(sheet.image));
put('public/mascot/mascot.json', JSON.stringify(sheet.meta, null, '\t') + '\n');

const icons = lib.docToIcons(open('brand/mascot/mascot-icon.frameling'));
for (const [rel, img] of Object.entries(icons.pngs)) put(rel, lib.encodePng(img));
put('build/icon.svg', icons.svg);

const anims = Object.keys(sheet.meta.anims);
console.log(`mascot: ${anims.length} animations (${anims.join(', ')}), ${wrote ? wrote + ' file(s) updated' : 'nothing changed'}`);
