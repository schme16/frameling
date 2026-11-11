// The Camera panel: add a camera, look through it, set where it looks on this frame, its in-betweens, and how far
// each layer is from it (parallax).
import { celAt } from '../core/doc';
import { store, useStore } from '../core/store';
import { cameraViewOn, parallaxFactor } from '../core/camera';
import { ActionButton, Tip, Toggle } from '../canvas/controls';
import { setViewSettings, useViewSettings } from '../canvas/viewSettings';
import { LengthNum, Num, Section, TweenSection } from '../symbols/PropertiesPanel';
import { addCamera, resetView, setDepth, setView, stageCamera, toggleThroughCamera } from './ops';
import './camera.css';

function DepthList() {
  const layers = useStore((s) => s.doc.layers);
  const list = layers.filter((l) => l.kind !== 'camera').slice().reverse();
  if (!list.length) return null;
  return (
    <Section title="Distance from the camera (parallax)">
      <Tip>Far layers drift slowly when the camera pans, near ones rush past. 0 is on the stage, 1 is twice as far, 3 is four times as far. Below 0 is closer.</Tip>
      <div className="cam-depths">
        {list.map((l) => {
          const f = parallaxFactor(l.depth);
          return (
            <div className="cam-depth" key={l.id}>
              <span className="cam-depth-name" title={l.name}>
                {l.name}
              </span>
              <Num label="Distance" value={l.depth ?? 0} step={0.25} onChange={(v) => setDepth(l.id, v)} title={`Moves at ${Math.round(f * 100)}% of the camera's speed`} />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export function CameraPanel() {
  const doc = useStore((s) => s.doc);
  const frame = useStore((s) => s.ui.frame);
  const activeLayerId = useStore((s) => s.ui.activeLayerId);
  const through = useViewSettings((v) => v.throughCamera);
  const whilePlaying = useViewSettings((v) => v.cameraWhilePlaying);
  if (doc.editing?.length) {
    return (
      <div className="cv-panel cv-options cam-panel" data-help="camera">
        <Tip>The camera belongs to the main scene. Go back out of the symbol to change it.</Tip>
      </div>
    );
  }
  const cam = stageCamera(doc);
  if (!cam) {
    return (
      <div className="cv-panel cv-options cam-panel" data-help="camera">
        <Tip>A camera frames your scene: pan across a wide background, zoom in for a close-up, or tilt for drama. Exports and playback show what it sees.</Tip>
        <div className="cv-row cv-wrap">
          <ActionButton onClick={() => addCamera()} title="Adds a camera layer on top of the others">
            Add a camera
          </ActionButton>
        </div>
      </div>
    );
  }
  const view = cameraViewOn(doc, cam, frame);
  const cel = celAt(cam, frame);
  const onKey = !!cel && cel.start === frame;
  const set = (key: string, patch: Parameters<typeof setView>[0], label: string) => setView(patch, label, `cam-${key}-${frame}`);
  return (
    <div className="cv-panel cv-options cam-panel" data-help="camera">
      <Toggle label="Look through the camera" checked={through} onChange={(v) => toggleThroughCamera(v)} hint="See just what the camera sees (Shift+C). You can still draw." />
      <Toggle label="Look through it while playing" checked={whilePlaying} onChange={(v) => setViewSettings({ cameraWhilePlaying: v })} />
      {!cam.visible && <Tip>The camera layer is hidden, so the camera is off: exports show the whole stage.</Tip>}
      <Section title={`Where it looks on frame ${frame + 1}`}>
        {view ? (
          <>
            {!onKey && <Tip>Changing it here makes a new camera key on this frame. It glides there if the camera has in-betweens.</Tip>}
            <div className="sy-grid">
              <LengthNum label="X" px={view.x} onPx={(v) => set('x', { x: v }, 'Move the camera')} title="Middle of the camera's view, across" />
              <LengthNum label="Y" px={view.y} onPx={(v) => set('y', { y: v }, 'Move the camera')} title="Middle of the camera's view, down" />
              <Num label="Zoom" suffix="%" value={view.zoom * 100} step={5} onChange={(v) => set('zoom', { zoom: v / 100 }, 'Zoom the camera')} title="200% shows half as much, twice as big" />
              <Num label="Turn" suffix="°" value={view.rotation} onChange={(v) => set('rot', { rotation: v }, 'Turn the camera')} title="Tilts the camera (rotation), in degrees" />
            </div>
            <div className="cv-row cv-wrap">
              <ActionButton onClick={() => resetView()}>Whole stage again</ActionButton>
              {activeLayerId !== cam.id && <ActionButton onClick={() => store().setUi({ activeLayerId: cam.id, tool: 'camera' })}>Move it on the canvas</ActionButton>}
            </div>
          </>
        ) : (
          <Tip>The camera has no key on this frame. Drag its bar in the timeline to cover it.</Tip>
        )}
      </Section>
      {activeLayerId === cam.id ? <TweenSection /> : null}
      <DepthList />
    </div>
  );
}
