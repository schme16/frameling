// Ad-hoc signs the macOS app after packaging, the way Godot's exports are signed: no Apple account, no notarising.
// Apple Silicon Macs refuse to run code with no signature at all (and a packaged Electron app's original signature no
// longer matches once our files are inside it), so this re-signs the whole bundle with the "-" (ad-hoc) identity.
// People still have to allow it once (right-click > Open, or System Settings > Privacy & Security > Open Anyway).
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
