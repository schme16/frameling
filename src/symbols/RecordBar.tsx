// The bar that appears over the canvas after a recording: how closely the keys follow your hand, play it, or try again.
import { useStore } from '../core/store';
import { useToolSettings } from '../tools/settings';
import { changeRecordSetting, clearTake, playTake, recordAgain, takeIsLatest, useTake } from './recording';
import './symbols.css';

export function RecordBar() {
  const take = useTake();
  useStore((s) => s.doc);
  const detail = useToolSettings((s) => s.recordDetail);
  const keep = useToolSettings((s) => s.recordKeep) === 'path' ? 'path' : 'keys';
  const fps = useStore((s) => s.doc.fps);
  if (!take || !takeIsLatest(take)) return null;
  const secs = Math.round((take.frames / fps) * 10) / 10;
  return (
    <div className="sy-recbar" role="group" aria-label="Recorded move">
      <span className="sy-recbar-what">{keep === 'path' ? `One path, ${secs} s` : take.keys === 1 ? `1 key, ${secs} s` : `${take.keys} keys, ${secs} s`}</span>
      <label className="sy-recbar-detail">
        <span>Detail</span>
        <input type="range" min={0} max={1} step={0.01} value={detail} aria-label="Detail: how closely the keys follow your hand" title="Low gives a few smooth keys. High follows your hand closely." onChange={(e) => changeRecordSetting({ recordDetail: Number(e.target.value) })} />
      </label>
      <span className="sy-recbar-keep" role="radiogroup" aria-label="Keep it as">
        {(['keys', 'path'] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={keep === k} data-on={keep === k} onClick={() => changeRecordSetting({ recordKeep: k })} title={k === 'keys' ? 'Keys with in-betweens' : 'Two keys and one smooth line to follow'}>
            {k === 'keys' ? 'Keys' : 'One path'}
          </button>
        ))}
      </span>
      <button type="button" className="sy-recbar-btn" onClick={playTake} title="Watch it from the start">
        Play
      </button>
      <button type="button" className="sy-recbar-btn" onClick={recordAgain} title="Take this back and record it again">
        Record again
      </button>
      <button type="button" className="sy-done" onClick={clearTake} title="Keep it">
        Done
      </button>
    </div>
  );
}
