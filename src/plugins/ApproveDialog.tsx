// "Install this plugin?": who made it, what it asks to do, and (for the powers that need a yes of their own, and the
// internet) a separate switch for each, all off until the person turns them on. A plugin they refuse a power keeps
// running with that part switched off.
import { useState } from 'react';
import { mountModal } from '../io/mount';
import { Icon } from '../ui/icons';
import { Modal } from '../ui/Modal';
import { openHelp } from '../ui/overlays';
import { PERMISSIONS, type Permission, type PluginManifest } from './manifest';
import { decide, elevatedIn, RISKS } from './powers';

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
  const elevated = elevatedIn(m);
  const wantsNet = m.permissions.includes('network');
  // Everything that needs a yes of its own, each off to start with.
  const [on, setOn] = useState<Permission[]>([]);
  const asks = m.permissions.filter((p) => p !== 'network' && !elevated.includes(p));
  const choices: Permission[] = [...elevated, ...(wantsNet ? (['network'] as Permission[]) : [])];
  const flip = (p: Permission) => setOn((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  const anyOn = on.length > 0;
  const grant = () => {
    const d = decide(m, on, on.includes('network'));
    answer({ permissions: d.permissions, network: d.network });
  };
  return (
    <Modal title={`${verb} plugin`} size="sm" className="plugin-approve" onClose={() => answer(null)} initialFocus=".ui-btn-primary">
      <div className="plugin-approve-body" data-help="plugin-permissions">
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
        <p className="plugin-approve-label">{asks.length ? 'It asks to:' : choices.length ? 'It also asks for:' : 'It only adds commands. It asks for nothing else.'}</p>
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
        {choices.length > 0 && (
          <>
            <p className="plugin-approve-warn" role="note">
              <Icon name="warning" size={14} />
              <span>
                <strong>These are real powers.</strong> Switch on only what you want this plugin to have. It still works without them, with those parts left out. You can change your mind any time in Preferences, Plugins.
              </span>
            </p>
            {choices.map((p) => (
              <label key={p} className={`plugin-approve-net${on.includes(p) ? ' is-on' : ''}`}>
                <button type="button" role="switch" aria-checked={on.includes(p)} aria-label={p === 'network' ? 'Let it use the internet' : `Let it ${PERMISSIONS[p].label.toLowerCase()}`} className={`ui-switch${on.includes(p) ? ' is-on' : ''}`} onClick={() => flip(p)}>
                  <span className="ui-switch-knob" />
                </button>
                <span>
                  <strong>{p === 'network' ? 'Let it use the internet' : PERMISSIONS[p].label}</strong>
                  <span>{PERMISSIONS[p].detail}</span>
                  <span className="plugin-item-by">
                    {p === 'network' ? `Only these sites: ${m.network.join(', ')}. ` : ''}
                    {RISKS[p]}
                  </span>
                </span>
              </label>
            ))}
          </>
        )}
        <p className="plugin-approve-safe">
          <Icon name="lock" size={14} /> Plugins run in a sandbox, away from your files and the rest of Frameling.
        </p>
      </div>
      <div className="ui-choice-foot">
        <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp('plugin-permissions')}>
          <Icon name="help" size={14} /> Learn more
        </button>
        <span className="ui-spacer" />
        <button type="button" className="ui-btn" onClick={() => answer(null)}>
          Cancel
        </button>
        <button type="button" className="ui-btn ui-btn-primary" onClick={grant}>
          {choices.length ? (anyOn ? `${verb} and allow` : `${verb} without them`) : verb}
        </button>
      </div>
    </Modal>
  );
}
