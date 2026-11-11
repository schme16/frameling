import { useEffect, useState } from 'react';
import { Icon } from '../ui/icons';
import { dirName } from './desktop';
import { clearRecentFiles, listRecentFiles, openPath } from './document';
import { Modal, mountModal } from './mount';
import type { RecentFile } from '../preload/api';

function when(t: number): string {
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs === 1 ? 'an hour ago' : `${hrs} hours ago`;
  const days = Math.round(hrs / 24);
  if (days < 14) return days === 1 ? 'yesterday' : `${days} days ago`;
  return new Date(t).toLocaleDateString();
}

function RecentDialog({ close }: { close: () => void }) {
  const [files, setFiles] = useState<RecentFile[] | null>(null);
  useEffect(() => {
    void listRecentFiles().then(setFiles);
  }, []);
  return (
    <Modal title="Open recent" onClose={close}>
      <div className="io-body">
        {files === null ? null : files.length === 0 ? (
          <p className="io-empty">Nothing here yet. Drawings you open or save will show up here.</p>
        ) : (
          <ul className="io-recent">
            {files.map((f) => (
              <li key={f.path}>
                <button
                  type="button"
                  data-autofocus={f === files[0] ? '' : undefined}
                  onClick={() => {
                    close();
                    void openPath(f.path);
                  }}
                >
                  <Icon name="open" />
                  <b>{f.name}</b>
                  <small title={f.path}>
                    {when(f.openedAt)} in {dirName(f.path) || f.path}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="io-foot">
        {files && files.length > 0 && (
          <button type="button" className="io-btn" onClick={() => void clearRecentFiles().then(() => setFiles([]))}>
            Clear list
          </button>
        )}
        <button type="button" className="io-btn io-primary" onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  );
}

export function openRecentDialog(): void {
  mountModal((close) => <RecentDialog close={close} />);
}
