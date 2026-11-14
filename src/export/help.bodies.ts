// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
import { ix } from '../features/flags';

export const bodies: Record<string, string> = {
  exporting: `Saving keeps your drawing editable. **Exporting** makes something to share or use somewhere else, and leaves your drawing as it is.

Press **Ctrl+E** (**Cmd+E** on a Mac), or choose **File > Export**, pick a format card, tweak the options if you like, and press **Export**. Frameling asks where to put it, then draws every frame and shows a progress bar. You can cancel any time.

${ix('The five formats most people want come first: **Animated GIF**, **MP4 video**, **PNG sequence**, **Sprite sheet** and **Interactives**.', 'The four formats most people want come first: **Animated GIF**, **MP4 video**, **PNG sequence** and **Sprite sheet**.')} The others are under **More formats**. Every export is also in the **File > Export** submenu.

## Which one?

| I want to... | Pick |
| --- | --- |
| Post it or send it to someone | **MP4 video** |
| Put it on a website, with a see-through background | **WebM video** |
| Use it in a chat or forum | **Animated GIF** |
| Something sharper than a GIF, with soft edges | **Animated PNG** |
| One picture of the frame I'm on | **PNG picture** |
| One picture per frame, for a video editor | **PNG sequence** |
| Vector art that stays sharp at any size | **SVG drawing** |
| Use it in a game or on a web page | **Sprite sheet** |
${ix('| Put it on an Interactives page and control it there | **Interactives** |\n')}| An app or website, as a small vector animation | **Lottie animation** |
| A web page, one file that plays by itself | **Moving SVG** |
| Edit it in a video editor, with a see-through background | **ProRes video** |
| Keep working on this frame in Photoshop, Krita or Affinity | **Photoshop layers** |
| Print it, or share sharp vector pages | **PDF** |
| Keep working on the shapes in Adobe Illustrator | **Illustrator** |

## Options everyone shares

- **What to export:** the whole animation, one clip, or just this frame.
- **Size:** how many times bigger than your drawing. Pixel art only offers whole numbers, so every pixel stays a crisp square.
- **Transparent background:** leave the background see-through, for formats that can do that. If a format can't, the box is greyed out and says why.

## What carries over

**What carries over** says what the picked format keeps. Videos, GIFs, PNGs and sprite sheets keep everything. Vector and layered formats (SVG, Lottie, PDF, Photoshop) can't keep quite everything, and the note says what changes before you export.

## Quick repeat

**Ctrl+Shift+E** exports again with the same settings as last time, without asking questions (it still asks where to save).

Every export looks exactly like the canvas, and a slow computer makes the same file as a fast one.

More: [Video, GIF and APNG](help:export-video-gif-apng), [Sprite sheets](help:export-sprite-sheets), [SVG](help:export-svg), [Lottie](help:export-lottie), [Moving SVG](help:export-svg-animated), ${ix('[Interactives](help:export-interactives), ')}[ProRes](help:export-prores), [Photoshop](help:export-psd), [PDF](help:export-pdf), [Illustrator](help:export-illustrator).`,
  'export-video-gif-apng': `## MP4 video

Plays almost everywhere: phones, social media, slides. It can't have a see-through background, so your drawing's background colour is used (white if there isn't one). Videos need an even number of pixels, so a drawing with an odd size gets one extra row or column of background. If your animation has sound, see [Sound](help:sound) for how it plays on Apple devices.

## WebM video

Great for websites. It can keep a **transparent background** on computers that support it. If yours doesn't, the option is greyed out and says so.

WebM uses **AV1** when your computer can make it (smaller files, slower to make), and falls back to VP9, then VP8. You can pick **VP9** instead with the *Video codec* buttons in the export window, or in Preferences > Behaviour. If the codec you like can't keep a see-through background but another one can, Frameling uses that one when you ask for transparency.

## Animated GIF

Works in chats and forums where a video won't play. GIFs are limited:

- Up to **256 colours**. Frameling picks them from your whole animation, so they suit it.
- Transparency is **all or nothing**: a pixel is either there or it isn't. Soft edges become hard.
- **Smooth colours (dither)** sprinkles pixels to fake in-between shades. It helps gradients and soft shading, and looks noisy on flat colour. Leave it off for pixel art.
- No faster than 50 frames per second.

## Animated PNG (APNG)

Like a GIF with none of the limits: full colour and soft see-through edges. It works in modern browsers and most chat apps, but not everywhere, so use a GIF when you need to be sure.

## Loop

GIF and APNG can **loop forever**, or play once and stop. Videos have no loop setting. Players decide that themselves.

When you export a clip, the loop box follows the clip: a clip that loops repeats forever, and one that plays a set number of times (or once) stops after those plays. The dialog says so under the box, and you can tick or untick it to choose for yourself.

## Exporting a clip

Pick **One clip** in the Range row and the file follows how that clip plays ([clip direction and repeat](help:timeline-clip-play)). A clip that plays **backward** comes out backward. **Back and forth** comes out there and back as the clip says (repeat 3 is there, back, there), and a clip that plays **3 times** is in the file 3 times, so it looks the same everywhere. The same goes for a moving SVG (its timing follows the order). A **PNG sequence, PDF and Illustrator pages** are for looking at, so each frame comes out **once**, in the order the clip starts, however often it repeats. A video made this way has no sound, because the timeline's sound doesn't match the new order.
## Good to know

- Pixel art exports at big whole-number sizes with sharp edges, never blurry.
- The speed always matches your document's frames per second.`,
  'export-sprite-sheets': `A sprite sheet is one picture holding all your frames. 

Press **Ctrl+E**, pick **Sprite sheet**, then pick **where it's going**. Frameling saves the picture plus whatever that place needs, into a folder you choose.

## Where it's going

| Pick | You get | Steps |
| --- | --- | --- |
| **Godot** | Sprite frames (.tres) and a ready-to-play scene (.tscn) | [Godot](help:export-godot) |
| **Unity** | A JSON file and a small importer script that slices the sprites and makes animation clips | [Unity](help:export-unity) |
| **Phaser** | An atlas JSON and an animations JSON | [Phaser](help:export-phaser) |
| **PixiJS** | A spritesheet JSON with your animations in it | [PixiJS](help:export-pixi) |
| **Web page (CSS)** | A CSS file with a class per animation, and a page to try it | [CSS sprites](help:export-css-sprites) |
| **Any engine (JSON)** | The JSON atlas most tools read | below |
| **Just the picture** | Only the PNG | |

## Pixel art: real size

Pixel art on a sheet for an engine, a web page or JSON always goes out at **real size**: one art pixel is one pixel, so a 32 x 32 character is 32 x 32. Games scale it up sharply themselves. Nothing to pick. **Just the picture** keeps the size you choose.

## An animation, or separate sprites

- **An animation:** each **clip** (idle, run, jump...) becomes an animation with its own loop and speed. A clip that plays [backward, back and forth or a set number of times](help:timeline-clip-play) is saved that way. No clips? The whole timeline is one called **default**.
- **Separate sprites:** each frame is its own sprite, for icons, items or tiles. A **marker** on a frame names it ("coin"). Choose **All on one sheet** or **One PNG each**.
- **A frame on each artboard?** See [Exporting artboards](help:artboards-export).

## Sheet options

- **Tidy grid** puts every frame in a slot the same size. **Columns** sets how many per row (Auto makes it roughly square).
- **Packed tight** fits frames of different sizes together like a jigsaw, for the smallest picture (a *packed atlas*). Best with **Trim** on.
- **Padding** and **Edge bleed** (*extrude*) keep neighbours from bleeding into each other, and seams from showing when sprites are scaled.
- **Trim empty space:** cuts each frame down to the part you drew. Nothing shifts when it plays.
- **Power-of-two size:** rounds the sheet up to 64, 128, 256..., for older engines.
- **Store repeated frames once:** a frame the same as the one before isn't stored twice.

## Any engine (JSON)

\`frames\` says where each picture is, \`meta\` describes the sheet and \`animations\` lists each clip's frames. **Frames as a list** is a *JSON array*; **Frames by name** is a *JSON hash*.

\`\`\`
{ "frames": [ { "filename": "run_0", "frame": { "x": 1, "y": 1, "w": 32, "h": 32 },
      "trimmed": false, "spriteSourceSize": { "x": 0, "y": 0, "w": 32, "h": 32 },
      "sourceSize": { "w": 32, "h": 32 }, "duration": 83 } ],
  "meta": { "image": "hero.png", "size": { "w": 256, "h": 128 }, "fps": 12 },
  "animations": { "run": { "fps": 12, "loop": true, "frames": [0, 1, 2] } } }
\`\`\`

\`frames\` is already in the order the clip plays: a clip that plays backward or back and forth lists its frames that way, and one that plays 3 times lists them 3 times (with \`"loop": false\`). A clip that doesn't play plain forward also says what it was set to, as \`"direction": "reverse"\`, \`"pingpong"\` or \`"pingpong-reverse"\`, and \`"repeat": 3\`. They are there to read; don't apply them again.

Leave a layer out of every export by making it a [reference layer](help:reference-layers).`,
  'export-unity': `Checked in Unity 6.6 (6000.6), in a project with the **2D Sprite** package and in a new 3D project without it. Other versions are untested: the 2D Sprite package says it works with Unity 2019.4 and later, so that is the oldest to expect, but we haven't tried it.

With the 2D Sprite package (2D projects have it) the importer cuts the sprites the current way. Without it, it still compiles and cuts them the older way, so your project never gets stuck on a script error. To get the package anyway, open **Window > Package Manager > Unity Registry > 2D Sprite**.

## In Frameling

1. Press **Ctrl+E**, pick **Sprite sheet**, then the **Unity** card.
2. Pixel art goes out at real size by itself.
3. Leave **Include the importer script** ticked the first time. It adds two small files, \`FramelingSheetImporter.cs\` and \`FramelingSheetImporter.asmdef\`. A project only needs one copy of the pair, so untick it for later exports.
4. Press **Export** and choose a folder **inside your project's Assets folder**, for example \`Assets/Sprites\`.

## In Unity

1. Switch to Unity. The small script reads the \`.json\` beside your picture and cuts it into sprites. Pixel art is set to sharp (point) filtering with no compression.
2. Next to the picture you'll find an animation clip for each of your clips (\`hero_run.anim\`...), with your loop settings. Looping clips use Unity's *Loop* wrap mode and the others hold their last frame (*Clamp Forever*). Backward and back and forth clips have their sprites in that order, so they play right in an Animator, and one that plays 3 times has the sprites 3 times.
3. Drag a clip onto a sprite in your scene, and Unity sets up the Animator for you. Or open the picture's arrow to see every sprite.

Export again any time: sprites keep their identity, so scenes that use them don't break.

## Good to know

- One sprite unit is the height of a frame, so a 32 pixel character is one unit tall.
- Keep the \`.cs\` and \`.asmdef\` files together in one folder. The \`.asmdef\` is how the script knows whether the 2D Sprite package is there.
- Only keep one copy. If another \`FramelingSheetImporter.cs\` is in your project (an older one in \`Assets/Editor\`, say), Unity's Console shows a warning naming it. Delete that older file, and its \`.asmdef\` if it has one: two copies cut every sheet twice, and two \`.asmdef\` files can stop scripts compiling.
- A sheet exported as separate sprites has no clips, so you get the sprites and no animation clips.`,
  'export-phaser': `## In Frameling

Press **Ctrl+E**, pick **Sprite sheet**, then the **Phaser** card, and export into your game's assets folder. You get three files:

- \`hero.png\`: the sheet,
- \`hero.json\`: where every frame is (a JSON hash atlas),
- \`hero-anims.json\`: one animation per clip, with speed and looping. A clip that plays a number of times uses Phaser's own **repeat**. Backward and back and forth clips list their frames in that order, so each end shows once. If you would rather have Phaser's own **yoyo** (smaller data, and it plays the same) for a back and forth clip that loops or goes there and back a whole number of times, choose it in **Preferences > Behaviour**, *Back-and-forth clips in game engines*.

## In your game

\`\`\`
preload() {
  this.load.atlas('hero', 'assets/hero.png', 'assets/hero.json');
  this.load.animation('hero-anims', 'assets/hero-anims.json');
}
create() {
  const hero = this.add.sprite(200, 150, 'hero');
  hero.play('run');
}
\`\`\`

The atlas key must be the file's name (\`hero\` here), because the animations point at it.

## Pixel art

Pixel art goes out at real size. Add \`pixelArt: true\` to your game config so Phaser keeps it sharp when scaled. Use Phaser's **WebGL** renderer for pixel art (the default, \`type: Phaser.AUTO\`): it draws every frame exactly as Frameling does. Phaser's Canvas renderer can make a scaled sprite one pixel too big at the edges, and no game setting fixes that.`,
  'export-pixi': `## In Frameling

Press **Ctrl+E**, pick **Sprite sheet**, then the **PixiJS** card, and export into your project. You get \`hero.png\` and \`hero.json\`. The JSON lists every frame and an \`animations\` entry for each clip.

## In your code

\`\`\`
const sheet = await PIXI.Assets.load('assets/hero.json');
const hero = new PIXI.AnimatedSprite(sheet.animations.run);
hero.animationSpeed = 12 / 60; // your frames per second, divided by 60
hero.loop = true;
hero.play();
app.stage.addChild(hero);
\`\`\`

Frames you held for longer are listed more than once, so they play for the right time. Each clip's speed and loop setting are also in the JSON under \`meta.frameling.animations\`, if you'd rather read them than type them. A clip that plays backward or back and forth is listed in that order, and one that plays 3 times is listed 3 times with \`loop\` off (PixiJS has no repeat count).

## Pixel art

Pixel art goes out at real size. Set \`texture.source.scaleMode = 'nearest'\` (PixiJS 8) so it stays sharp when scaled.`,
  'export-css-sprites': `## In Frameling

Press **Ctrl+E**, pick **Sprite sheet**, then **Web page (CSS)**. You get:

- \`hero.png\`, the sheet,
- \`hero.css\`, with a class for every frame and for every clip,
- \`hero.html\`, a page that shows each clip playing. Open it in a browser to check, and copy from it.

## On your page

\`\`\`
<link rel="stylesheet" href="hero.css">
<div class="hero hero-run"></div>
\`\`\`

The second class picks the clip. Loops keep going; clips that don't loop stop on their last frame. A clip that plays 3 times uses CSS's own \`animation-iteration-count\`. Backward and back and forth clips list their frames in that order (CSS's \`animation-direction\` would show each end twice, or a step late). Swap the class to change clip.

## Good to know

- Animations keep every frame whole, so **Trim** is off for them.
- Pixel art gets \`image-rendering: pixelated\`, so you can make it bigger with \`zoom\` or \`transform: scale()\` and it stays sharp.
- With **Separate sprites**, each frame gets a class named after its marker (\`hero-heart\`), which makes icon sets easy.
- Two clips whose names would make the same class ("Idle" and "idle") get a number on the second one (\`hero-idle-2\`). A document name that starts with a digit gets \`sprite-\` in front, so "2D Hero" gives \`sprite-2d-hero\`.`,
  'export-svg': `**SVG drawing** exports the frame you're looking at as a picture made of shapes, not dots. It stays sharp at any size, and you can open it in other vector programs to keep working on it.

## What you get

- **Vector layers** become real paths: every brush stroke becomes one filled shape, and shapes keep their curves, fills and outlines.
- **Pixel layers** become small rectangles: one for each run of pixels in the same colour. Nothing is lost, every pixel is still there, but a big pixel drawing makes a big file.
- Each layer is its own group named after the layer, so it's easy to find in other programs. Layer opacity is kept. Hidden layers are left out.
- **Folders** are groups too, named after the folder, with the folder's layers inside (and folders inside folders as groups inside groups), even a folder that changes nothing. Other programs read the name from the group's id (spaces and symbols become dashes, and a repeated name gets an underscore). Inkscape shows the folder's own name, spelled the way you wrote it.
- **Blend modes, clipping, masks and colour wash** come across as SVG's own blend modes, masks and filters.
- **Effects** become SVG filters: Soften, Shadow, Colour adjust, Glow and Outline. Pixelate has no SVG version, so it's left out (the Export window says so first).
- **Inside symbols** the same goes for each symbol's own layers: their blend modes, effects, masks and clipping stay with every copy.
- **Size** only changes how large the picture is when it opens. You can scale it freely later.

## Good to know

- SVG is a single still. To get more frames, use [PNG sequence](help:exporting) or one SVG per frame by moving the playhead and exporting again.
- Brush strokes are exported as their finished outline, so they look right but won't be editable as brush strokes in other programs.`,
  'export-lottie': `**Lottie animation** saves a Lottie file that apps and websites play with the free Lottie players. Shapes stay shapes, so it's sharp at any size and small.

## File type

Under **File type** in the Export window:

- **Lottie (.json)**: one plain file that every Lottie player opens.
- **dotLottie (.lottie)**: a much smaller zip holding the animation and its pictures as files. Plays in the dotLottie players (LottieFiles, web, iOS, Android). Its **layout** is *Current* (default) or *Older*, for old players. Both keep the loop setting: *Current* as a tiny play script (the web player runs it when given a stateMachineId).

## What carries over

- **Drawings** become shapes: fills, outlines and line widths as they are.
- **Frame by frame:** each drawing shows for exactly the frames it's held, and one used again is stored once.
- **Symbols** become Lottie *precomps*, stored once however often they're used. Each copy keeps its place, size, turn, slant and fade.
- **In-betweens (tweens)** become keyframes with their easing. *Springy*, *Bouncy*, paths to follow and **morphs** get a few keys fitted to the motion. Sideways and falling motion is timed separately.
- **Puppets:** a bone part that only turns is one still shape with a few turn keys.
- **The camera** pans, zooms and turns (a few eased keys, not one per frame), and layers with depth move at their own speed.
- **Pixel and tile layers** become pictures inside the file, big enough to stay crisp.
- **Clips** become named markers, so a player can play one clip by name. Export one clip and it plays the way you set it, even backward, back and forth or a number of times, and the file does not grow. In a dotLottie file a clip that loops repeats, and the **Playback** tick lets you choose.
- **Text** becomes letter shapes, so no font files are needed. **Particles** become one small shape each. **Colour wash** recolours the copy's shapes.
- **Blend modes** stay as they are; **masks** and **clipping** become *track mattes*.
- **Fades:** a layer, folder or symbol copy you fade is faded as one picture, so overlapping shapes don't show through each other.
- **Effects:** Soften and Shadow become Lottie's own blur and drop shadow. Glow, Colour adjust, Outline and Pixelate have no Lottie version, so those layers become pictures. Tick **Draw Soften and Shadow as pictures** for players that skip Lottie's effects.

## Pictures from effects

Only the part an effect touches is saved. Under **Pictures from effects** in the Export window:

- **Balanced** (the default): WebP at twice the stage size. Looks like Sharpest at about half the size.
- **Sharpest**: PNG at twice the stage size. Biggest, plays everywhere.
- **Smallest**: WebP at the stage size, with edges a little soft on sharp screens.

A glow on something that moves is a new picture every frame, so put effects on layers that hold still.

## Good to know

- lottie-web's *canvas* player leaves effects out (its SVG player, the default, shows them, as do the dotLottie, iOS and Android players).`,
  'export-svg-animated': `**Moving SVG** saves the whole animation as one SVG file that plays by itself. Put it on a web page like any picture (an \`<img>\` tag works), and it stays sharp at any size.

## How it works

Every different drawing is written once and shown only on its frames. Symbol copies that glide, grow or turn are written once and moved frame by frame. The camera moves each layer the same way.

It uses **CSS animations** inside the SVG rather than SVG's own animation tags (SMIL). Both play in Chrome, Edge, Firefox and Safari, also inside an image tag, but CSS can move a symbol copy with one transform (SMIL can't turn, slant and resize together in the right order), web pages can pause it or jump to a frame with the standard animation controls, and SMIL has been close to being dropped by Chrome before.

## Options

- **Loop forever:** play round and round, or once and stop on the last frame. A clip sets it for you: a clip that plays 3 times makes a file that stops after the 3rd.
- **Transparent background** leaves the stage colour out.

## Good to know

- **Morphs (shape tweens)** are a drawing per frame, so long morphs make bigger files.
- **Blend modes, masks, clipping, colour wash and effects** carry over as in the still [SVG](help:export-svg). Effects that change over time switch once per frame. Pixelate is left out.
- Particles that draw a symbol write the symbol once and place it for every particle.
- Pixel layers become rectangles, like the still SVG, so a lot of pixel art makes a big file. A [video or animated PNG](help:export-video-gif-apng) suits that better.`,
};
