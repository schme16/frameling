// "Open with" for Aseprite files, on every desktop, without Frameling taking over the double-click.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() }, dialog: {}, shell: {} }));

import { fileFromArgs } from '../../src/main/library';
// @ts-expect-error plain JS helper
import { ASEPRITE_MIME, desktopEntry, installIntegration, mimeDataDirs, mimeDefined } from '../../scripts/linux-integration.mjs';

const root = path.resolve(__dirname, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const nsh = fs.readFileSync(path.join(root, 'build/installer.nsh'), 'utf8');
const mimeXml = path.join(root, 'build/linux/application-x-aseprite.xml');

// The paths here are written the Linux and macOS way; Windows resolves them with its own separator.
describe.skipIf(process.platform === 'win32')('launching Frameling with an Aseprite file', () => {
  it('takes plain paths, relative to where it was started', () => {
    expect(fileFromArgs(['/x/a.aseprite'])).toBe('/x/a.aseprite');
    expect(fileFromArgs(['--flag', 'b.ASE'], '/work')).toBe('/work/b.ASE');
    expect(fileFromArgs(['/x/readme.txt'])).toBeNull();
  });

  it('takes file:// links, which launchers using %U send', () => {
    expect(fileFromArgs(['file:///home/me/My%20Art/a.aseprite'])).toBe('/home/me/My Art/a.aseprite');
    expect(fileFromArgs(['file:///home/me/x.frameling'])).toBe('/home/me/x.frameling');
    expect(fileFromArgs(['file:///home/me/x.png'])).toBeNull();
    expect(fileFromArgs(['file://%zz.aseprite'])).toBeNull();
  });
});

// The Linux desktop entry and its file type: the paths and the XDG folders only make sense off Windows.
describe.skipIf(process.platform === 'win32')('Linux', () => {
  it('lists the Aseprite type in the AppImage entry and the local launcher', () => {
    expect(pkg.build.linux.mimeTypes).toContain(ASEPRITE_MIME);
    expect(desktopEntry('/a/f.AppImage', '/a/f.png')).toContain(`MimeType=${ASEPRITE_MIME};`);
  });

  it('defines the type from both extensions, with a content check that wins over other .ase files', () => {
    const xml = fs.readFileSync(mimeXml, 'utf8');
    expect(xml).toContain(`type="${ASEPRITE_MIME}"`);
    expect(xml).toContain('*.aseprite');
    expect(xml).toContain('*.ase"');
    expect(xml).toMatch(/offset="4"/);
  });

  it('only defines the type when nobody has', () => {
    const files: Record<string, string> = { '/sys/mime/types': 'text/plain\napplication/x-aseprite\n' };
    const read = (f: string) => files[f] ?? '';
    expect(mimeDefined(ASEPRITE_MIME, ['/home/mime', '/sys'], read)).toBe(true);
    expect(mimeDefined(ASEPRITE_MIME, ['/home/mime', '/other'], read)).toBe(false);
    expect(mimeDataDirs({ XDG_DATA_HOME: '/h', XDG_DATA_DIRS: '/a:/b' }, '/home/x')).toEqual(['/h', '/a', '/b']);
  });

  const have = (cmd: string) => {
    try {
      execFileSync('which', [cmd], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-openwith-'));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it.skipIf(!have('xdg-mime') || !have('update-mime-database') || !have('update-desktop-database'))(
    'with a throwaway data folder: the file type is recognised, Frameling is listed, and the default stays as it was',
    () => {
      const data = path.join(tmp, 'data');
      const apps = path.join(data, 'applications');
      fs.mkdirSync(apps, { recursive: true });
      fs.writeFileSync(path.join(apps, 'aseprite.desktop'), `[Desktop Entry]\nType=Application\nName=Aseprite\nExec=/bin/true %F\nMimeType=${ASEPRITE_MIME};\n`);
      const exe = path.join(tmp, 'frameling.AppImage');
      fs.writeFileSync(exe, '#!/bin/sh\n', { mode: 0o755 });
      const env = { ...process.env, HOME: tmp, XDG_DATA_HOME: data, XDG_DATA_DIRS: '/nonexistent', XDG_CONFIG_HOME: path.join(tmp, 'config') };
      execFileSync('update-desktop-database', [apps], { env });
      const r = installIntegration({ target: exe, icon: path.join(tmp, 'f.png'), mimeXml, env, home: tmp });
      expect(r.wroteMime).toBe(true);
      expect(r.stolen).toBe(false);
      // A real Aseprite header (file size, then the 0xA5E0 magic number) is recognised whatever its name.
      const header = Buffer.alloc(128);
      header.writeUInt16LE(0xa5e0, 4);
      const sample = path.join(tmp, 'sample.bin');
      fs.writeFileSync(sample, header);
      expect(execFileSync('xdg-mime', ['query', 'filetype', sample], { env }).toString().trim()).toBe(ASEPRITE_MIME);
      expect(execFileSync('xdg-mime', ['query', 'default', ASEPRITE_MIME], { env }).toString().trim()).toBe('aseprite.desktop');
      expect(fs.readFileSync(path.join(apps, 'mimeinfo.cache'), 'utf8')).toMatch(/application\/x-aseprite=.*frameling\.desktop/);
      expect(fs.existsSync(path.join(tmp, 'config/mimeapps.list'))).toBe(false);
      // Run again (an update): still fine, still no default.
      expect(installIntegration({ target: exe, icon: path.join(tmp, 'f.png'), mimeXml, env, home: tmp }).stolen).toBe(false);
    },
  );
});

describe('Windows installer', () => {
  it('never makes Frameling the handler through electron-builder file associations', () => {
    expect(JSON.stringify(pkg.build.fileAssociations)).not.toMatch(/ase/);
    expect(JSON.stringify(pkg.build.win ?? {})).not.toMatch(/fileAssociations/);
  });

  it('adds Frameling to Open with for .aseprite and .ase, and never writes their default value', () => {
    const writes = [...nsh.matchAll(/^\s*WriteReg\w+\s+SHCTX\s+"([^"]+)"\s+"([^"]*)"/gm)].map((m) => ({ key: m[1], name: m[2] }));
    for (const ext of ['.aseprite', '.ase']) {
      expect(writes).toContainEqual({ key: `Software\\Classes\\${ext}\\OpenWithProgids`, name: 'Frameling.Aseprite' });
      // Only OpenWithProgids sub keys are touched under the extension; its own (default) value never is.
      expect(writes.filter((w) => w.key.toLowerCase().startsWith(`software\\classes\\${ext}`) && !w.key.endsWith('OpenWithProgids'))).toEqual([]);
    }
    const cmd = nsh.match(/Frameling\.Aseprite\\shell\\open\\command"\s+""\s+'([^']+)'/)?.[1];
    expect(cmd).toBe('"$INSTDIR\\${APP_EXECUTABLE_FILENAME}" "%1"');
    expect(nsh).not.toMatch(/DeleteRegKey\s+SHCTX\s+"Software\\Classes\\\.ase/);
  });

  it('removes only its own entries when uninstalling', () => {
    const un = nsh.slice(nsh.indexOf('customUnInstall'));
    expect(un).toContain('DeleteRegValue SHCTX "Software\\Classes\\.aseprite\\OpenWithProgids" "Frameling.Aseprite"');
    expect(un).toContain('DeleteRegValue SHCTX "Software\\Classes\\.ase\\OpenWithProgids" "Frameling.Aseprite"');
    expect(un).toContain('DeleteRegKey SHCTX "Software\\Classes\\Frameling.Aseprite"');
  });
});

describe('macOS', () => {
  it('offers Aseprite files under Open With as an alternate, not the default', () => {
    const a = pkg.build.mac.fileAssociations;
    expect(a).toHaveLength(1);
    expect(a[0].ext).toEqual(['aseprite', 'ase']);
    expect(a[0].rank).toBe('Alternate');
    expect(a[0].role).toBe('Viewer');
  });
});
