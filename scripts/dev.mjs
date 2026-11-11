// Runs the page through Vite's dev server (hot reload) and opens Electron on it.
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { createRequire } from 'node:module';

await import('./build-main.mjs');
const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = server.resolvedUrls.local[0];
const electron = createRequire(import.meta.url)('electron');
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, FRAMELING_DEV_URL: url } });
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
