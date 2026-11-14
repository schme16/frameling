// The switch that works from outside the app: where the gpu-off file is, that turning hardware drawing off writes it and
// back on removes it, and that the app then leaves the card out (and asks for it when the file is not there).
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hardwareSwitches } from '../../src/main/gpuFlags';
import { GPU_OFF_FILE, gpuOffPath, gpuOffState, parseVramBytes, setGpuOffFile } from '../../src/main/gpuFile';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'frameling-gpu-'));

describe('where the file is', () => {
  it('is where the Linux launcher looks', () => {
    expect(gpuOffPath({ platform: 'linux', env: {}, home: '/home/a', appData: '/x' })).toBe('/home/a/.config/Frameling/gpu-off');
    expect(gpuOffPath({ platform: 'linux', env: { XDG_CONFIG_HOME: '/cfg' }, home: '/home/a', appData: '/x' })).toBe('/cfg/Frameling/gpu-off');
  });
  it('is in the app data folder on Windows and the Mac', () => {
    expect(gpuOffPath({ platform: 'win32', env: {}, home: 'C:/Users/a', appData: 'C:/Users/a/AppData/Roaming' }).replace(/\\/g, '/')).toBe('C:/Users/a/AppData/Roaming/Frameling/gpu-off');
    expect(gpuOffPath({ platform: 'darwin', env: {}, home: '/Users/a', appData: '/Users/a/Library/Application Support' })).toBe('/Users/a/Library/Application Support/Frameling/gpu-off');
  });
});

describe('writing it', () => {
  it('turns hardware drawing off by making the file, and on by removing it', () => {
    const file = path.join(tmp(), 'cfg', 'Frameling', GPU_OFF_FILE);
    expect(gpuOffState(file, {}).file).toBe(false);
    expect(setGpuOffFile(file, true)).toBeNull();
    expect(existsSync(file)).toBe(true);
    expect(gpuOffState(file, {})).toEqual({ file: true, env: false });
    expect(setGpuOffFile(file, false)).toBeNull();
    expect(existsSync(file)).toBe(false);
    // Taking away a file that is not there is fine.
    expect(setGpuOffFile(file, false)).toBeNull();
  });
  it('says in plain words when it cannot', () => {
    const dir = tmp();
    writeFileSync(path.join(dir, 'blocker'), '');
    expect(setGpuOffFile(path.join(dir, 'blocker', 'Frameling', 'gpu-off'), true)).toMatch(/could not write/);
  });
  it('sees FRAMELING_GPU=off too', () => expect(gpuOffState('/nowhere/gpu-off', { FRAMELING_GPU: 'off' })).toEqual({ file: false, env: true }));
});

describe('card memory from the system', () => {
  it('reads a number of bytes and nothing else', () => {
    expect(parseVramBytes('17163091968\n')).toBe(17163091968);
    expect(parseVramBytes('')).toBeNull();
    expect(parseVramBytes('n/a')).toBeNull();
    expect(parseVramBytes('0')).toBeNull();
  });
});

describe('the app reads what Preferences writes', () => {
  // What applyGpuOff (src/main/gpu.ts) does, minus Electron: the file or the variable means off, else the card is asked for.
  function switchesWith(prepare: (cfg: string) => void, env: Record<string, string> = {}): string[] {
    const cfg = path.join(tmp(), 'cfg');
    prepare(cfg);
    const off = gpuOffState(home(cfg), env);
    return hardwareSwitches(env, 'linux', off.file || off.env).switches.map(([k]) => `--${k}`);
  }
  const home = (cfg: string) => gpuOffPath({ platform: 'linux', env: { XDG_CONFIG_HOME: cfg }, home: '/unused', appData: '/unused' });
  it('asks for the card when the file is not there', () => expect(switchesWith(() => {})).toContain('--ignore-gpu-blocklist'));
  it('asks for nothing once the switch has written the file', () => {
    expect(switchesWith((cfg) => expect(setGpuOffFile(home(cfg), true)).toBeNull())).toEqual([]);
  });
  it('asks for the card again once the switch has taken it away', () => {
    const out = switchesWith((cfg) => {
      setGpuOffFile(home(cfg), true);
      setGpuOffFile(home(cfg), false);
    });
    expect(out).toContain('--ignore-gpu-blocklist');
  });
  it('asks for nothing with FRAMELING_GPU=off', () => expect(switchesWith(() => {}, { FRAMELING_GPU: 'off' })).toEqual([]));
});
