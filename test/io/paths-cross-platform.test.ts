// Windows and macOS path behaviour, checked on any computer with path.win32 / path.posix.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { caseInsensitiveFs, pathKey, safeFileName } from '../../src/main/paths';
import { baseName, dirName, stripExt } from '../../src/io/desktop';
import { candidates } from '../../src/main/video';

describe('pathKey', () => {
  it('treats different letter case as one file on Windows and macOS only', () => {
    expect(pathKey('C:\\Art\\Walk.frameling', 'win32', path.win32)).toBe(pathKey('c:\\art\\WALK.frameling', 'win32', path.win32));
    expect(pathKey('C:/Art/Walk.frameling', 'win32', path.win32)).toBe(pathKey('c:\\art\\walk.frameling', 'win32', path.win32));
    expect(pathKey('/Users/me/Walk.frameling', 'darwin', path.posix)).toBe(pathKey('/users/me/walk.frameling', 'darwin', path.posix));
    expect(pathKey('/home/me/Walk.frameling', 'linux', path.posix)).not.toBe(pathKey('/home/me/walk.frameling', 'linux', path.posix));
    expect(caseInsensitiveFs('linux')).toBe(false);
  });

  it('resolves dots the platform way', () => {
    expect(pathKey('C:\\art\\..\\walk.frameling', 'win32', path.win32)).toBe('c:\\walk.frameling');
    expect(pathKey('\\\\server\\share\\a.flplay', 'win32', path.win32)).toBe('\\\\server\\share\\a.flplay');
  });
});

describe('safeFileName', () => {
  it('keeps only the name, never a folder', () => {
    expect(safeFileName('..\\..\\Windows\\evil.png')).toBe('evil.png');
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('C:\\art\\walk.png')).toBe('walk.png');
  });

  it('avoids names and characters Windows refuses', () => {
    expect(safeFileName('a:b*c?.png')).toBe('a_b_c_.png');
    expect(safeFileName('con.png')).toBe('_con.png');
    expect(safeFileName('LPT1')).toBe('_LPT1');
    expect(safeFileName('console.png')).toBe('console.png');
    expect(safeFileName('walk. ')).toBe('walk');
    expect(safeFileName('..')).toBe('file');
    expect(safeFileName('')).toBe('file');
  });
});

describe('page-side path helpers', () => {
  it('read Windows and POSIX paths alike', () => {
    expect(baseName('C:\\Users\\me\\walk.frameling')).toBe('walk.frameling');
    expect(baseName('/home/me/walk.frameling')).toBe('walk.frameling');
    expect(dirName('C:\\Users\\me\\walk.frameling')).toBe('C:\\Users\\me');
    expect(dirName('C:\\walk.frameling')).toBe('C:\\');
    expect(dirName('/home/me/walk.frameling')).toBe('/home/me');
    expect(stripExt('walk.cycle.frameling')).toBe('walk.cycle');
  });
});

describe('where FFmpeg is looked for', () => {
  it('reads a Windows Path and the usual Windows installs', () => {
    const list = candidates('win32', { Path: 'C:\\Windows;"C:\\Tools\\ffmpeg\\bin";C:\\windows', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', USERPROFILE: 'C:\\Users\\me' });
    expect(list).toContain('C:\\Tools\\ffmpeg\\bin\\ffmpeg.exe');
    expect(list).toContain('C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe');
    expect(list).toContain('C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe');
    expect(list).toContain('C:\\Users\\me\\scoop\\shims\\ffmpeg.exe');
    // C:\Windows and C:\windows are the same folder there.
    expect(list.filter((x) => x.toLowerCase() === 'c:\\windows\\ffmpeg.exe')).toHaveLength(1);
    expect(list.every((x) => !x.includes('/'))).toBe(true);
  });

  it('tries Homebrew on a Mac, where apps opened from the Dock get no shell PATH', () => {
    const list = candidates('darwin', { PATH: '/usr/bin:/bin' });
    expect(list).toEqual(['/usr/bin/ffmpeg', '/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/local/bin/ffmpeg']);
  });

  it('puts FRAMELING_FFMPEG first', () => {
    expect(candidates('linux', { FRAMELING_FFMPEG: '/opt/ff/ffmpeg', PATH: '' })[0]).toBe('/opt/ff/ffmpeg');
  });
});
