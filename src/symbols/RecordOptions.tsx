import { Choice, Slider, Toggle } from '../canvas/controls';
import { useToolSettings } from '../tools/settings';
import { changeRecordSetting } from './recording';

/** Record a move: how closely the keys follow the hand, and whether the move is kept as keys or as one path. */
export function RecordOptions() {
  const detail = useToolSettings((s) => s.recordDetail);
  const keep = useToolSettings((s) => s.recordKeep) === 'path' ? 'path' : 'keys';
  const face = useToolSettings((s) => s.recordFace);
  return (
    <>
      <Slider label="Detail" value={detail} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => changeRecordSetting({ recordDetail: v })} hint="Low gives a few smooth keys. High follows your hand closely, up to a key on every frame." />
      <Choice label="Keep it as" value={keep} options={[{ value: 'keys', label: 'Keys', title: 'Keys with in-betweens, one for each turn and change of speed.' }, { value: 'path', label: 'One path', title: 'Two keys and a smooth line between them, with your timing kept as one easing curve.' }]} onChange={(v) => changeRecordSetting({ recordKeep: v })} />
      {keep === 'path' && <Toggle label="Face the way it goes" checked={face} onChange={(v) => changeRecordSetting({ recordFace: v })} hint="Turns the thing to point along the path as it travels." />}
    </>
  );
}
