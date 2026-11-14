import { useStore } from '../../core/store';
import { Slider, Tip } from '../../canvas/controls';
import { Wells } from '../../canvas/panels/Wells';
import { setToolSettings, useToolSettings } from '../settings';
import { PixelOutlineOptions, useLayerKind } from '../../pixel/ToolOptions';
import { DrawModeToggle } from './DrawModeToggle';
import { MirrorOptions } from './MirrorOptions';

export function PolyStarOptions() {
  const tool = useStore((s) => s.ui.tool);
  const strokeOn = useStore((s) => s.ui.strokeOn);
  const t = useToolSettings((s) => s);
  const star = tool === 'star';
  const pixel = useLayerKind() === 'pixel';
  return (
    <div className="cv-options">
      <DrawModeToggle />
      <Wells />
      {star ? (
        <>
          <Slider label="Points" value={t.starPoints} min={3} max={24} onChange={(v) => setToolSettings({ starPoints: v })} />
          <Slider label="Dip depth" value={100 - t.starInner} min={5} max={90} format={(v) => `${v}%`} onChange={(v) => setToolSettings({ starInner: 100 - v })} hint="How far in the dips between the points go (the inner radius)." />
        </>
      ) : (
        <Slider label="Sides" value={t.polygonSides} min={3} max={24} onChange={(v) => setToolSettings({ polygonSides: v })} />
      )}
      {pixel ? <PixelOutlineOptions show={strokeOn} /> : strokeOn && <Slider label="Outline thickness" value={t.shapeStroke} min={1} max={60} format={(v) => `${v}px`} onChange={(v) => setToolSettings({ shapeStroke: v })} />}
      {!pixel && <MirrorOptions />}
      <Tip>{`Hold Shift to keep it even${star ? ' (equal arms)' : ' (all sides the same)'}. Hold Alt to draw from the middle.`}</Tip>
    </div>
  );
}
