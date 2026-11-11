// Preferences > Plugins: what's installed, what each may do, on and off, remove, and install new ones.
import { Icon } from '../ui/icons';
import { openHelp } from '../ui/overlays';
import { QuillEmpty } from '../ui/mascot';
import { library } from '../platform/library';
import { PERMISSIONS } from './manifest';
import { plugins, removePlugin, setEnabled } from './manager';
import { installFromFile, installFromFolder, canInstallFolder } from './install';

const STATUS: Record<string, string> = { starting: 'Starting', on: 'On', problem: 'Problem', off: 'Off' };

export function PluginsPage() {
  const list = plugins.use((p) => p);
  return (
    <div className="plugin-page" data-help="plugins">
      <h3>Plugins</h3>
      <p className="ui-pref-intro">Plugins add commands, ways to export and panels. Each one runs in its own sandbox, away from your files, and can only do what it asked for when you installed it.</p>
      <div className="plugin-page-actions">
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => void installFromFile()}>
          <Icon name="plus" size={14} />
          Install from file...
        </button>
        {canInstallFolder() && (
          <button type="button" className="ui-btn" onClick={() => void installFromFolder()} data-tip="For plugin makers: install straight from the folder you're working in.">
            <Icon name="folder" size={14} />
            Install from folder...
          </button>
        )}
        {library.showFolder && (
          <button type="button" className="ui-btn ui-btn-quiet" onClick={() => void library.showFolder?.('plugins')}>
            Show plugins folder
          </button>
        )}
        <span className="ui-status-spacer" />
        <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp('plugins')}>
          <Icon name="help" size={14} /> How plugins work
        </button>
      </div>
      {!list.length && (
        <QuillEmpty size={64} className="plugin-empty">
          No plugins yet. A plugin is a .zip file with a manifest.json and one script inside. Pick "Install from file..." to add one.
        </QuillEmpty>
      )}
      <ul className="plugin-list">
        {list.map((p) => {
          const m = p.manifest;
          return (
            <li key={m.id} className={`plugin-item${p.enabled ? ' is-on' : ''}`}>
              <div className="plugin-item-head">
                <Icon name="plugin" size={18} />
                <strong>{m.name}</strong>
                <span className="ui-tag">{m.version}</span>
                {p.enabled && <span className={`ui-tag${p.status === 'on' ? ' ui-tag-on' : ''}`}>{STATUS[p.status]}</span>}
                <span className="ui-status-spacer" />
                <button type="button" role="switch" aria-checked={p.enabled} aria-label={`${m.name} on or off`} className={`ui-switch${p.enabled ? ' is-on' : ''}`} onClick={() => void setEnabled(m.id, !p.enabled)}>
                  <span className="ui-switch-knob" />
                </button>
                <button type="button" className="ui-icon-btn" aria-label={`Remove ${m.name}`} data-tip={`Remove ${m.name}`} onClick={() => void removePlugin(m.id)}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
              {m.description && <p className="plugin-item-desc">{m.description}</p>}
              {m.author && <p className="plugin-item-by">By {m.author}</p>}
              <div className="plugin-perms" aria-label="What it may do">
                {m.permissions.length === 0 && <span className="plugin-perm">Commands only</span>}
                {m.permissions.map((perm) => {
                  const allowed = p.granted.includes(perm);
                  return (
                    <span key={perm} className={`plugin-perm${perm === 'network' ? ' is-network' : ''}${allowed ? '' : ' is-denied'}`} data-tip={PERMISSIONS[perm].label} data-tip-desc={`${PERMISSIONS[perm].detail}${perm === 'network' ? ` Sites: ${m.network.join(', ')}.` : ''}${allowed ? '' : ' You said no to this.'}`}>
                      {PERMISSIONS[perm].label}
                      {!allowed && ' (not allowed)'}
                    </span>
                  );
                })}
              </div>
              {p.problem && (
                <p className="plugin-item-problem" role="status">
                  <Icon name="warning" size={14} /> {p.problem}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
