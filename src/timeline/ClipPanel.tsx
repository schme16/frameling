// The Clip section of Properties: how the clip you clicked on the timeline plays (which way, how often), in plain
// words, so nobody has to find the right-click menu on a small chip.
import type { Clip } from '../core/format';
import { useStore } from '../core/store';
import { clipDirection, clipPlays, isBackAndForth } from '../core/clipPlay';
import { ActionButton, Tip } from '../canvas/controls';
import { ClipPlayFields, DIRECTION_HELP, repeatLabel } from './ClipPlay';
import { setTl, useTl } from './state';

/** The clip picked on the timeline, if it is still in the document. */
export function pickedClipOf(doc: { clips: Clip[] }, clipId: string | null): Clip | undefined {
  return clipId ? doc.clips.find((c) => c.id === clipId) : undefined;
}

export function ClipPanel() {
  const clipId = useTl((t) => t.clipId);
  const clip = useStore((s) => pickedClipOf(s.doc, clipId));
  if (!clip) {
    return (
      <div className="cv-panel" data-help="timeline-clip-play">
        <Tip>Click a clip on the timeline to see and change how it plays: forward, backward or back and forth, and how many times. Drag across frames in the clips row to make one.</Tip>
      </div>
    );
  }
  const dir = clipDirection(clip);
  const frames = Math.abs(clip.end - clip.start) + 1;
  return (
    <div className="cv-panel" data-help="timeline-clip-play">
      <div className="tl-clip-head">
        <b>{clip.name}</b>
        <span className="cv-tip">
          frames {Math.min(clip.start, clip.end) + 1} to {Math.max(clip.start, clip.end) + 1} ({frames})
        </span>
      </div>
      <ClipPlayFields clip={clip} />
      <Tip>
        Now: {DIRECTION_HELP[dir].toLowerCase()}, {repeatLabel(clip).toLowerCase()}.
        {isBackAndForth(dir) && clipPlays(clip) !== Infinity ? ' Back and forth counts each direction as one.' : ''} Games and sprite sheets read this too.
      </Tip>
      <div className="cv-row cv-wrap">
        <ActionButton onClick={() => setTl({ clipId: null })}>Play everything again</ActionButton>
      </div>
    </div>
  );
}
