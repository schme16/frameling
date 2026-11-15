// Preferences > Features > Twitch: connect and disconnect, which kinds of event to hear, and the links from each to an
// audience action. The device code is drawn only while stream-safe mode is off, and is fetched only at the moment it is
// drawn (like the actions door's key); with stream-safe on, nothing on this screen holds it. The sign-in is never here.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { audience } from '../audience';
import { displayName, displaySecret, HIDDEN, useStreamSafe } from '../core/streamSafe';
import { isFeatureOn } from '../features/host';
import { useFeaturesVersion } from '../features/use';
import { desktop } from '../io/desktop';
import { Icon } from '../ui/icons';
import { openHelp } from '../ui/overlays';
import { toast } from '../ui/toast';
import { KIND_INFO, KINDS, scopesFor, type TwitchKind, type TwitchReward, type TwitchStatus } from '../shared/twitch';
import { cancelConnect, connect, disconnect, hasTwitch } from './actions';
import { twitchLink } from './instance';
import { MAX_RULES, newRule, type TwitchRule } from './rules';
import { currentRules, patchRule, removeRule, setKinds, setRules, twitchSaved, twitchStatus } from './state';
import './twitch.css';

type Rewards = { state: 'idle' } | { state: 'ok'; list: TwitchReward[] } | { state: 'no'; why: 'not-affiliate' | 'failed' | 'signed-out' };

function statusLine(s: TwitchStatus, audienceOn: boolean): string {
  if (s.app === 'none' && s.state === 'signed-out') return 'This build of Frameling has no Twitch app set up. Paste your own Client ID below to connect.';
  if (s.state === 'signing-in') return 'Waiting for you to approve the code on Twitch.';
  if (s.state === 'signed-out') return 'Not connected. Nothing is signed in and nothing is listening.';
  const who = `Connected as ${displayName(s.login)}`;
  if (s.listening === 'listening') return `${who}, and listening.`;
  if (s.listening === 'connecting') return `${who}. Opening the line to Twitch...`;
  if (s.listening === 'reconnecting') return `${who}. Lost the line to Twitch, trying again.`;
  return `${who}. ${audienceOn ? 'Nothing to listen for: tick something above.' : 'It starts listening when audience features are on.'}`;
}

export function TwitchPrefsRow() {
  useFeaturesVersion();
  const on = isFeatureOn('stream-twitch');
  const status = twitchStatus.use((s) => s);
  const saved = twitchSaved.use((s) => s);
  const snap = useSyncExternalStore(audience.subscribe, audience.snapshot);
  const safe = useStreamSafe();
  const [code, setCode] = useState<string | null>(null);
  const [rewards, setRewards] = useState<Rewards>({ state: 'idle' });
  const [ownId, setOwnId] = useState('');
  const signingIn = status.state === 'signing-in';
  const signedIn = status.state === 'signed-in';

  // The code is asked for only while it is about to be drawn, and dropped the moment stream-safe mode goes on.
  useEffect(() => {
    if (!on || !signingIn || safe) return void setCode(null);
    let live = true;
    void desktop()
      ?.twitch?.code()
      .then(
        (c) => live && setCode(c?.userCode ?? null),
        () => undefined,
      );
    return () => {
      live = false;
      setCode(null);
    };
  }, [on, signingIn, safe]);

  // Your own reward names, for the picker. Only when signed in and a reward is something you listen for.
  const wantsRewards = signedIn && saved.kinds.includes('redemption');
  useEffect(() => {
    if (!on || !wantsRewards) return void setRewards({ state: 'idle' });
    let live = true;
    void desktop()
      ?.twitch?.rewards()
      .then(
        (r) => live && setRewards(r.ok ? { state: 'ok', list: r.rewards } : { state: 'no', why: r.why }),
        () => undefined,
      );
    return () => {
      live = false;
    };
  }, [on, wantsRewards]);

  if (!on) return null;
  const desk = hasTwitch();

  const toggleKind = (k: TwitchKind) => {
    setKinds(saved.kinds.includes(k) ? saved.kinds.filter((x) => x !== k) : [...saved.kinds, k]);
    if (signedIn) twitchLink.refresh();
  };
  const missing = signedIn ? saved.kinds.filter((k) => KIND_INFO[k].scope && !status.scopes.includes(KIND_INFO[k].scope)) : [];

  const actions = snap.actions.filter((a) => !a.bulk);
  const viewOnly = actions.filter((a) => !a.touchesDrawing);
  const drawing = actions.filter((a) => a.touchesDrawing);
  const firstAction = viewOnly[0]?.id ?? actions[0]?.id;

  return (
    <div className="tw-prefs" data-testid="twitch.prefs">
      <div className="tw-connect" data-testid="twitch.connectBox">
        <h4>Twitch</h4>
        <p className="ui-pref-intro" data-testid="twitch.status">
          {statusLine(status, snap.on)}
        </p>
        {status.problem === 'needs-sign-in' && <p className="tw-note">Twitch ended the sign-in. Connect again to carry on.</p>}
        {signedIn && status.refused.length > 0 && (
          <p className="tw-note" data-testid="twitch.refused">
            Twitch would not let Frameling listen for: {status.refused.map((k) => KIND_INFO[k].label.toLowerCase()).join('; ')}.{' '}
            {status.refused.includes('redemption') ? 'Channel points need an Affiliate or Partner channel. ' : ''}
            Check the permissions below.
          </p>
        )}

        {!signingIn && (
          <div className="tw-kinds" data-testid="twitch.kinds">
            <strong>What to hear about</strong>
            {KINDS.map((k) => (
              <label key={k} className="tw-kind">
                <input type="checkbox" checked={saved.kinds.includes(k)} data-testid={`twitch.kind.${k}`} onChange={() => toggleKind(k)} />
                <strong>{KIND_INFO[k].label}</strong>
                <span />
                <span>
                  {KIND_INFO[k].why}
                  {KIND_INFO[k].scope ? ` Permission: ${KIND_INFO[k].scope}.` : ''}
                </span>
              </label>
            ))}
          </div>
        )}

        {signingIn && (
          <div className="tw-code-card" data-testid="twitch.codeCard">
            {safe ? (
              <>
                <strong>Stream-safe mode is on, so the code isn't shown.</strong>
                <code className="tw-code" data-testid="twitch.code" aria-label="The code, hidden">
                  {HIDDEN}
                </code>
                <span className="tw-note">Press Open Twitch, or copy the link and paste it into a browser on a screen you aren't sharing. The code is already filled in.</span>
              </>
            ) : (
              <>
                <strong>Approve this code on Twitch</strong>
                <code className="tw-code" data-testid="twitch.code" aria-label="The code">
                  {code === null ? '...' : displaySecret(code)}
                </code>
                <span className="tw-note">Press Open Twitch and approve it, or go to twitch.tv/activate on any device and type the code. It works once and runs out in about half an hour.</span>
              </>
            )}
            <div className="tw-actions">
              <button type="button" className="ui-btn ui-btn-primary" data-testid="twitch.open" onClick={() => void desktop()?.twitch?.openApproval()}>
                Open Twitch
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-quiet"
                data-testid="twitch.copyLink"
                onClick={() =>
                  void desktop()
                    ?.twitch?.copyApproval()
                    .then((ok) => toast(ok ? 'Copied the link. It has the code in it, so keep it off the stream.' : 'Could not copy the link.', { kind: ok ? 'success' : 'warn', quill: null }))
                }
              >
                Copy the link
              </button>
              <button type="button" className="ui-btn ui-btn-quiet" data-testid="twitch.cancel" onClick={() => void cancelConnect()}>
                Cancel
              </button>
            </div>
            <span className="tw-note">The browser window that opens is not covered by Stream-safe mode. Approve it on a screen you aren't sharing.</span>
          </div>
        )}

        {!signingIn && (
          <div className="tw-actions">
            {!signedIn ? (
              <button type="button" className="ui-btn ui-btn-primary" data-testid="twitch.connect" disabled={!desk || status.app === 'none' || saved.kinds.length === 0} onClick={() => void connect()}>
                Connect Twitch
              </button>
            ) : (
              <>
                {missing.length > 0 && (
                  <button type="button" className="ui-btn" data-testid="twitch.morePermissions" onClick={() => void connect()}>
                    Ask Twitch for {scopesFor(missing).length === 1 ? 'one more permission' : `${scopesFor(missing).length} more permissions`}
                  </button>
                )}
                <button type="button" className="ui-btn" data-testid="twitch.disconnect" onClick={() => void disconnect()}>
                  Disconnect from Twitch
                </button>
              </>
            )}
            {!desk && <span className="tw-note">Connect Twitch needs the desktop app.</span>}
            {desk && status.app !== 'none' && !signedIn && saved.kinds.length === 0 && <span className="tw-note">Tick at least one thing to hear about.</span>}
            {signedIn && !snap.on && <span className="tw-note">Audience features are off, so nothing is listening yet.</span>}
          </div>
        )}

        <details>
          <summary>Use my own Twitch app</summary>
          <p className="tw-note">For builds with no Twitch app of their own. Make a Public app at dev.twitch.tv/console, and paste its Client ID. It is not a secret.</p>
          <div className="tw-actions">
            <input className="ui-input" value={ownId} placeholder="Client ID" aria-label="Client ID" data-testid="twitch.ownId" onChange={(e) => setOwnId(e.target.value)} />
            <button
              type="button"
              className="ui-btn ui-btn-quiet"
              data-testid="twitch.useOwn"
              disabled={!desk}
              onClick={() =>
                void desktop()
                  ?.twitch?.setApp(ownId.trim() || null)
                  .then((s) => {
                    twitchStatus.set(s);
                    if (s.problem === 'failed') toast('That does not look like a Client ID. It is 30 letters and digits.', { kind: 'warn' });
                    else setOwnId('');
                  })
              }
            >
              Use this app
            </button>
          </div>
        </details>
      </div>

      <div className="tw-linkbox" data-testid="twitch.linkBox">
        <h4>Links: what each event does</h4>
        <p className="ui-pref-intro">When a Twitch event arrives, Frameling asks the audience gate to run the action you pick. Your switches, cooldowns, queue and Stop all apply.</p>
        <div className="tw-links" data-testid="twitch.links">
          {saved.rules.length === 0 && <p className="tw-note">No links yet. Nothing happens for any Twitch event.</p>}
          {saved.rules.map((r) => (
            <RuleRow key={r.id} r={r} actions={{ viewOnly, drawing }} rewards={rewards} />
          ))}
        </div>
        <div className="tw-actions">
          <button
            type="button"
            className="ui-btn"
            data-testid="twitch.addLink"
            disabled={!firstAction || saved.rules.length >= MAX_RULES}
            onClick={() => firstAction && setRules([...saved.rules, newRule(saved.kinds[0] ?? 'redemption', firstAction)])}
          >
            Add a link
          </button>
          <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp('twitch-links')}>
            <Icon name="help" size={14} /> How links work
          </button>
          <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp('twitch')}>
            <Icon name="help" size={14} /> What Frameling asks Twitch for
          </button>
        </div>
        <p className="tw-note">Frameling can't refund channel points. If a cooldown or the queue turns a redemption away, the viewer has still spent them.</p>
      </div>
    </div>
  );
}

type Opt = {
  id: string;
  label: string;
  touchesDrawing: boolean;
  available: boolean;
  takesDetails: boolean;
};

function RuleRow({ r, actions, rewards }: { r: TwitchRule; actions: { viewOnly: Opt[]; drawing: Opt[] }; rewards: Rewards }) {
  const all = [...actions.viewOnly, ...actions.drawing];
  const picked = all.find((a) => a.id === r.action);
  const rewardKnown = rewards.state === 'ok' && !!r.rewardId && rewards.list.some((x) => x.id === r.rewardId);
  return (
    <div className={`tw-link${r.on ? '' : ' is-off'}`} data-testid={`twitch.rule.${r.id}`}>
      <button
        type="button"
        role="switch"
        aria-checked={r.on}
        aria-label="This link, on or off"
        className={`ui-switch${r.on ? ' is-on' : ''}`}
        data-testid={`twitch.rule.${r.id}.on`}
        onClick={() => patchRule(r.id, { on: !r.on })}
      >
        <span className="ui-switch-knob" />
      </button>
      <select
        className="ui-input"
        aria-label="When this happens"
        value={r.event}
        data-testid={`twitch.rule.${r.id}.event`}
        onChange={(e) => {
          const event = e.target.value as TwitchKind;
          // The filters belong to one kind, so they go when the kind changes.
          setRules(
            currentRules().map((x) =>
              x.id === r.id
                ? {
                    id: x.id,
                    event,
                    action: x.action,
                    on: x.on,
                    ...(x.text ? { text: x.text } : {}),
                  }
                : x,
            ),
          );
        }}
      >
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND_INFO[k].label}
          </option>
        ))}
      </select>
      {r.event === 'redemption' && (
        <select
          className="ui-input"
          aria-label="Which reward"
          value={r.rewardId ?? ''}
          data-testid={`twitch.rule.${r.id}.reward`}
          onChange={(e) =>
            patchRule(r.id, {
              rewardId: e.target.value || undefined,
              rewardTitle: rewards.state === 'ok' ? rewards.list.find((x) => x.id === e.target.value)?.title : undefined,
            })
          }
        >
          <option value="">Any reward</option>
          {r.rewardId && !rewardKnown && <option value={r.rewardId}>{r.rewardTitle || 'A reward'}</option>}
          {rewards.state === 'ok' &&
            rewards.list.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title} ({x.cost})
              </option>
            ))}
        </select>
      )}
      {(r.event === 'cheer' || r.event === 'raid') && (
        <label className="tw-note">
          at least{' '}
          <input
            className="ui-input tw-narrow"
            type="number"
            min={1}
            value={r.min ?? ''}
            placeholder="any"
            aria-label={r.event === 'cheer' ? 'At least this many bits' : 'At least this many people'}
            data-testid={`twitch.rule.${r.id}.min`}
            onChange={(e) =>
              patchRule(r.id, {
                min: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />{' '}
          {r.event === 'cheer' ? 'bits' : 'people'}
        </label>
      )}
      <span className="tw-arrow" aria-hidden="true">
        &rarr;
      </span>
      <select className="ui-input" aria-label="Do this" value={r.action} data-testid={`twitch.rule.${r.id}.action`} onChange={(e) => patchRule(r.id, { action: e.target.value })}>
        {!picked && <option value={r.action}>{r.action} (not available)</option>}
        <optgroup label="Only changes the view">
          {actions.viewOnly.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
              {a.available ? '' : ' (switched off)'}
            </option>
          ))}
        </optgroup>
        {actions.drawing.length > 0 && (
          <optgroup label="Reaches your drawing">
            {actions.drawing.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
                {a.available ? '' : ' (needs the interrupt switch)'}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {picked?.takesDetails && (
        <>
          <input
            className="ui-input"
            value={r.text ?? ''}
            maxLength={120}
            placeholder="Words to send"
            aria-label="Words to send with it"
            data-testid={`twitch.rule.${r.id}.text`}
            onChange={(e) => patchRule(r.id, { text: e.target.value || undefined })}
          />
          {r.event === 'redemption' && (
            <label className="tw-note">
              <input
                type="checkbox"
                checked={r.useViewerText === true}
                data-testid={`twitch.rule.${r.id}.viewerText`}
                onChange={(e) =>
                  patchRule(r.id, {
                    useViewerText: e.target.checked || undefined,
                  })
                }
              />{' '}
              Use what the viewer typed
            </label>
          )}
        </>
      )}
      <button type="button" className="ui-btn ui-btn-quiet" data-testid={`twitch.rule.${r.id}.try`} onClick={() => tryRule(r)}>
        Try it
      </button>
      <button type="button" className="ui-btn ui-btn-quiet" aria-label="Remove this link" data-testid={`twitch.rule.${r.id}.remove`} onClick={() => removeRule(r.id)}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

function tryRule(r: TwitchRule): void {
  if (!audience.isOn()) return void toast('Switch audience features on first, then Try it runs the link.', { kind: 'warn' });
  const v = twitchLink.test(r);
  if (!v.ok) toast(`The gate said no (${v.reason}). That is the same answer a real Twitch event would get.`, { quill: null });
}
