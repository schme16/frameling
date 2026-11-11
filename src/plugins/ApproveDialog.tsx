// "Install this plugin?": who made it, what it asks to do, and (only if it asks) a separate switch for the internet,
// off until the person turns it on.
import { useState } from 'react';
import { mountModal } from '../io/mount';
import { Icon } from '../ui/icons';
import { Modal } from '../ui/Modal';
import { openHelp } from '../ui/overlays';
import { PERMISSIONS, type Permission, type PluginManifest } from './manifest';

export type Approval = { permissions: Permission[]; network: string[] } | null;

export function approveWithDialog(m: PluginManifest, verb: 'Install' | 'Turn on' | 'Update'): Promise<Approval> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (a: Approval, close: () => void) => {
      if (done) return;
      done = true;
      close();
      resolve(a);
    };
    mountModal((close) => <Approve m={m} verb={verb} answer={(a) => finish(a, close)} />);
  });
}

function Approve({ m, verb, answer }: { m: PluginManifest; verb: string; answer: (a: Approval) => void }) {
  const [net, setNet] = useState(false);
  const asks = m.permissions.filter((p) => p !== 'network');
  const wantsNet = m.permissions.includes('network');
  return (
    <Modal title={`${verb} plugin`} size="sm" className="plugin-approve" onClose={() => answer(null)} initialFocus=".ui-btn-primary">
      <div className="plugin-approve-body" data-help="plugins">
        <div className="plugin-approve-head">
          <span className="plugin-approve-icon">
            <Icon name="plugin" size={22} />
          </span>
          <div>
            <strong>{m.name}</strong> <span className="ui-tag">{m.version}</span>
            {m.author && <p className="plugin-item-by">By {m.author}</p>}
          </div>
        </div>
        {m.description && <p className="plugin-item-desc">{m.description}</p>}
        <p className="plugin-approve-label">{asks.length ? 'It asks to:' : 'It only adds commands. It asks for nothing else.'}</p>
        {asks.length > 0 && (
          <ul className="plugin-approve-list">
            {asks.map((p) => (
              <li key={p}>
                <Icon name="check" size={14} />
                <span>
                  <strong>{PERMISSIONS[p].label}.</strong> {PERMISSIONS[p].detail}
                </span>
              </li>
            ))}
          </ul>
        )}
        {wantsNet && (
          <label className="plugin-approve-net">
            <button type="button" role="switch" aria-checked={net} aria-label="Let it use the internet" className={`ui-switch${net ? ' is-on' : ''}`} onClick={() => setNet((v) => !v)}>
              <span className="ui-switch-knob" />
            </button>
            <span>
              <strong>Let it use the internet</strong>
              <span className="plugin-item-by">Only these sites: {m.network.join(', ')}. Leave this off unless you trust them; the plugin still works for anything that doesn't need them.</span>
            </span>
          </label>
        )}
        <p className="plugin-approve-safe">
          <Icon name="lock" size={14} /> Plugins run in a sandbox, away from your files and the rest of Frameling.
        </p>
      </div>
      <div className="ui-choice-foot">
        <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp('plugins')}>
          <Icon name="help" size={14} /> Learn more
        </button>
        <span className="ui-spacer" />
        <button type="button" className="ui-btn" onClick={() => answer(null)}>
          Cancel
        </button>
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => answer({ permissions: net ? [...m.permissions] : asks, network: net ? [...m.network] : [] })}>
          {verb}
        </button>
      </div>
    </Modal>
  );
}
