// Tool options for the Bone and Pose tools.
import { getCommand } from '../core/registry';
import { store, useStore } from '../core/store';
import { ActionButton, Choice, Field, Slider, Tip } from '../canvas/controls';
import { setChoice, useChoice } from '../core/choices';
import { BONE_STRETCH } from '../core/format';
import { setStretch, stretchOf } from './math';
import { rigPoseAt } from './pose';
import { requestOverlay } from '../canvas/controller';
import { setRigUi, useRigUi, type PoseGrab } from './state';
import { currentPose, currentRig, renameBone, setPose, type RemoveBoneChoice } from './ops';
import './rig.css';

const run = (id: string) => void getCommand(id)?.run();

/** The picked bone on the bones layer now, if any. */
function usePickedBone() {
  const { selected } = useRigUi();
  return useStore((s) => (selected ? currentRig(s.doc, s.ui.activeLayerId)?.rig.bones.find((b) => b.id === selected) : undefined));
}

/** The three bone tools as buttons, so switching between adding, editing and removing is one click. */
function BoneToolSwitch() {
  const tool = useStore((s) => s.ui.tool);
  return (
    <Choice<string>
      label="Bone tool"
      value={tool}
      options={[
        { value: 'bone', label: 'Add', title: 'Add bone (K): drag to draw a bone' },
        { value: 'bone-edit', label: 'Edit', title: 'Edit bone (Alt+K): drag a joint or a tip to move it' },
        { value: 'bone-remove', label: 'Remove', title: 'Remove bone (Alt+Shift+K): click a bone to take it away' },
      ]}
      onChange={(v) => store().setUi({ tool: v })}
    />
  );
}

/** The picked bone's name, to change in place. Enter or clicking away keeps it, Escape puts it back. */
function BoneName() {
  const bone = usePickedBone();
  if (!bone) return null;
  const rigId = currentRig()?.id;
  return (
    <Field label="Picked bone">
      <input
        key={bone.id + bone.name}
        className="rg-name-input"
        data-bone-name
        defaultValue={bone.name}
        aria-label="Name of the picked bone"
        maxLength={60}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') {
            e.currentTarget.value = bone.name;
            e.currentTarget.blur();
          }
        }}
        onBlur={(e) => {
          if (rigId && e.currentTarget.value.trim() && e.currentTarget.value !== bone.name) renameBone(rigId, bone.id, e.currentTarget.value);
        }}
      />
    </Field>
  );
}

function PinButton() {
  const bone = usePickedBone();
  return (
    <ActionButton disabled={!bone} onClick={() => run('rig.togglePin')} title="A pinned bone stays put while you pose the others, like a planted foot.">
      {bone?.pin ? 'Unpin' : 'Pin'}
    </ActionButton>
  );
}

export function AddBoneOptions() {
  const { selected } = useRigUi();
  const count = useStore((s) => currentRig(s.doc, s.ui.activeLayerId)?.rig.bones.length ?? 0);
  return (
    <div className="cv-options">
      <BoneToolSwitch />
      <Tip>
        {count
          ? 'Drag from the tip of a bone to add the next one in the chain. Start on the middle of a bone to branch off (arms from a chest). Or pick a bone and press Add next bone.'
          : 'Drag over your character to draw its first bone, from the hips up is a good start. Then keep drawing from each tip.'}
      </Tip>
      <div className="cv-row cv-wrap">
        <ActionButton disabled={!selected} onClick={() => run('rig.addChildBone')} title="Adds a bone from the tip of the picked one, carrying on the same way. No dragging.">
          Add next bone
        </ActionButton>
        <ActionButton disabled={!selected} onClick={() => run('rig.deleteBone')} title="Takes the picked bone away (Delete)">
          Remove bone
        </ActionButton>
        <ActionButton disabled={!count} onClick={() => run('rig.autoAttach')} title="Each layer follows the bone nearest its drawing.">
          Attach parts
        </ActionButton>
        <ActionButton onClick={() => run('view.panel.rig')}>Rig panel</ActionButton>
      </div>
    </div>
  );
}

export function EditBoneOptions() {
  const { selected } = useRigUi();
  const count = useStore((s) => currentRig(s.doc, s.ui.activeLayerId)?.rig.bones.length ?? 0);
  return (
    <div className="cv-options">
      <BoneToolSwitch />
      <Tip>
        {count
          ? 'Drag a joint (the big dot) or a tip (the small dot) to move it; bones hanging from a tip come along. Click a bone to pick it, then rename it, pin it or step along the chain with the buttons.'
          : 'There are no bones yet. Pick Add and draw some.'}
      </Tip>
      <BoneName />
      <div className="cv-row cv-wrap">
        <ActionButton disabled={!selected} onClick={() => run('rig.addChildBone')} title="Adds a bone from the tip of the picked one">
          Add next bone
        </ActionButton>
        <PinButton />
        <ActionButton disabled={!selected} onClick={() => run('rig.deleteBone')} title="Takes the picked bone away (Delete)">
          Remove bone
        </ActionButton>
      </div>
      <div className="cv-row cv-wrap">
        <ActionButton disabled={!selected} onClick={() => run('rig.pickParent')} title="Pick the bone this one hangs from">
          Pick the one above
        </ActionButton>
        <ActionButton disabled={!selected} onClick={() => run('rig.pickChild')} title="Pick the bone hanging from this one">
          Pick the one below
        </ActionButton>
      </div>
    </div>
  );
}

export function RemoveBoneOptions() {
  const count = useStore((s) => currentRig(s.doc, s.ui.activeLayerId)?.rig.bones.length ?? 0);
  const how = useChoice<RemoveBoneChoice>('rig.removeBone');
  return (
    <div className="cv-options">
      <BoneToolSwitch />
      <Tip>
        {count
          ? 'Click a bone to take it away. It turns pink first, so you can see what will go. Changed your mind? Undo (Ctrl+Z) brings it back.'
          : 'There are no bones to remove.'}
      </Tip>
      <Choice<RemoveBoneChoice>
        label="Bones hanging from it"
        value={how}
        options={[
          { value: 'keep', label: 'Keep them', title: 'They stay, and hang from the bone above' },
          { value: 'branch', label: 'Remove them too', title: 'The whole branch goes' },
        ]}
        onChange={(v) => {
          setChoice('rig.removeBone', v);
          requestOverlay();
        }}
      />
    </div>
  );
}

export function PoseOptions() {
  const count = useStore((s) => currentRig(s.doc, s.ui.activeLayerId)?.rig.bones.length ?? 0);
  const { selected, grab } = useRigUi();
  const stretch = useStore((s) => {
    const rig = currentRig(s.doc, s.ui.activeLayerId);
    return rig && selected && rig.rig.bones.some((b) => b.id === selected) ? stretchOf(rigPoseAt(s.doc, rig, s.ui.frame)[selected]) : undefined;
  });
  return (
    <div className="cv-options">
      <Choice<PoseGrab>
        label="Dragging a bone does"
        value={grab}
        options={[
          { value: 'turn', label: 'Turn and pull', title: 'Drag a bone to turn it, a tip to pull the limb along (IK), the first joint to move everything' },
          { value: 'stretch', label: 'Stretch', title: 'Drag along a bone to make it longer or shorter. Hold Shift to do it for a moment.' },
          { value: 'pin', label: 'Pin', title: 'Click a bone to pin it or free it. Hold Alt and click to do it for a moment.' },
        ]}
        onChange={(v) => setRigUi({ grab: v })}
      />
      <Tip>
        {count
          ? grab === 'stretch'
            ? 'Drag along a bone to make it longer or shorter on this frame. Bones hanging from it stretch along.'
            : grab === 'pin'
              ? 'Click a bone to pin it, so it stays put while you move the rest, like a planted foot. Click again to free it.'
              : 'Drag a bone to turn it. Drag a tip (the small dot) to pull the chain along, like moving a hand (IK). Drag the first joint to move everything. Shift+drag stretches and Alt+click pins, for a moment.'
          : 'There are no bones yet. Draw some with the Bone tool (K) first.'}
      </Tip>
      {stretch !== undefined && (
        <Slider
          label="Squash and stretch"
          value={Math.round(stretch * 100)}
          min={BONE_STRETCH.min * 100}
          max={BONE_STRETCH.max * 100}
          step={1}
          format={(v) => `${v}%`}
          hint="How long the picked bone is on this frame. 100% is as drawn. Bones hanging from it stretch along."
          onChange={(v) => {
            const rig = currentRig();
            if (rig && selected) setPose(rig.id, setStretch(currentPose(rig), selected, v / 100), 'Squash and stretch', `rig-stretch-${selected}`);
            requestOverlay();
          }}
        />
      )}
      <div className="cv-row cv-wrap">
        <PinButton />
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
