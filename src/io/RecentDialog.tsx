import { line } from '../ui/mascot/lines';
import { useEffect, useState } from 'react';
import { Icon } from '../ui/icons';
import { QuillEmpty } from '../ui/mascot';
import { describePlace } from '../platform';
import { desktop, dirName } from './desktop';
import { clearRecentFiles, listRecentFiles, openPath } from './document';
import { Modal, mountModal } from './mount';
import { RecentPicture, useRecentPictures } from './RecentPicture';
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
  const pics = useRecentPictures(files);
  const remove = (f: RecentFile) => {
    void desktop()?.recent.remove(f.path);
    setFiles((list) => (list ?? []).filter((x) => x.path !== f.path));
  };
  return (
    <Modal title="Open recent" onClose={close}>
      <div className="io-body">
        {files === null ? null : files.length === 0 ? (
          <QuillEmpty anim="draw" className="io-empty" whenHidden="Nothing here yet. Drawings you open or save show up here.">{line('empty.recent')}</QuillEmpty>
        ) : (
          <ul className="io-recent">
            {files.map((f) => (
              <li key={f.path} className={f.missing ? 'is-missing' : undefined}>
                <button
                  type="button"
                  data-autofocus={f === files.find((x) => !x.missing) ? '' : undefined}
                  disabled={f.missing}
                  onClick={() => {
                    close();
                    void openPath(f.path);
                  }}
                >
                  <RecentPicture preview={pics[f.path]} />
                  <b>{f.name}</b>
                  <small title={f.path}>
                    {f.missing ? "Can't find this file. It was" : when(f.openedAt)} {describePlace(f.path, dirName)}
                  </small>
                </button>
                <button type="button" className="io-recent-remove" aria-label={`Remove ${f.name} from the list`} title="Remove from the list (the file itself stays where it is)" onClick={() => remove(f)}>
                  <Icon name="close" size={14} />
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
