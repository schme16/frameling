// The small "Export with a plugin" dialog: which frames and what size, then Frameling draws them and the plugin makes
// the files.
import { useMemo, useRef, useState } from 'react';
import { sceneOf } from '../core/symbols';
import { store } from '../core/store';
import { scaleChoices } from '../export/plan';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/icons';
import { openHelp } from '../ui/overlays';
import { mountModal } from '../io/mount';
import { runPluginExport, type PluginExportChoice, type PluginExportJob, type Progress } from './export';

export function openPluginExport(job: PluginExportJob): void {
  mountModal((close) => <Dialog job={job} done={close} />);
}

function Dialog({ job, done }: { job: PluginExportJob; done: () => void }) {
  const doc = useMemo(() => sceneOf(store().get().doc, store().get().ui.frame).doc, []);
  const scales = useMemo(() => scaleChoices(doc), [doc]);
  const [choice, setChoice] = useState<PluginExportChoice>({ range: doc.length > 1 ? 'all' : 'frame', clipId: doc.clips[0]?.id ?? null, scale: scales.includes(1) ? 1 : scales[0] });
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const close = () => {
    abort.current?.abort();
    done();
  };
  const go = async () => {
    setError(null);
    const ac = new AbortController();
    abort.current = ac;
    setProgress({ done: 0, total: 1, label: 'Getting ready' });
    try {
      const r = await runPluginExport(job, choice, ac.signal, setProgress);
      if (r === 'done') done();
      else setProgress(null);
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error ? e.message : 'That export did not work.');
    }
  };
  return (
    <Modal title={`Export ${job.def.label}`} size="sm" className="plugin-export" onClose={close} initialFocus=".ui-btn-primary">
      <div className="plugin-export-body" data-help="plugin-exports">
        <p className="plugin-export-from">
          <Icon name="plugin" size={14} /> From the {job.pluginName} plugin{job.def.description ? `. ${job.def.description}` : '.'}
        </p>
        <label className="plugin-ui-field">
          <span>Frames</span>
          <select value={choice.range === 'clip' ? `clip:${choice.clipId}` : choice.range} onChange={(e) => {
              const v = e.target.value;
              setChoice((c) => (v.startsWith('clip:') ? { ...c, range: 'clip', clipId: v.slice(5) } : { ...c, range: v as 'all' | 'frame' }));
            }} disabled={!!progress}>
            <option value="all">The whole animation ({doc.length} frames)</option>
            {doc.clips.map((c) => (
              <option key={c.id} value={`clip:${c.id}`}>
                Clip: {c.name}
              </option>
            ))}
            <option value="frame">Just this frame</option>
          </select>
        </label>
        <label className="plugin-ui-field">
          <span>Size</span>
          <select value={choice.scale} onChange={(e) => setChoice((c) => ({ ...c, scale: Number(e.target.value) }))} disabled={!!progress}>
            {scales.map((s) => (
              <option key={s} value={s}>
                {Math.round(doc.width * s)} x {Math.round(doc.height * s)} ({s < 1 ? `${Math.round(s * 100)}%` : `${s}x`})
              </option>
            ))}
          </select>
        </label>
        {progress && (
          <div className="plugin-export-progress" role="status">
            <span>{progress.label}...</span>
            <progress max={progress.total || 1} value={progress.done} />
          </div>
        )}
        {error && <p className="plugin-export-error" role="alert">{error}</p>}
      </div>
      <div className="ui-choice-foot">
        <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp('plugin-exports')}>
          <Icon name="help" size={14} /> Learn more
        </button>
        <span className="ui-spacer" />
        <button type="button" className="ui-btn" onClick={close}>
          Cancel
        </button>
        <button type="button" className="ui-btn ui-btn-primary" disabled={!!progress} onClick={() => void go()}>
          <Icon name="export" size={14} /> Export
        </button>
      </div>
    </Modal>
  );
}
