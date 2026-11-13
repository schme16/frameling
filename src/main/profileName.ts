// Which copy of Frameling this is. An ordinary build has no profile. The beta copy that install-local puts next to the
// ordinary one is built with the profile "beta", so it keeps its own settings, recent files and crash notes, and can
// run at the same time as the ordinary copy. No electron import here, so tests can use it.

/** The profile baked in at build time (scripts/build-main.mjs, from FRAMELING_PROFILE). Empty means ordinary. */
declare const __FRAMELING_PROFILE__: string | undefined;
export const PROFILE: string = typeof __FRAMELING_PROFILE__ === 'undefined' ? '' : __FRAMELING_PROFILE__;

/** The folder name for a profile's data, e.g. "Frameling Beta". Null for the ordinary copy. */
export function profileFolderName(profile: string): string | null {
  const clean = profile.replace(/[^A-Za-z0-9]/g, '');
  return clean ? `Frameling ${clean[0].toUpperCase()}${clean.slice(1)}` : null;
}
