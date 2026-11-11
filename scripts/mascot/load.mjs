// Bundles scripts/mascot/entry.ts (and the app code it pulls in: the .frameling reader and writer, the PNG codec)
// with esbuild in memory, then imports it. Takes well under a second, so the build can run it every time.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');

export async function loadMascotLib() {
	const out = await build({entryPoints: [path.join(HERE, 'entry.ts')], bundle: true, format: 'esm', platform: 'node', target: 'node20', write: false, logLevel: 'silent'});
	const code = out.outputFiles[0].text;
	return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
