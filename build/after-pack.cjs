// Runs after electron-builder has laid the app out: signs the macOS app (adhoc-sign.cjs) and, on Linux, puts the
// launcher in front of the program (build/linux/launcher.sh, see its first lines for why).
const fs = require('node:fs');
const path = require('node:path');
const adhocSign = require('./adhoc-sign.cjs').default;

exports.default = async function afterPack(context) {
  await adhocSign(context);
  if (context.electronPlatformName !== 'linux') return;
  const exe = path.join(context.appOutDir, context.packager.executableName);
  fs.renameSync(exe, `${exe}.bin`);
  fs.copyFileSync(path.join(__dirname, 'linux/launcher.sh'), exe);
  fs.chmodSync(exe, 0o755);
};
