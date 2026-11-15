// Registering frameling:// links on Linux: the launcher, and the desktop's idea of who opens them. Pure planning, then the
// real thing against a throwaway home with the real xdg tools where they are installed.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LAUNCHER, SCHEME_MIME, ensureLinuxHandler, execTarget, launcherText, planLauncher, shouldClaim, withExec, withScheme, type LinuxIO } from '../../src/main/linkHandler';

const img = '/apps/frameling/frameling.AppImage';

describe('the launcher text', () => {
  it('runs the AppImage with %U and lists the link type', () => {
    const t = launcherText(img, 'frameling');
    expect(t).toContain(`Exec="${img}" %U`);
    expect(t).toContain(`MimeType=${SCHEME_MIME};`);
    expect(execTarget(t)).toBe(img);
  });

  it('reads an Exec line with or without quotes, and with spaces in the path', () => {
    expect(execTarget('Exec="/a b/c.AppImage" %U')).toBe('/a b/c.AppImage');
    expect(execTarget('Exec=/a/c.AppImage %U')).toBe('/a/c.AppImage');
    expect(execTarget('Name=x')).toBeNull();
  });

  it('adds the link type to a MimeType line, once, keeping what was there', () => {
    const old = '[Desktop Entry]\nExec=x\nMimeType=application/x-aseprite;\nIcon=y\n';
    const next = withScheme(old);
    expect(next).toContain(`MimeType=application/x-aseprite;${SCHEME_MIME};`);
    expect(withScheme(next)).toBe(next);
    expect(withScheme('[Desktop Entry]\nExec=x\n')).toContain(`MimeType=${SCHEME_MIME};`);
  });
});

describe('what to do about the launcher', () => {
  const none = () => false;
  it('writes one when there is none', () => {
    const p = planLauncher({ appImage: img, iconName: 'frameling', existing: null, targetExists: none });
    expect(p.do).toBe('write');
  });

  it('leaves a launcher that is already right', () => {
    const ok = launcherText(img, 'frameling');
    expect(planLauncher({ appImage: img, iconName: 'frameling', existing: ok, targetExists: none })).toEqual({ do: 'none' });
  });

  it('adds the link type to our launcher when only that is missing (the one install-local used to write)', () => {
    const old = `[Desktop Entry]\nName=Frameling\nExec="${img}" %U\nMimeType=application/x-aseprite;\n`;
    const p = planLauncher({ appImage: img, iconName: 'frameling', existing: old, targetExists: none });
    expect(p.do === 'write' && p.text).toContain(SCHEME_MIME);
  });

  it('follows the AppImage when the launcher points at a place that has gone', () => {
    const old = '[Desktop Entry]\nName=Frameling\nExec="/old/place.AppImage" %U\n';
    const p = planLauncher({ appImage: img, iconName: 'frameling', existing: old, targetExists: none });
    expect(p.do === 'write' && p.text).toContain(`Exec="${img}" %U`);
    expect(p.do === 'write' && p.text).toContain(SCHEME_MIME);
    expect(withExec(old, img)).toContain(img);
  });

  it('leaves a launcher that runs another copy that is still there', () => {
    const old = '[Desktop Entry]\nName=Frameling\nExec="/other/frameling" %U\n';
    expect(planLauncher({ appImage: img, iconName: 'frameling', existing: old, targetExists: (p) => p === '/other/frameling' }).do).toBe('leave');
  });
});

describe('who opens links', () => {
  it('claims them only when nobody does, or whoever did has gone', () => {
    expect(shouldClaim('', true)).toBe(true);
    expect(shouldClaim('other.desktop', true)).toBe(false);
    expect(shouldClaim('other.desktop', false)).toBe(true);
    expect(shouldClaim(LAUNCHER, true)).toBe(false);
  });
});

function fake(over: Partial<LinuxIO> & { files?: Record<string, string>; handler?: string }) {
  const files: Record<string, string> = { ...(over.files ?? {}) };
  const ran: string[] = [];
  const io: LinuxIO = {
    env: { APPIMAGE: img, XDG_DATA_HOME: '/h/data', XDG_DATA_DIRS: '/usr/share' } as NodeJS.ProcessEnv,
    home: '/h',
    icon: '/app/icon.png',
    read: (f) => files[f] ?? null,
    write: (f, t) => void (files[f] = t),
    copy: (a, b) => void (files[b] = `copy of ${a}`),
    exists: (f) => f in files || f === img,
    exec: async (cmd, args) => {
      ran.push([cmd, ...args].join(' '));
      if (cmd === 'xdg-mime' && args[0] === 'query') return over.handler ?? '';
      return '';
    },
    ...over,
  };
  return { io, files, ran };
}

describe('registering at start (Linux, from an AppImage)', () => {
  it('writes the launcher and its picture, then claims the link type', async () => {
    const t = fake({ files: { '/app/icon.png': 'png' } });
    const did = await ensureLinuxHandler(t.io);
    expect(did).toEqual(['wrote the launcher', 'made Frameling the opener for links']);
    expect(t.files['/h/data/applications/frameling.desktop']).toContain(`Exec="${img}" %U`);
    expect(t.files['/h/data/icons/hicolor/512x512/apps/frameling.png']).toBeDefined();
    expect(t.ran).toContain(`xdg-mime default ${LAUNCHER} ${SCHEME_MIME}`);
  });

  it('does nothing at all when everything is already right', async () => {
    const t = fake({ handler: LAUNCHER, files: { '/h/data/applications/frameling.desktop': launcherText(img, 'frameling') } });
    expect(await ensureLinuxHandler(t.io)).toEqual([]);
    expect(t.ran).toEqual([`xdg-mime query default ${SCHEME_MIME}`]);
  });

  it('does not take links from another program the person chose', async () => {
    const t = fake({ handler: 'other.desktop', files: { '/usr/share/applications/other.desktop': 'x', '/h/data/applications/frameling.desktop': launcherText(img, 'frameling') } });
    expect(await ensureLinuxHandler(t.io)).toEqual([]);
    expect(t.ran.some((c) => c.startsWith('xdg-mime default'))).toBe(false);
  });

  it('does nothing outside an AppImage, and never throws', async () => {
    expect(await ensureLinuxHandler(fake({ env: {} as NodeJS.ProcessEnv }).io)).toEqual(['not an AppImage']);
    const t = fake({ write: () => { throw new Error('read only'); } });
    expect(await ensureLinuxHandler(t.io)).toEqual(['could not finish']);
  });
});

const have = (cmd: string) => {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

describe.skipIf(process.platform === 'win32' || !have('xdg-mime'))('with the real xdg tools and a throwaway home', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-link-'));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('the desktop then says Frameling opens frameling:// links', async () => {
    const data = path.join(tmp, 'data');
    const exe = path.join(tmp, 'frameling.AppImage');
    fs.writeFileSync(exe, '#!/bin/sh\n', { mode: 0o755 });
    const env = { ...process.env, HOME: tmp, XDG_DATA_HOME: data, XDG_DATA_DIRS: '/nonexistent', XDG_CONFIG_HOME: path.join(tmp, 'config'), APPIMAGE: exe };
    const { execFile } = await import('node:child_process');
    const exec: LinuxIO['exec'] = (cmd, args) =>
      new Promise((res) => execFile(cmd, args, { env }, (err, out) => res(err ? null : out.toString().trim())));
    const io: LinuxIO = {
      env,
      home: tmp,
      icon: path.join(tmp, 'none.png'),
      read: (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null),
      write: (f, t) => {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, t);
      },
      copy: () => {},
      exists: (f) => fs.existsSync(f),
      exec,
    };
    expect((await ensureLinuxHandler(io)).length).toBeGreaterThan(0);
    expect(execFileSync('xdg-mime', ['query', 'default', SCHEME_MIME], { env }).toString().trim()).toBe(LAUNCHER);
    // A second start has nothing left to do.
    expect(await ensureLinuxHandler(io)).toEqual([]);
  });
});

// What the packaged Windows and macOS builds are configured to register. This checks the files, not a real Windows or Mac.
describe('the installer and app settings that register frameling:// links', () => {
  const root = path.resolve(__dirname, '../..');
  const nsh = fs.readFileSync(path.join(root, 'build/installer.nsh'), 'utf8');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cfg = require(path.join(root, 'electron-builder.cjs'));

  it('macOS lists the scheme (electron-builder turns it into the app\'s URL types)', () => {
    expect(cfg.protocols).toEqual([{ name: 'Frameling link', schemes: ['frameling'] }]);
  });

  it('Windows registers it for whoever installed (SHCTX), running the installed .exe with the link as its argument', () => {
    expect(nsh).toContain('WriteRegStr SHCTX "Software\\Classes\\frameling" "URL Protocol" ""');
    expect(nsh).toMatch(/frameling\\shell\\open\\command"\s+""\s+'"\$INSTDIR\\\$\{APP_EXECUTABLE_FILENAME\}" "%1"'/);
    expect(nsh).toContain('DeleteRegKey SHCTX "Software\\Classes\\frameling"');
  });

  it('Linux lists the scheme in the AppImage\'s own launcher', () => {
    expect(cfg.linux.mimeTypes).toContain(SCHEME_MIME);
  });
});
