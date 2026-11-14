// Properties for a shape a plugin made: who made it, a form for its settings ("Change settings") and, when the plugin is
// off, a "Turn it on" button. The form is described by the plugin (the same kinds of option as an export) and drawn here.
// Changing a setting asks the plugin to draw the shape again; what the person did to it with the ordinary tools stays.
import { Explainer } from '../ui/explain/ExplainIcon';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../core/store';
import { getCommand } from '../core/registry';
import { Icon } from '../ui/icons';
import { cleanValues, type ExportOption, type OptionValue } from './options';
import { plugins, runtimeOf, setEnabled } from './manager';
import { pickedPluginShape, type PickedPluginShape } from './shapeProps';

export function PluginShapePanel() {
  const json = useStore((s) => JSON.stringify(pickedPluginShape(s)));
  const picked: PickedPluginShape | null = useMemo(() => (json === 'null' ? null : JSON.parse(json)), [json]);
  const state = plugins.use((l) => {
    const p = picked && l.find((x) => x.manifest.id === picked.pluginId);
    return p ? `${p.enabled ? 'on' : 'off'}:${p.status}:${p.granted.includes('shapes') ? 'shapes' : 'noshapes'}` : 'missing';
  });
  if (!picked) return <p className="plugin-shape-idle">Select a shape that a plugin made.</p>;
  const plugin = plugins.get().find((x) => x.manifest.id === picked.pluginId);
  if (!plugin) {
    return (
      <div className="plugin-shape" data-help="plugin-shapes">
        <p>
          This shape was made by the "{picked.pluginId}" plugin, which isn't installed here. It is still an ordinary shape: move, colour and change it like any other.
        </p>
      </div>
    );
  }
  const name = plugin.manifest.name;
  const rt = runtimeOf(picked.pluginId);
  const def = rt?.shapeKinds.get(picked.kind);
  const by = (
    <p className="plugin-shape-by">
      <Icon name="plugin" size={14} /> {def?.label ?? picked.kind} made by {name}
    </p>
  );
  if (!rt || state.startsWith('off')) {
    return (
      <div className="plugin-shape" data-help="plugin-shapes">
        {by}
        <p className="plugin-shape-note">{name} is off, so its settings can't be changed. The shape still works like any other.</p>
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => void setEnabled(plugin.manifest.id, true)}>
          Turn it on
        </button>
      </div>
    );
  }
  if (!def) {
    return (
      <div className="plugin-shape" data-help="plugin-shapes">
        {by}
        <p className="plugin-shape-note">{name} isn't allowed to draw shapes right now, so its settings can't be changed. You can allow it in Preferences, Plugins.</p>
      </div>
    );
  }
  return (
    <div className="plugin-shape" data-help="plugin-shapes">
      {by}
      {def.options.length > 0 ? <Settings key={`${picked.inst}`} picked={picked} options={def.options} /> : <NoSettings pluginId={plugin.manifest.id} />}
      <Explainer className="plugin-shape-note">Move, scale and turn it with the usual tools. Changing a setting keeps that.</Explainer>
    </div>
  );
}

/** A plugin with no form of its own may have a panel; this opens it. */
function NoSettings({ pluginId }: { pluginId: string }) {
  const panel = [...(runtimeOf(pluginId)?.panels.keys() ?? [])][0];
  const open = panel ? getCommand(`view.panel.plugin.${pluginId}.${panel}`) : undefined;
  if (!open) return <p className="plugin-shape-note">This shape has no settings to change.</p>;
  return (
    <button type="button" className="ui-btn" onClick={() => void open.run()}>
      Change settings
    </button>
  );
}

function Settings({ picked, options }: { picked: PickedPluginShape; options: ExportOption[] }) {
  const shown = useMemo(() => cleanValues(options, picked.props), [options, picked.props]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setError(null), [picked.inst]);
  const commit = (id: string, v: OptionValue) => {
    if (shown[id] === v || busy) return;
    const rt = runtimeOf(picked.pluginId);
    if (!rt) return;
    setBusy(true);
    setError(null);
    rt.redrawShape({ kind: picked.kind, inst: picked.inst, props: { ...picked.props, ...cleanValues(options, { ...shown, [id]: v }) }, drawingId: picked.drawingId })
      .catch((e) => setError(e instanceof Error ? e.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };
  return (
    <fieldset className="plugin-shape-settings" disabled={busy}>
      <legend>Change settings</legend>
      {options.map((o) => (
        <Setting key={`${picked.inst}:${o.id}:${String(shown[o.id])}`} option={o} value={shown[o.id]} commit={(v) => commit(o.id, v)} />
      ))}
      {error && (
        <p className="plugin-export-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** One control. Choices and switches change the shape at once; numbers and text wait for Enter or leaving the box, so typing "12" is one step, not two. */
function Setting({ option: o, value, commit }: { option: ExportOption; value: OptionValue; commit: (v: OptionValue) => void }) {
  const [draft, setDraft] = useState(String(value));
  const hint = o.hint ? <span className="plugin-item-by">{o.hint}</span> : null;
  switch (o.type) {
    case 'choice':
      return (
        <label className="plugin-ui-field">
          <span>{o.label}</span>
          <select value={String(value)} onChange={(e) => commit(e.target.value)}>
            {o.choices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          {hint}
        </label>
      );
    case 'switch':
      return (
        <label className="ui-check plugin-ui-check">
          <input type="checkbox" checked={!!value} onChange={(e) => commit(e.target.checked)} />
          <span>{o.label}</span>
          {hint}
        </label>
      );
    case 'number':
      return (
        <label className="plugin-ui-field">
          <span>{o.label}</span>
          <input
            type="number"
            min={o.min}
            max={o.max}
            step={o.step}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => (draft !== '' && Number.isFinite(Number(draft)) ? commit(Number(draft)) : setDraft(String(value)))}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          {hint}
        </label>
      );
    case 'text':
      return (
        <label className="plugin-ui-field">
          <span>{o.label}</span>
          <input type="text" maxLength={o.maxLength} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit(draft)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          {hint}
        </label>
      );
  }
}
