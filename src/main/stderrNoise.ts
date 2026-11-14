// The one engine line the Linux launcher (build/linux/launcher.sh) keeps off the terminal. It comes from the browser
// engine's certificate store looking for the system's NSS database, which most desktops don't have set up. It has
// nothing to do with drawing or with Frameling, changes nothing, and made a working app look broken. The engine writes
// it straight to stderr from native code, so JavaScript can't catch it: the launcher filters it, with the same pattern
// as here (a test holds the two together). Every other line, errors included, goes through untouched.

/** The line, without the "[pid:time:" lead that changes on every run. Extended regular expression, as grep -E reads it. */
export const NSS_NOISE_PATTERN = 'ERROR:(crypto/)?nss_util\\.cc:[0-9]+\\] After loading Root Certs, loaded==false: NSS error code: -8018$';

const noise = new RegExp(NSS_NOISE_PATTERN);

/** Is this stderr line the known-harmless certificate store one? */
export const isHarmlessNssLine = (line: string): boolean => noise.test(line.replace(/\r?\n$/, ''));
