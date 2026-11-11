import { getTool } from '../../core/registry';
import { useStore } from '../../core/store';
import '../canvas.css';

/** Shows the options of whichever tool is active. */
export function ToolOptionsPanel() {
  const id = useStore((s) => s.ui.tool);
  const tool = getTool(id);
  if (!tool) return <div className="cv-panel-empty">Pick a tool to see its options.</div>;
  const Options = tool.options;
  return (
    <div className="cv-panel" data-tool={tool.id}>
      <h3 className="cv-panel-title">{tool.label}</h3>
      {Options ? <Options /> : <p className="cv-tip">This tool has no options.</p>}
    </div>
  );
}
