// The Rig panel: the skeleton's bones, which layer follows which bone, and the pose library.
import { useState } from 'react';
import type { Bone, Id, Rig } from '../core/format';
import { getCommand } from '../core/registry';
import { store, useStore } from '../core/store';
import { ActionButton, Tip } from '../canvas/controls';
import { requestOverlay } from '../canvas/controller';
import { Icon } from '../ui/icons';
import { InlineName } from '../timeline/Menu';
import { applySavedPose, attachableLayers, attachLayer, bendLayer, currentRig, deleteSavedPose, renameBone, renameSavedPose, setPin } from './ops';
import { setRigUi, useRigUi } from './state';
import { artCoverage } from './coverage';
import { toast } from '../ui/toast';
import '../symbols/symbols.css';
import './rig.css';

const run = (id: string) => void getCommand(id)?.run();

/** Bones in tree order with their depth, for an indented list. */
function boneTree(rig: Rig): { bone: Bone; depth: number }[] {
  const out: { bone: Bone; depth: number }[] = [];
  const walk = (parent: Id | null, depth: number) => {
    for (const b of rig.bones)
      if ((b.parent ?? null) === parent) {
        out.push({ bone: b, depth });
        walk(b.id, depth + 1);
      }
  };
  walk(null, 0);
  return out;
}

export function RigPanel() {
  const doc = useStore((s) => s.doc);
  const activeId = useStore((s) => s.ui.activeLayerId);
  const frame = useStore((s) => s.ui.frame);
  const { selected } = useRigUi();
  const [renaming, setRenaming] = useState<Id | null>(null);
  const rig = currentRig(doc, activeId);

  if (!rig || !rig.rig.bones.length)
    return (
      <div className="cv-panel cv-options rg-panel" data-help="rig">
        <Tip>
          No bones yet. Bones let you pose a character by dragging its arms and legs, like a puppet, and the frames in between move on their own.
        </Tip>
        <Tip>Draw each part of your character on its own layer (head, body, arms, legs), then draw bones over it with the Bone tool.</Tip>
        <div className="cv-row cv-wrap">
          <ActionButton onClick={() => run('rig.addBones')} title="Pick the Bone tool (K)">
            Draw bones
          </ActionButton>
          <ActionButton onClick={() => run('file.new')} title="The Paper doll puppet template has a ready-made rig and a walk">
            Try the puppet template
          </ActionButton>
        </div>
      </div>
    );

  const tree = boneTree(rig.rig);
  const layers = attachableLayers(doc).slice().reverse();
  const poses = rig.rig.poses ?? [];
  const pick = (id: Id) => {
    setRigUi({ selected: id });
    requestOverlay();
  };

  return (
    <div className="cv-panel cv-options rg-panel" data-help="rig">
      <h3 className="rg-head">Bones</h3>
      <ul className="rg-bones" aria-label="Bones">
        {tree.map(({ bone, depth }) => (
          <li key={bone.id} className={'rg-bone' + (bone.id === selected ? ' is-on' : '')} style={{ paddingLeft: 6 + depth * 12 }}>
            {renaming === bone.id ? (
              <InlineName
                value={bone.name}
                label="Bone name"
                onDone={(v) => {
                  setRenaming(null);
                  if (v) renameBone(rig.id, bone.id, v);
                }}
              />
            ) : (
              <button type="button" className="rg-name" onClick={() => pick(bone.id)} onDoubleClick={() => setRenaming(bone.id)} title="Click to pick, double-click to rename">
                <Icon name="bone" size={13} /> {bone.name}
              </button>
            )}
            <button
              type="button"
              className={'sy-icon-btn rg-pin' + (bone.pin ? ' is-on' : '')}
              aria-pressed={!!bone.pin}
              aria-label={bone.pin ? `Unpin ${bone.name}` : `Pin ${bone.name}`}
              title={bone.pin ? 'Pinned: stays put while you move other bones. Click to free it.' : 'Pin it, so it stays put while you move other bones (like a planted foot)'}
              onClick={() => {
                setPin(rig.id, bone.id, !bone.pin);
                requestOverlay();
              }}
            >
              <Icon name="pin" size={14} />
            </button>
          </li>
        ))}
      </ul>

      <h3 className="rg-head">Parts</h3>
      <Tip>Each layer follows one bone, like a paper cut-out. Pick "Bends" to let it stretch smoothly over the joints instead.</Tip>
      <ul className="rg-parts" aria-label="Which bone each layer follows">
        {layers.map((l) => {
          const value = l.bind?.rig === rig.id ? (l.bind.mesh ? '~mesh' : l.bind.bone) : '';
          return (
            <li key={l.id} className="rg-part">
              <span className="rg-part-name" title={l.name}>
                {l.name}
              </span>
              <select
                aria-label={`Bone for ${l.name}`}
                value={value}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '~mesh') {
                    const r = bendLayer(l.id, rig.id, artCoverage(store().get().doc, l, frame));
                    if (r) toast(r);
                  } else attachLayer(l.id, rig.id, v || null);
                }}
              >
                <option value="">Not attached</option>
                {tree.map(({ bone }) => (
                  <option key={bone.id} value={bone.id}>
                    {bone.name}
                  </option>
                ))}
                <option value="~mesh">Bends with the bones</option>
              </select>
            </li>
          );
        })}
      </ul>
      <div className="cv-row cv-wrap">
        <ActionButton onClick={() => run('rig.autoAttach')} title="Each layer that isn't attached follows the bone nearest its drawing">
          Attach the rest
        </ActionButton>
      </div>

      <h3 className="rg-head">Pose library</h3>
      {!poses.length ? <Tip>Save poses you like (a wave, a jump, a sit) and put them back on any frame with one click.</Tip> : null}
      <ul className="rg-poses" aria-label="Saved poses">
        {poses.map((p) => (
          <li key={p.id} className="rg-pose">
            {renaming === p.id ? (
              <InlineName
                value={p.name}
                label="Pose name"
                onDone={(v) => {
                  setRenaming(null);
                  if (v) renameSavedPose(p.id, v);
                }}
              />
            ) : (
              <button type="button" className="rg-name" onClick={() => applySavedPose(p.id)} onDoubleClick={() => setRenaming(p.id)} title="Click to put this pose on the current frame, double-click to rename">
                <Icon name="pose" size={13} /> {p.name}
              </button>
            )}
            <button type="button" className="sy-icon-btn" aria-label={`Put ${p.name} on mirrored`} title="Put it on mirrored (left and right swapped)" onClick={() => applySavedPose(p.id, true)}>
              <Icon name="mirror" size={14} />
            </button>
            <button type="button" className="sy-icon-btn" aria-label={`Delete ${p.name}`} title="Delete this pose" onClick={() => deleteSavedPose(p.id)}>
              <Icon name="trash" size={14} />
            </button>
          </li>
        ))}
      </ul>
      <div className="cv-row cv-wrap">
        <ActionButton onClick={() => run('rig.savePose')}>Save this pose</ActionButton>
        <ActionButton onClick={() => run('rig.mirrorPose')} title="Swap left and right">
          Mirror
        </ActionButton>
        <ActionButton onClick={() => run('rig.resetPose')} title="Every bone back where it was drawn">
          Reset
        </ActionButton>
      </div>
    </div>
  );
}
