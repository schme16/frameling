// Bundles the Electron main and preload processes to CommonJS in dist/.
import { copyFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';

// The one board a beta build sends reports to (empty in an ordinary build, which then sends nothing from this side).
const ingestOrigin = process.env.FRAMELING_INGEST_KEY ? new URL(process.env.FRAMELING_INGEST_URL || 'https://project-boards.shanegadsby.com').origin : '';
// hyperswarm stays outside the bundle: it loads its native parts (udx-native, sodium-native) from its own folder.
const common = { bundle: true, platform: 'node', target: 'node22', format: 'cjs', external: ['electron', 'hyperswarm'], sourcemap: true, define: { __FRAMELING_INGEST_ORIGIN__: JSON.stringify(ingestOrigin), __FRAMELING_TWITCH_CLIENT__: JSON.stringify(process.env.FRAMELING_TWITCH_CLIENT_ID ?? ''), __FRAMELING_PROFILE__: JSON.stringify(process.env.FRAMELING_PROFILE ?? '') } };
await build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.cjs' });
await build({ ...common, entryPoints: ['src/preload/preload.ts'], outfile: 'dist/preload/preload.cjs' });
await build({ ...common, entryPoints: ['src/preload/popout.ts'], outfile: 'dist/preload/popout.cjs' });
await build({ ...common, entryPoints: ['src/preload/streamboard.ts'], outfile: 'dist/preload/streamboard.cjs' });
// The window icon (Quill) for Windows and Linux taskbars; macOS takes the app bundle's icon.
mkdirSync('dist/main', { recursive: true });
copyFileSync('build/icons/512x512.png', 'dist/main/icon.png');
console.log('main and preload built');
