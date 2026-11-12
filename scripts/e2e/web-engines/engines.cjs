// Gets the pinned Phaser and PixiJS builds for the web engine check. They are downloaded once from the npm registry,
// checked against the hash below, and unpacked into a cache folder outside the repo, so nothing is added to
// package.json. Set WEB_ENGINES_DIR to put the cache somewhere else (default: ~/.cache/frameling-web-engines).
const cp = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');

const PINNED = {
  phaser: {
    version: '3.90.0',
    pkg: 'phaser',
    file: 'package/dist/phaser.min.js',
    integrity: 'sha512-/cziz/5ZIn02uDkC9RzN8VF9x3Gs3XdFFf9nkiMEQT3p7hQlWuyjy4QWosU802qqno2YSLn2BfqwOKLv/sSVfQ==',
  },
  // Phaser 4 (Beam renderer), pinned next to 3.90. Same package, so the cache folder name carries the version.
  phaser4: {
    version: '4.2.1',
    pkg: 'phaser',
    file: 'package/dist/phaser.min.js',
    integrity: 'sha512-WUNwCPJpdjvZiuT6SgCfYVW8Qw/3j0jJ4ws7P2QkhFLFu74sbGuyHJcbFueGkY/AYO4Pi47bNQXn1OCJeLX//w==',
  },
  pixi: {
    version: '8.23.0',
    pkg: 'pixi.js',
    file: 'package/dist/pixi.min.js',
    integrity: 'sha512-RkWSwo+mAR0d7MKnJ20IjKkWGPdFh1C0adBRYYLa+SGdxTfbrr6RnQyZZRwjBaG/bDAIQqgBcTBbiNsN6iKFVQ==',
  },
};

const cacheDir = () => process.env.WEB_ENGINES_DIR || path.join(os.homedir(), '.cache', 'frameling-web-engines');

function download(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
          res.resume();
          return resolve(download(new URL(res.headers.location, url).href, redirects - 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`${url}: HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

/** Returns { phaser, phaser4, pixi } as paths to the pinned builds, fetching what is missing. */
async function ensureEngines() {
  const out = {};
  for (const [id, p] of Object.entries(PINNED)) {
    const dir = path.join(cacheDir(), `${p.pkg}-${p.version}`);
    const dest = path.join(dir, path.basename(p.file));
    if (!fs.existsSync(dest)) {
      console.log(`web engines: fetching ${p.pkg}@${p.version} into ${dir}`);
      const tgz = await download(`https://registry.npmjs.org/${p.pkg}/-/${p.pkg}-${p.version}.tgz`);
      const got = 'sha512-' + crypto.createHash('sha512').update(tgz).digest('base64');
      if (got !== p.integrity) throw new Error(`${p.pkg}@${p.version}: the download does not match the pinned hash (${got})`);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = path.join(dir, 'download.tgz');
      fs.writeFileSync(tmp, tgz);
      const r = cp.spawnSync('tar', ['xzf', tmp, '-C', dir, '--strip-components=2', p.file], { encoding: 'utf8' });
      fs.rmSync(tmp, { force: true });
      if (r.status !== 0 || !fs.existsSync(dest)) throw new Error(`could not unpack ${p.file}: ${r.stderr}`);
    }
    out[id] = dest;
  }
  return out;
}

module.exports = { ensureEngines, PINNED };
