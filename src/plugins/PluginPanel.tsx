// A plugin's panel, drawn by Frameling from the plugin's description (ui-schema.ts). The plugin never touches the DOM:
// it hears about clicks and changes as events, and sends back a new description when it wants the panel to change.
import { useEffect, useState, type ComponentType } from 'react';
import { panelTrees, runtimeOf, setPanelFactory } from './manager';
import type { UiNode } from './ui-schema';

function Node({ node, send }: { node: UiNode; send: (id: string, value: unknown) => void }) {
  switch (node.type) {
    case 'column':
    case 'row':
      return (
        <div className={`plugin-ui-${node.type}`}>
          {node.children.map((c, i) => (
            <Node key={i} node={c} send={send} />
          ))}
        </div>
      );
    case 'text':
      return <p className={`plugin-ui-text${node.style ? ` is-${node.style}` : ''}`}>{node.text}</p>;
    case 'divider':
      return <hr className="plugin-ui-divider" />;
    case 'button':
      return (
        <button type="button" className={`ui-btn${node.primary ? ' ui-btn-primary' : ''}`} onClick={() => send(node.id, true)}>
          {node.label}
        </button>
      );
    case 'checkbox':
      return <Check node={node} send={send} />;
    case 'slider':
    case 'number':
      return <NumberField node={node} send={send} />;
    case 'text-input':
      return <TextField node={node} send={send} />;
    case 'select':
      return (
        <label className="plugin-ui-field">
          <span>{node.label}</span>
          <select value={node.value} onChange={(e) => send(node.id, e.target.value)}>
            {node.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
    case 'color':
      return (
        <label className="plugin-ui-field">
          <span>{node.label}</span>
          <input type="color" defaultValue={node.value} key={node.value} onChange={(e) => send(node.id, e.target.value)} />
        </label>
      );
  }
}

function Check({ node, send }: { node: Extract<UiNode, { type: 'checkbox' }>; send: (id: string, v: unknown) => void }) {
  const [on, setOn] = useState(node.value);
  useEffect(() => setOn(node.value), [node.value]);
  return (
    <label className="ui-check plugin-ui-check">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked);
          send(node.id, e.target.checked);
        }}
      />
      <span>{node.label}</span>
    </label>
  );
}

function NumberField({ node, send }: { node: Extract<UiNode, { type: 'slider' | 'number' }>; send: (id: string, v: unknown) => void }) {
  const [v, setV] = useState(node.value);
  useEffect(() => setV(node.value), [node.value]);
  const change = (n: number) => {
    setV(n);
    if (Number.isFinite(n)) send(node.id, n);
  };
  return (
    <label className="plugin-ui-field">
      <span>
        {node.label}
        {node.type === 'slider' && <output>{v}</output>}
      </span>
      <input type={node.type === 'slider' ? 'range' : 'number'} min={node.min} max={node.max} step={node.step} value={v} onChange={(e) => change(Number(e.target.value))} />
    </label>
  );
}

function TextField({ node, send }: { node: Extract<UiNode, { type: 'text-input' }>; send: (id: string, v: unknown) => void }) {
  const [v, setV] = useState(node.value);
  useEffect(() => setV(node.value), [node.value]);
  return (
    <label className="plugin-ui-field">
      <span>{node.label}</span>
      <input type="text" value={v} maxLength={500} onChange={(e) => setV(e.target.value)} onBlur={() => send(node.id, v)} onKeyDown={(e) => e.key === 'Enter' && send(node.id, v)} />
    </label>
  );
}

function makePanel(fullId: string, pluginId: string, localId: string): ComponentType {
  return function PluginPanel() {
    const tree = panelTrees.use((t) => t[fullId]);
    if (!tree) return null;
    return (
      <div className="plugin-panel" data-help="plugin-panels">
        <Node node={tree} send={(id, value) => runtimeOf(pluginId)?.panelEvent(localId, id, value)} />
      </div>
    );
  };
}

setPanelFactory(makePanel);
