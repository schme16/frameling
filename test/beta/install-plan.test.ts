// What `npm run install-local` decides about the ordinary and the beta copy: who sees the key, what is skipped, and
// what the two copies keep apart. The building and copying themselves are run for real, see docs/testing.md.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PROFILE, profileFolderName } from '../../src/main/profileName';
// @ts-expect-error plain JS helpers
import { BETA_VARIABLES, betaEnv, betaSkipReason, ingestKey, installPaths, ordinaryEnv } from '../../scripts/install-plan.mjs';
// @ts-expect-error plain JS helper
import { desktopEntry, installIntegration } from '../../scripts/linux-integration.mjs';

const KEY = 'pbk_TEST_ONLY_NOT_A_KEY';
const mimeXml = path.resolve(__dirname, '../../build/linux/application-x-aseprite.xml');

describe('the ordinary build', () => {
  it('never sees the key, the board address, the beta switch or the profile', () => {
    const env = ordinaryEnv({ PATH: '/bin', FRAMELING_INGEST_KEY: KEY, FRAMELING_INGEST_URL: 'https://x.example', FRAMELING_BETA: '1', FRAMELING_PROFILE: 'beta' });
    expect(env).toEqual({ PATH: '/bin' });
    for (const name of BETA_VARIABLES) expect(env).not.toHaveProperty(name);
  });
  it('leaves the caller environment alone', () => {
    const env = { FRAMELING_INGEST_KEY: KEY };
    ordinaryEnv(env);
    expect(env.FRAMELING_INGEST_KEY).toBe(KEY);
  });
});

describe('the beta build', () => {
  it('keeps the key, asks to stop without one, and takes its own profile', () => {
    expect(betaEnv({ PATH: '/bin', FRAMELING_INGEST_KEY: `  ${KEY}\n` })).toEqual({ PATH: '/bin', FRAMELING_INGEST_KEY: KEY, FRAMELING_BETA: '1', FRAMELING_PROFILE: 'beta' });
  });
  it('is skipped with one plain line when there is no key, and that line never holds a key', () => {
    expect(betaSkipReason({ FRAMELING_INGEST_KEY: KEY })).toBeNull();
    for (const env of [{}, { FRAMELING_INGEST_KEY: '' }, { FRAMELING_INGEST_KEY: '   ' }]) {
      const why = betaSkipReason(env);
      expect(why).toMatch(/FRAMELING_INGEST_KEY is not set/);
      expect(why).not.toContain('\n');
      expect(why).not.toContain('—');
    }
    expect(ingestKey({})).toBe('');
  });
});

describe('the two copies side by side', () => {
  it('have their own file, icon and build folder', () => {
    const p = installPaths('/apps/frameling');
    expect(p.ordinary.target).toBe('/apps/frameling/frameling.AppImage');
    expect(p.beta.target).toBe('/apps/frameling/frameling.beta.AppImage');
    expect(new Set([p.ordinary.target, p.beta.target, p.ordinary.icon, p.beta.icon, p.ordinary.built, p.beta.built]).size).toBe(6);
  });
  it('keep their settings in separate folders', () => {
    expect(PROFILE).toBe('');
    expect(profileFolderName('')).toBeNull();
    expect(profileFolderName('beta')).toBe('Frameling Beta');
    expect(profileFolderName('../beta')).toBe('Frameling Beta');
  });
  it('get separate launchers, and only the ordinary one takes the file type', () => {
    const plain = desktopEntry('/a/frameling.AppImage', '/a/f.png');
    const beta = desktopEntry('/a/frameling.beta.AppImage', '/a/b.png', { beta: true });
    expect(plain).toContain('Name=Frameling\n');
    expect(plain).toContain('MimeType=');
    expect(beta).toContain('Name=Frameling Beta\n');
    expect(beta).not.toContain('MimeType=');
    expect(beta).toContain('frameling.beta.AppImage');
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-beta-install-'));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
  it('write the beta launcher without touching the ordinary one or the mime folder', () => {
    const env = { ...process.env, HOME: tmp, XDG_DATA_HOME: path.join(tmp, 'data'), XDG_DATA_DIRS: '/nonexistent' };
    const first = installIntegration({ target: '/a/frameling.AppImage', icon: '/a/f.png', mimeXml, env, home: tmp });
    const ordinary = fs.readFileSync(first.launcher, 'utf8');
    const mimeFile = path.join(tmp, 'data/mime/packages/application-x-aseprite.xml');
    const mimeBefore = fs.existsSync(mimeFile) ? fs.statSync(mimeFile).mtimeMs : null;
    const second = installIntegration({ target: '/a/frameling.beta.AppImage', icon: '/a/b.png', mimeXml, beta: true, env, home: tmp });
    expect(path.basename(first.launcher)).toBe('frameling.desktop');
    expect(path.basename(second.launcher)).toBe('frameling-beta.desktop');
    expect(fs.readFileSync(first.launcher, 'utf8')).toBe(ordinary);
    expect(second).toMatchObject({ wroteMime: false, stolen: false });
    expect(fs.existsSync(mimeFile) ? fs.statSync(mimeFile).mtimeMs : null).toBe(mimeBefore);
  });
});
