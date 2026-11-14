// The little picture of a drawing in lists of files. The box is the same size with or without a picture, so nothing
// jumps as pictures arrive; a drawing with none (an older file, or one that can't be read) shows the folder icon.
import { useEffect, useState } from 'react';
import { Icon } from '../ui/icons';
import { desktop } from './desktop';
import type { RecentFile, RecentPreview } from '../preload/api';

/** What is known about each file's picture so far, by path. A path not in the map is still being read. */
export function useRecentPictures(files: RecentFile[] | null): Record<string, RecentPreview> {
  const [pics, setPics] = useState<Record<string, RecentPreview>>({});
  const key = (files ?? []).map((f) => f.path + (f.missing ? '!' : '')).join('\n');
  useEffect(() => {
    let live = true;
    const api = desktop();
    void (async () => {
      for (const f of files ?? []) {
        // Each picture lands as soon as it is read, so the list never waits on the slowest file.
        let got: RecentPreview = f.missing ? { state: 'missing' } : { state: 'none' };
        if (!f.missing && api?.recent.preview) {
          try {
            got = await api.recent.preview(f.path);
          } catch {
            got = { state: 'none' };
          }
        }
        if (!live) return;
        setPics((p) => ({ ...p, [f.path]: got }));
      }
    })();
    return () => {
      live = false;
    };
    // The list as text is what matters, not the array's identity.
  }, [key]);
  return pics;
}

/** One picture, or the folder icon in the same box. `size` is the box's width in pixels (4:3). */
export function RecentPicture({ preview, size = 72 }: { preview?: RecentPreview; size?: number }) {
  const h = Math.round((size * 3) / 4);
  return (
    <span className={`io-pic${preview?.state === 'picture' ? ' has-pic' : ''}`} style={{ width: size, height: h }} aria-hidden="true">
      {preview?.state === 'picture' ? <img src={preview.url} alt="" draggable={false} /> : <Icon name="open" size={Math.round(size / 3.4)} />}
    </span>
  );
}
