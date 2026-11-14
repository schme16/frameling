// The Linux launcher (build/linux/launcher.sh) and the step that puts it in front of the program. The launcher's real
// behaviour on a real Ubuntu 24.04 (the safety layer refused until an AppArmor profile allows it, Wayland and X11) still
// needs a run on that system; these tests cover the branches with a stand-in program and a stand-in `unshare`.
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { NSS_NOISE_PATTERN } from '../../src/main/stderrNoise';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const launcher = path.join(root, 'build/linux/launcher.sh');
// The launcher is a Linux shell script for the Linux build, so it is only run on Linux. Windows has git-bash and
// macOS has bash, but neither has the rest of what it leans on.
const canRun = process.platform === 'linux' && spawnSync('bash', ['--version']).status === 0;

/** A folder shaped like the unpacked Linux app: the launcher as `frameling`, and a stand-in `frameling.bin` that prints its arguments. */
function fakeApp(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'frameling-launcher-'));
  copyFileSync(launcher, path.join(dir, 'frameling'));
  writeFileSync(path.join(dir, 'frameling.bin'), '#!/usr/bin/env bash\necho "ARGS: $*"\n');
  chmodSync(path.join(dir, 'frameling'), 0o755);
  chmodSync(path.join(dir, 'frameling.bin'), 0o755);
  return dir;
}
const run = (dir: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync(path.join(dir, 'frameling'), args, { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', HOME: dir, XDG_CONFIG_HOME: path.join(dir, 'cfg'), ...env } });

describe.skipIf(!canRun)('Linux launcher', () => {
  // The flags that turn the card on. They lead every start, so the tests say so once here rather than in each line.
  // The default says yes to the card and nothing more. The fuller set blanked the canvas on an NVIDIA driver, so
  // it is behind FRAMELING_GPU=full (see the gpu-blank-canvas card).
  const GPU = '--ignore-gpu-blocklist';
  const GPU_FULL = `${GPU} --enable-zero-copy --canvas-oop-rasterization`;
  const GPU_VULKAN = `${GPU} --enable-features=Vulkan,DefaultANGLEVulkan`;
  it('is valid shell', () => {
    execFileSync('bash', ['-n', launcher]);
  });

  it('starts the program with the safety layer on when no flag is given', () => {
    const r = run(fakeApp(), ['file.frameling']);
    expect(r.stdout.trim()).toBe(`ARGS: ${GPU} file.frameling`);
  });

  it('keeps a --no-sandbox that was asked for through FRAMELING_NO_SANDBOX', () => {
    const r = run(fakeApp(), ['--no-sandbox', 'a'], { FRAMELING_NO_SANDBOX: '1' });
    expect(r.stdout.trim()).toBe(`ARGS: --no-sandbox ${GPU} a`);
  });

  it('keeps a --no-sandbox that was asked for before, and remembered', () => {
    const dir = fakeApp();
    mkdirSync(path.join(dir, 'cfg/Frameling'), { recursive: true });
    writeFileSync(path.join(dir, 'cfg/Frameling/no-sandbox-ok'), '');
    expect(run(dir, ['--no-sandbox']).stdout.trim()).toBe(`ARGS: --no-sandbox ${GPU}`);
  });

  it('holds the same certificate-line pattern as the one the app code names', () => {
    expect(readFileSync(launcher, 'utf8')).toContain(`NSS_NOISE='${NSS_NOISE_PATTERN}'`);
  });

  it('drops only the harmless certificate line from the errors, keeps the rest, and keeps the exit code', () => {
    const dir = fakeApp();
    writeFileSync(
      path.join(dir, 'frameling.bin'),
      [
        '#!/usr/bin/env bash',
        'echo "out line"',
        'echo "[1:2:ERROR:crypto/nss_util.cc:382] After loading Root Certs, loaded==false: NSS error code: -8018" >&2',
        'echo "[1:2:ERROR:gpu_process_host.cc:1] GPU process exited unexpectedly" >&2',
        'echo "[1:2:ERROR:crypto/nss_util.cc:382] After loading Root Certs, loaded==false: NSS error code: -8000" >&2',
        'exit 7',
        '',
      ].join('\n'),
    );
    const r = run(dir, []);
    expect(r.stdout.trim()).toBe('out line');
    expect(r.stderr).not.toContain('-8018');
    expect(r.stderr).toContain('GPU process exited unexpectedly');
    expect(r.stderr).toContain('NSS error code: -8000');
    expect(r.status).toBe(7);
  });

  it('picks the window system by hand with FRAMELING_OZONE', () => {
    expect(run(fakeApp(), [], { FRAMELING_OZONE: 'x11' }).stdout.trim()).toBe(`ARGS: --ozone-platform=x11 ${GPU}`);
    expect(run(fakeApp(), [], { FRAMELING_OZONE: 'wayland' }).stdout.trim()).toBe(`ARGS: --ozone-platform=wayland ${GPU}`);
    expect(run(fakeApp(), [], { FRAMELING_OZONE: 'auto' }).stdout.trim()).toBe(`ARGS: --ozone-platform-hint=auto ${GPU}`);
  });

  it('asks nothing when it cannot ask: user namespaces refused, then a start without the safety layer', () => {
    const dir = fakeApp();
    // A program that dies the way Chromium does when the safety layer is refused, unless it is told not to use it.
    writeFileSync(path.join(dir, 'frameling.bin'), '#!/usr/bin/env bash\nif [ "$1" = --no-sandbox ]; then echo "ARGS: $*"; else echo "FATAL: No usable sandbox! namespace" >&2; exit 1; fi\n');
    mkdirSync(path.join(dir, 'fakebin'));
    writeFileSync(path.join(dir, 'fakebin/unshare'), '#!/bin/sh\nexit 1\n');
    chmodSync(path.join(dir, 'fakebin/unshare'), 0o755);
    const env = { PATH: `${path.join(dir, 'fakebin')}:${process.env.PATH ?? ''}` };
    // AppRun adds --no-sandbox when it can't make a user namespace; the launcher tries without it first, then falls back.
    const r = run(dir, ['--no-sandbox', 'a.frameling'], env);
    expect(r.stdout.trim()).toBe(`ARGS: --no-sandbox ${GPU} a.frameling`);
    expect(r.stderr).toContain('Starting without it');
    expect(r.stderr).toContain('--show-linux-fix');
  });

  it('adds the fuller graphics set only when it is asked for', () => {
    const r = run(fakeApp(), ['file.frameling'], { FRAMELING_GPU: 'full' });
    expect(r.stdout.trim()).toBe(`ARGS: ${GPU_FULL} file.frameling`);
    expect(r.stderr).toContain('canvas pixels on the card');
    expect(r.stdout).not.toContain('Vulkan');
  });

  it('Vulkan is its own thing, says what it did, and is in no other mode', () => {
    const r = run(fakeApp(), ['file.frameling'], { FRAMELING_GPU: 'vulkan' });
    expect(r.stdout.trim()).toBe(`ARGS: ${GPU_VULKAN} file.frameling`);
    expect(r.stderr).toContain('drew nothing at all');
    for (const v of [undefined, 'full', 'off']) expect(run(fakeApp(), [], v ? { FRAMELING_GPU: v } : {}).stdout).not.toContain('Vulkan');
  });

  it('leaves the card out when it is switched off by hand', () => {
    const r = run(fakeApp(), ['file.frameling'], { FRAMELING_GPU: 'off' });
    expect(r.stdout.trim()).toBe('ARGS: --disable-gpu file.frameling');
    expect(r.stderr).toContain('drawing in software');
  });

  it('prints the fix with --show-linux-fix', () => {
    const r = run(fakeApp(), ['--show-linux-fix']);
    expect(r.stdout).toContain('/etc/apparmor.d/frameling');
    expect(r.stdout).toContain('apparmor_restrict_unprivileged_userns');
    expect(r.stdout).not.toContain('ARGS:');
  });

  it('the fix names the path of the program the launcher starts', () => {
    expect(readFileSync(launcher, 'utf8')).toContain('/tmp/{.mount_*,appimage_extracted_*}/frameling.bin');
  });
});

describe('after-pack', () => {
  it('moves the program aside and puts the launcher in its place, on Linux only', async () => {
    const require = createRequire(import.meta.url);
    const afterPack = require(path.join(root, 'build/after-pack.cjs')).default as (c: unknown) => Promise<void>;
    const dir = mkdtempSync(path.join(os.tmpdir(), 'frameling-pack-'));
    writeFileSync(path.join(dir, 'frameling'), 'the real program');
    await afterPack({ electronPlatformName: 'linux', appOutDir: dir, packager: { executableName: 'frameling' } });
    expect(readFileSync(path.join(dir, 'frameling.bin'), 'utf8')).toBe('the real program');
    expect(readFileSync(path.join(dir, 'frameling'), 'utf8')).toBe(readFileSync(launcher, 'utf8'));
    const win = mkdtempSync(path.join(os.tmpdir(), 'frameling-pack-'));
    writeFileSync(path.join(win, 'frameling.exe'), 'x');
    await afterPack({ electronPlatformName: 'win32', appOutDir: win, packager: { executableName: 'frameling' } });
    expect(existsSync(path.join(win, 'frameling.exe.bin'))).toBe(false);
  });
});
