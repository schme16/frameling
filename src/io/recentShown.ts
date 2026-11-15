// What the lists of recent drawings (the Welcome sheet, Open recent) show for each file. Real names and folders when
// stream-safe is off; friendly stand-ins ("My drawing 2", "in A folder") when it is on. Display only: `file` is always
// the real one, for opening and removing.
import { displayFolder, displayPath, streamSafe } from '../core/streamSafe';
import { describePlace } from '../platform';
import type { RecentFile } from '../preload/api';
import { dirName } from './desktop';

export interface ShownRecent {
  /** The real file. Never shown. */
  file: RecentFile;
  /** What to call it. */
  name: string;
  /** Where it lives, in words: "in /home/me/art", or "in A folder". */
  place: string;
  /** The hover tip: the full path, or nothing while stream-safe (the name says it all). */
  tip: string | undefined;
}

export function shownRecent(files: RecentFile[]): ShownRecent[] {
  const on = streamSafe();
  return files.map((file, i) => ({
    file,
    name: on ? displayPath(file.path, { n: files.length > 1 ? i + 1 : undefined }) : file.name,
    place: on ? `in ${displayFolder(file.path).toLowerCase()}` : describePlace(file.path, dirName),
    tip: on ? undefined : file.path,
  }));
}
