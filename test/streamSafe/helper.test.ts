import { afterEach, describe, expect, it } from 'vitest';
import { displayFolder, displayName, displayPath, displaySecret, hasPath, HIDDEN, kindOfPath, MY_NAME, scrubText, setStreamSafe, streamSafe, subscribeStreamSafe } from '../../src/core/streamSafe';

afterEach(() => setStreamSafe(false));

describe('stream-safe helper, switched off', () => {
  it('changes nothing at all', () => {
    expect(streamSafe()).toBe(false);
    expect(displayPath('/home/you/art/secret.frameling')).toBe('/home/you/art/secret.frameling');
    expect(displayFolder('/home/you/art')).toBe('/home/you/art');
    expect(displayName('Shane Gadsby')).toBe('Shane Gadsby');
    expect(displaySecret('sk-12345')).toBe('sk-12345');
    expect(scrubText('Could not open "/home/you/a b/x.png".')).toBe('Could not open "/home/you/a b/x.png".');
  });
});

describe('stream-safe helper, switched on', () => {
  it('gives a file a friendly stand-in by what it is', () => {
    setStreamSafe(true);
    expect(displayPath('/home/you/art/secret.frameling')).toBe('My drawing');
    expect(displayPath('C:\\Users\\you\\Pictures\\me-and-mum.PNG')).toBe('My picture');
    expect(displayPath('/x/y/theme-song.wav')).toBe('My sound');
    expect(displayPath('/x/clip.mp4')).toBe('My video');
    expect(displayPath('/x/y/notes')).toBe('A file');
  });
  it('gives a folder its own stand-in, and numbers rows so they stay apart', () => {
    setStreamSafe(true);
    expect(displayFolder('/home/you/clients/acme')).toBe('A folder');
    expect(displayPath('/home/you/a.frameling', { n: 2 })).toBe('My drawing 2');
    expect(displayPath('/home/you', { kind: 'folder', n: 3 })).toBe('A folder 3');
  });
  it('leaves nothing of the original in the stand-in', () => {
    setStreamSafe(true);
    for (const p of ['/home/shane/secret-client/logo.frameling', 'D:\\Dropbox\\Taxes 2026\\x.png', '/mnt/usb/passwords']) {
      const out = displayPath(p);
      expect(out).not.toMatch(/shane|secret|Dropbox|Taxes|passwords|usb|home|logo/i);
    }
  });
  it('keeps empty things empty', () => {
    setStreamSafe(true);
    expect(displayPath('')).toBe('');
    expect(displayName('')).toBe('');
    expect(displayName('  ')).toBe('  ');
    expect(displaySecret('')).toBe('');
  });
  it('hides names and secrets', () => {
    setStreamSafe(true);
    expect(displayName('Shane Gadsby')).toBe(MY_NAME);
    expect(displaySecret('me@example.com')).toBe(HIDDEN);
    expect(displaySecret('me@example.com')).not.toContain('example');
  });
  it('tells the app when the switch flips, and only then', () => {
    let n = 0;
    const off = subscribeStreamSafe(() => n++);
    setStreamSafe(true);
    setStreamSafe(true);
    setStreamSafe(false);
    off();
    setStreamSafe(true);
    expect(n).toBe(2);
  });
});

describe('scrubText: paths inside a sentence', () => {
  const cases: [string, string][] = [
    ['Saved to /home/you/art/secret.frameling.', 'Saved to My drawing.'],
    ["ENOENT: no such file or directory, open '/home/you/My Art/x.png'", "ENOENT: no such file or directory, open 'My picture'"],
    ['Could not read "C:\\Users\\you\\Documents\\Some Folder\\a.frameling" just now', 'Could not read "My drawing" just now'],
    ['Exported 3 files to /home/you/out/', 'Exported 3 files to A folder'],
    ['Looking in ~/art/frames now', 'Looking in A folder now'],
    ['Plugin from \\\\nas\\share\\plugins\\cool installed', 'Plugin from A folder installed'],
    ['Opened /mnt/109313D2109313D2/projects/a.png, then /tmp/b.wav.', 'Opened My picture, then My sound.'],
  ];
  for (const [input, expected] of cases)
    it(`${input.slice(0, 40)}...`, () => {
      setStreamSafe(true);
      expect(scrubText(input)).toBe(expected);
    });
  it('does not touch ordinary words, ratios, web addresses or and/or', () => {
    setStreamSafe(true);
    for (const t of ['Use pen and/or brush', 'Zoom is 1/2 of 100%', 'See https://frameling.app/help/saving for more', 'Frame 3 of 10', 'Pick a size (px/mm)', 'Undo: Move 3 layers']) expect(scrubText(t)).toBe(t);
  });
  it('knows a path when it sees one', () => {
    expect(hasPath('open /home/a/b.png')).toBe(true);
    expect(hasPath('open "C:\\a\\b.png"')).toBe(true);
    expect(hasPath('hello and/or goodbye')).toBe(false);
  });
});

describe('kindOfPath', () => {
  it('reads the ending, whatever the case or separator', () => {
    expect(kindOfPath('a/b/c.FRAMELING')).toBe('drawing');
    expect(kindOfPath('a\\b\\c.svg')).toBe('picture');
    expect(kindOfPath('folder/')).toBe('');
    expect(kindOfPath('noext')).toBe('');
  });
});
