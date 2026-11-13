// The choices install-local makes, kept apart from the building and copying so tests can run them.
import path from 'node:path';

/** Environment names that make a build a beta one. The ordinary build never sees them. */
export const BETA_VARIABLES = ['FRAMELING_INGEST_KEY', 'FRAMELING_INGEST_URL', 'FRAMELING_BETA', 'FRAMELING_PROFILE'];

/** The key from the environment, or '' when there is none (blank counts as none). */
export const ingestKey = (env) => (env.FRAMELING_INGEST_KEY ?? '').trim();

/** The environment for the ordinary build: no key, no profile, so it can never end up able to send. */
export function ordinaryEnv(env) {
  const out = { ...env };
  for (const name of BETA_VARIABLES) delete out[name];
  return out;
}

/** The environment for the beta build: the key kept, FRAMELING_BETA so a build without one stops, its own profile. */
export function betaEnv(env) {
  return { ...env, FRAMELING_INGEST_KEY: ingestKey(env), FRAMELING_BETA: '1', FRAMELING_PROFILE: 'beta' };
}

/** Why there is no beta this time, or null when there should be one. Never contains the key. */
export function betaSkipReason(env) {
  return ingestKey(env) ? null : 'No beta copy this time: FRAMELING_INGEST_KEY is not set in the environment, so there is nothing to send reports with.';
}

/** Where the two copies, their icons and the beta build's output go. */
export function installPaths(dir) {
  return {
    ordinary: { target: path.join(dir, 'frameling.AppImage'), icon: path.join(dir, 'frameling.png'), built: 'release' },
    beta: { target: path.join(dir, 'frameling.beta.AppImage'), icon: path.join(dir, 'frameling.beta.png'), built: 'release-beta' },
  };
}
