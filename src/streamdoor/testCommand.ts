// The one line that proves the actions door works: ask it for its list. A pure function, so it is tested without the app.
//
// It is a GET, which asks and changes nothing, so it is safe to run at any time (a vote that is running is not touched).
// Double quotes only, so the same line works in a Linux or Mac terminal and in Windows Command Prompt and PowerShell.

/** A key is safe to put between double quotes when nothing in it could end the quotes or the line. Frameling's own keys always are. */
const SAFE_KEY = /^[A-Za-z0-9_\-.~+/=]+$/;

/** The curl line for this address and key, or null when either is missing or the key is not one that can be pasted safely. */
export function testCommand(address: string, key: string): string | null {
  const a = address.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[A-Za-z0-9.\-:[\]]+$/.test(a) || !SAFE_KEY.test(key)) return null;
  return `curl -H "Authorization: Bearer ${key}" ${a}/v1/actions`;
}
