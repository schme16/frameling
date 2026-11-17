// Code that works out a Linux or Mac place must build a Linux or Mac path whatever machine it runs on. CI runs these on
// Windows, where node's path makes backslashes, so here `node:path` is the Windows one for everything under test and the
// Linux answers must still come back with slashes. (On a Linux checkout this is the only way to see the Windows machine.)
import { describe, expect, it, vi } from 'vitest';

vi.mock('node:path', async (orig) => {
  const a = await orig<typeof import('node:path')>();
  return { ...a.win32, default: a.win32 };
});

import nodePath from 'node:path';
import { gpuOffPath } from '../../src/main/gpuFile';
import { readCards, type SysfsIO } from '../../src/main/gpuPick';
import { LAUNCHER, SCHEME_MIME, applicationDirs, ensureLinuxHandler, launcherText, type LinuxIO } from '../../src/main/linkHandler';

describe('on a machine whose paths use backslashes', () => {
  it('really is that machine here', () => expect(nodePath.join('a', 'b')).toBe('a\\b'));

  it('the Linux gpu-off file is still a Linux path, and the Mac one a Mac path', () => {
    expect(gpuOffPath({ platform: 'linux', env: {}, home: '/home/a', appData: '/x' })).toBe('/home/a/.config/Frameling/gpu-off');
    expect(gpuOffPath({ platform: 'linux', env: { XDG_CONFIG_HOME: '/cfg' }, home: '/home/a', appData: '/x' })).toBe('/cfg/Frameling/gpu-off');
    expect(gpuOffPath({ platform: 'darwin', env: {}, home: '/Users/a', appData: '/Users/a/Library/Application Support' })).toBe('/Users/a/Library/Application Support/Frameling/gpu-off');
  });

  it('the Windows gpu-off file is a Windows path', () => {
    expect(gpuOffPath({ platform: 'win32', env: {}, home: 'C:\\Users\\a', appData: 'C:\\Users\\a\\AppData\\Roaming' })).toBe('C:\\Users\\a\\AppData\\Roaming\\Frameling\\gpu-off');
  });

  it('the launcher folders are Linux ones', () => {
    expect(applicationDirs({ XDG_DATA_HOME: '/h/data', XDG_DATA_DIRS: '/usr/share' } as NodeJS.ProcessEnv, '/h')).toEqual(['/h/data/applications', '/usr/share/applications']);
  });

  it('registering the link handler writes the launcher where Linux looks for it', async () => {
    const img = '/apps/frameling/frameling.AppImage';
    const files: Record<string, string> = { '/app/icon.png': 'png' };
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
        return '';
      },
    };
    expect(await ensureLinuxHandler(io)).toEqual(['wrote the launcher', 'made Frameling the opener for links']);
    expect(files['/h/data/applications/frameling.desktop']).toBe(launcherText(img, 'frameling'));
    expect(files['/h/data/icons/hicolor/512x512/apps/frameling.png']).toBeDefined();
    expect(ran).toContain(`xdg-mime default ${LAUNCHER} ${SCHEME_MIME}`);
  });

  it('the card list reads /sys with slashes', () => {
    const ROOT = '/sys/bus/pci/devices';
    const seen: string[] = [];
    const io: SysfsIO = {
      readdir: () => ['0000:01:00.0'],
      read: (f) => {
        seen.push(f);
        return f.endsWith('/class') ? '0x030000' : f.endsWith('/vendor') ? '0x10de' : f.endsWith('/device') ? '0x2702' : null;
      },
      readlink: (f) => (f === `${ROOT}/0000:01:00.0/driver` ? '/sys/bus/pci/drivers/nvidia' : null),
    };
    expect(readCards(ROOT, io)).toEqual([{ pci: '0000:01:00.0', vendorId: 0x10de, deviceId: 0x2702, driver: 'nvidia', vramBytes: undefined }]);
    expect(seen.every((f) => !f.includes('\\'))).toBe(true);
  });
});
