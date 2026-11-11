import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'rig',
    title: 'Bones: pose a character like a puppet',
    section: 'Rigging',
    media: 'rig.mp4',
    summary: 'Draw a skeleton over your character, attach its parts, then pose it by dragging. Frames in between move on their own.',
    keywords: ['bones', 'rig', 'rigging', 'skeleton', 'armature', 'cut-out', 'puppet', 'IK'],
    body: `**Bones** turn a drawing into a puppet. Instead of redrawing an arm on every frame, you drag it into a new pose and Frameling moves it smoothly from the last pose to this one.

**The three steps:**
1. **Draw each part on its own layer**: head, body, upper arm, lower arm and so on. (Or draw it all on one layer and let it [bend](help:rig-bend).)
2. **Draw bones** over it with the [Bone tool](help:rig-bones) (**K**). Start at the hips, then draw from each bone's tip to make chains for the spine, arms and legs.
3. **Attach the parts** with **Rig > Attach parts to bones** (**Shift+A**). Each layer follows the bone nearest it. Fix any in the **Rig panel**.

Now pick the [Pose tool](help:rig-posing) (**O**), go to another frame and drag the bones. That's animation!

The skeleton lives on its own **Bones** layer in the timeline. Each key on it is a pose. Hide it and the bones still move your character; it never shows in exports.

Want to see one working first? **File > New** and pick **Paper doll puppet**: it has a rig and a walk ready to play with.`,
  },
  {
    id: 'rig-bones',
    title: 'The Bone tool: drawing a skeleton',
    section: 'Rigging',
    media: 'rig-bones.mp4',
    summary: 'Drag to draw a bone. Start on a bone\'s tip to make a chain, or on its middle to branch off.',
    keywords: ['bone tool', 'skeleton', 'armature', 'joint', 'chain', 'K'],
    body: `Pick the **Bone tool** (**K**) and **drag** to draw a bone, from its joint to its tip.

- **Chains:** start a drag on the **tip** of a bone (the small dot) and the new bone hangs from it, like an upper arm, then a lower arm, then a hand.
- **Branches:** start on the **middle** of a bone to grow a new chain from it (arms and a neck from the chest).
- **Click** a bone to pick it. **Delete** removes the picked bone; anything hanging from it moves up to its parent.

**Adjusting:** switch the tool to **Adjust bones** in Tool options, or hold **Alt** for a moment, and drag a **joint** (big dot) or **tip** to move it. Moving a tip takes the bones hanging from it along.

**Naming bones** helps later: double-click a bone in the **Rig panel**. Names with *left* and *right* (or *L* and *R*) let [Mirror pose](help:rig-pose-library) swap sides.

You can draw bones on any frame, even over a posed character: they're placed where they'd be at rest so everything lines up.

Prefer slimmer bones? **Rig > Slim bones** switches the look.`,
  },
  {
    id: 'rig-attach',
    title: 'Attaching parts to bones',
    section: 'Rigging',
    media: 'rig-attach.png',
    summary: 'Each layer follows one bone, like a paper cut-out. Attach them all at once, or pick bones in the Rig panel.',
    keywords: ['attach', 'bind', 'parent', 'cut-out', 'link layer to bone', 'skin'],
    body: `A layer **attached** to a bone moves and turns with it, like a paper cut-out pinned to a stick.

- **Rig > Attach parts to bones** (**Shift+A**) attaches every layer that isn't attached yet to the bone nearest the middle of its drawing. It's right most of the time.
- In the **Rig panel**, under **Parts**, every layer has a menu: pick the bone it should follow, **Not attached**, or **Bends with the bones** to [bend it smoothly](help:rig-bend).

You can keep drawing on an attached layer. Draw where you see the part, even when it's turned: Frameling works out where that is on the part itself.

Want hands or mouths that change shape? Keep swapping drawings on the attached layer with keys as usual, or attach a [symbol](help:symbols) with its own frames.`,
  },
  {
    id: 'rig-posing',
    title: 'The Pose tool: posing and IK',
    section: 'Rigging',
    media: 'rig-posing.mp4',
    summary: 'Drag a bone to turn it, drag a tip to pull the whole limb (IK), drag the first joint to move everything. Alt+click pins a bone.',
    keywords: ['pose', 'IK', 'inverse kinematics', 'FK', 'forward kinematics', 'pin', 'plant foot', 'O', 'auto key'],
    body: `Pick the **Pose tool** (**O**), go to a frame, and drag:

- **A bone** to turn it around its joint. Everything hanging from it comes along. (Animators call this *FK*.)
- **A tip** (the small dot) to pull the limb along, the way you'd move a puppet's hand: the arm bends at the elbow by itself. (This is *IK*, inverse kinematics.)
- **The first joint** (usually the hips) to move the whole character.

**Pins:** **Alt+click** a bone to pin it (or use the pin in the Rig panel). A pinned bone stays where it is while you move the rest: pin both feet, then drag the hips down, and the knees bend. Great for walks and sits.

**Every drag makes a key.** Posing on a frame with no pose of its own adds a key on the Bones layer. Frameling asks the first time whether the frames in between should **glide** from the last pose (smooth, with easing) or **jump** (stepped). Change it any time in **Preferences > Behaviour**. Glides use the same [easing](help:easing) as other in-betweens, so you can change the feel in the Symbol and motion panel.

**Squash and stretch:** **Shift+drag** a bone to make it longer or shorter on this frame. See [squash and stretch](help:rig-stretch).

**Rig > Reset pose** puts every bone back where it was drawn, on this frame.`,
  },
  {
    id: 'rig-bend',
    title: 'Bending a drawing with bones',
    section: 'Rigging',
    media: 'rig-bend.mp4',
    summary: 'Let a whole drawing stretch smoothly over the joints, instead of moving in stiff pieces (mesh deform).',
    keywords: ['mesh', 'deform', 'bend', 'warp', 'smooth skin', 'weights', 'skinning', 'noodle', 'tail', 'tentacle'],
    body: `Some things don't come apart into neat pieces: a tail, a noodle arm, a whole character drawn on one layer. Let those **bend**.

Pick the layer and choose **Rig > Bend this layer with the bones**, or choose **Bends with the bones** for it in the Rig panel.

Frameling lays a fine mesh of triangles over the drawing and ties each point to the nearest bones, more strongly the closer it is (*automatic weights*). Points near one bone follow it exactly; points near a joint blend between the two, so elbows and knees bend smoothly. It works on vector drawings and pixel art alike.

**Tips:**
- Draw the bones first, along the middle of the shape, then bend it.
- If it bends in the wrong places, [paint how much it bends](help:rig-weights).
- If you add bones later, choose **Bends with the bones** again to refresh the weights.
- Pixel art keeps its crisp pixels as it bends.
- SVG exports put bent layers in as pictures, since SVG can't bend shapes. Every other export shows exactly what you see.`,
  },
  {
    id: 'rig-weights',
    title: 'Paint how much it bends',
    section: 'Rigging',
    media: 'rig-weights.mp4',
    summary: 'A soft brush for a bending layer: paint which parts follow a bone and how strongly (weight painting).',
    keywords: ['weights', 'weight painting', 'weight paint', 'skin weights', 'influence', 'heat map', 'normalize', 'normalise', 'smooth weights'],
    body: `When a layer [bends with the bones](help:rig-bend), Frameling guesses how strongly each part follows each bone. Most of the time the guess is fine. When a bend looks wrong (a sleeve that tears at the elbow, a tail that bends too early), paint it right.

1. Pick the bending layer, then **Rig > Paint how much it bends**.
2. Pick the **bone** in Tool options, or **Ctrl+click** it on the canvas.
3. Paint. The colours show that bone's pull: **red** follows it fully, **blue** doesn't follow it at all, green and yellow are in between.

**The brush:**
- **More** makes the part under the brush follow the bone more. **Less** makes it follow less. Hold **Alt** to swap them for a moment.
- **Smooth** evens out sudden changes, so the bend is softer.
- **Size** and **Strength** change the brush. A gentle strength and a few strokes work best.

**Tip:** pose the character first (bend the elbow right over), then paint. You see the result as you paint.

Every point always follows its bones by 100% in total: take some pull away from one bone and the others get it. **Even out totals** (normalise) fixes points that don't add up, which can happen after deleting a bone. **Smooth all** softens the whole layer once, and **Start over** goes back to Frameling's guess.

Each stroke is one step to undo.`,
  },
  {
    id: 'rig-stretch',
    title: 'Squash and stretch on bones',
    section: 'Rigging',
    media: 'rig-stretch.mp4',
    summary: 'Shift+drag a bone to make it longer or shorter on this frame, for bouncy, cartoony motion.',
    keywords: ['squash', 'stretch', 'squash and stretch', 'scale bone', 'bone length', 'cartoon', 'elastic'],
    body: `Squash and stretch makes motion feel alive: a body squashes as it lands and stretches as it jumps.

With the [Pose tool](help:rig-posing) (**O**), **Shift+drag** a bone along its length. It gets longer or shorter on this frame, and the parts on it stretch with it. Bones hanging from it come along too.

You can also pick a bone and use the **Squash and stretch** slider in Tool options. **100%** is the length you drew.

It's part of the pose, so it glides between keys like everything else, and it goes into [Godot](help:export-godot-bones) as the bone's scale.

A bone can squash to a quarter of its length and stretch to three times it, so it never turns inside out.`,
  },
  {
    id: 'rig-pose-library',
    title: 'The pose library and mirroring',
    section: 'Rigging',
    media: 'rig-pose-library.png',
    summary: 'Save poses you like and put them back on any frame with one click. Mirror swaps left and right.',
    keywords: ['pose library', 'save pose', 'apply pose', 'mirror pose', 'flip pose', 'swap left right'],
    body: `The **Pose library** sits at the bottom of the **Rig panel**.

- **Save this pose** keeps the pose at the playhead. Double-click its name to rename it ("Wave", "Sit", "Jump").
- **Click a saved pose** to put it on the current frame (it makes a key there if needed).
- The **mirror** button next to it puts it on with left and right swapped.
- **Mirror** (**Alt+M**) flips the pose on the current frame: the left arm takes the right arm's pose and the other way round.

Mirroring pairs bones by name, so name them with *left* and *right* (or *L* and *R*), like "Left arm" and "Right arm". Bones without a pair (spine, head) just turn the other way.

A walk is two poses and their mirrors: contact, passing, then the same two mirrored. See the **Paper doll puppet** template for one built that way.`,
  },
]);
