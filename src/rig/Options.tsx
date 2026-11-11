// Tool options for the Bone and Pose tools.
import { getCommand } from '../core/registry';
import { useStore } from '../core/store';
import { ActionButton, Choice, Tip } from '../canvas/controls';
import { requestOverlay } from '../canvas/controller';
import { setRigUi, useRigUi, type BoneMode } from './state';
import { currentRig } from './ops';

const run = (id: string) => void getCommand(id)?.run();

export function BoneOptions() {
  const { mode, selected } = useRigUi();
  const count = useStore((s) => currentRig(s.doc, s.ui.activeLayerId)?.rig.bones.length ?? 0);
  return (
    <div className="cv-options">
      <Choice<BoneMode>
        label="Bone tool does"
        value={mode}
        options={[
          { value: 'add', label: 'Draw bones', title: 'Drag to draw a bone. Start on a bone to hang the new one from it.' },
          { value: 'adjust', label: 'Adjust bones', title: 'Drag a joint or a tip to move it. Hold Alt to switch for a moment.' },
        ]}
        onChange={(v) => {
          setRigUi({ mode: v });
          requestOverlay();
        }}
      />
      <Tip>
        {mode === 'add'
          ? count
            ? 'Drag from the tip of a bone to add the next one in the chain. Start on the middle of a bone to branch off (arms from a chest). Hold Alt to adjust instead.'
            : 'Drag over your character to draw its first bone, from the hips up is a good start. Then keep drawing from each tip.'
          : 'Drag a joint (the big dot) or a tip (the small dot) to move it. Click a bone to pick it; Delete removes it.'}
      </Tip>
      <div className="cv-row cv-wrap">
        <ActionButton disabled={!count} onClick={() => run('rig.autoAttach')} title="Each layer follows the bone nearest its drawing.">
          Attach parts
        </ActionButton>
        <ActionButton disabled={!selected} onClick={() => run('rig.deleteBone')}>
          Delete bone
        </ActionButton>
        <ActionButton onClick={() => run('view.panel.rig')}>Rig panel</ActionButton>
      </div>
    </div>
  );
}

export function PoseOptions() {
  const count = useStore((s) => currentRig(s.doc, s.ui.activeLayerId)?.rig.bones.length ?? 0);
  return (
    <div className="cv-options">
      <Tip>
        {count
          ? 'Drag a bone to turn it. Drag a tip (the small dot) to pull the chain along, like moving a hand (IK). Drag the first joint to move everything. Alt+click pins a bone so it stays put, like a planted foot.'
          : 'There are no bones yet. Draw some with the Bone tool (K) first.'}
      </Tip>
      <div className="cv-row cv-wrap">
        <ActionButton disabled={!count} onClick={() => run('rig.savePose')}>
          Save pose
        </ActionButton>
        <ActionButton disabled={!count} onClick={() => run('rig.mirrorPose')}>
          Mirror
        </ActionButton>
        <ActionButton disabled={!count} onClick={() => run('rig.resetPose')}>
          Reset
        </ActionButton>
      </div>
    </div>
  );
}
