import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'exporting',
    title: 'Exporting',
    section: 'Exporting',
    media: 'exporting.png',
    summary: 'Turn your drawing into a video, a GIF, pictures, an SVG or a sprite sheet.',
    keywords: ['export', 'share', 'render', 'save as video', 'gif', 'png', 'mp4', 'webm'],
    body: `Saving keeps your drawing editable. **Exporting** makes something to share or use somewhere else, and leaves your drawing as it is.

Press **Ctrl+E** (**Cmd+E** on a Mac), pick a format card, tweak the options if you like, and press **Export**. Frameling asks where to put it, then draws every frame and shows a progress bar. You can cancel any time.

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
| Put it on an Interactives page and control it there | **Interactives** |
| An app or website, as a small vector animation | **Lottie animation** |
| A web page, one file that plays by itself | **Moving SVG** |

## Options everyone shares

- **What to export:** the whole animation, one clip, or just this frame.
- **Size:** how many times bigger than your drawing. Pixel art only offers whole numbers, so every pixel stays a crisp square.
- **Transparent background:** leave the background see-through, for formats that can do that. If a format can't, the box is greyed out and says why.

## Quick repeat

**Ctrl+Shift+E** exports again with the same settings as last time, without asking questions (it still asks where to save).

Every export is drawn exactly the way you see it on the canvas, at exact frame times, so a slow computer makes the same file as a fast one, just a little later.

More: [Video, GIF and APNG](help:export-video-gif-apng), [Sprite sheets](help:export-sprite-sheets), [SVG](help:export-svg), [Lottie](help:export-lottie), [Moving SVG](help:export-svg-animated), [Interactives](help:export-interactives).`,
  },
  {
    id: 'export-video-gif-apng',
    title: 'Video, GIF and APNG',
    section: 'Exporting',
    summary: 'Which animated format to pick, and what the options do.',
    keywords: ['mp4', 'webm', 'gif', 'apng', 'video', 'loop', 'dither', 'transparent', 'h264', 'vp9', 'av1', 'codec'],
    body: `## MP4 video

Plays almost everywhere: phones, social media, slides. It can't have a see-through background, so your drawing's background colour is used (white if there isn't one). Videos need an even number of pixels, so a drawing with an odd size gets one extra row or column of background.

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

## Good to know

- Pixel art exports at big whole-number sizes with sharp edges, never blurry.
- The speed always matches your document's frames per second.`,
  },
  {
    id: 'export-sprite-sheets',
    title: 'Sprite sheets',
    section: 'Exporting',
    media: 'export-sheet.png',
    summary: 'Put every frame on one picture, with the files a game engine or web page needs to play it.',
    keywords: ['sprite', 'atlas', 'sheet', 'texture', 'game', 'json', 'trim', 'padding', 'power of two', 'packed', 'extrude', 'bleed', 'icons', 'tiles', 'texture atlas', 'json hash', 'json array'],
    body: `A sprite sheet is one picture holding all your frames. Games load that one picture and cut the frames out.

Press **Ctrl+E**, pick **Sprite sheet**, then pick **where it's going**. Frameling saves the picture plus whatever that place needs, into a folder you choose.

## Where it's going

| Pick | You get | Steps |
| --- | --- | --- |
| **Godot** | Sprite frames (.tres) and a ready-to-play scene (.tscn) | [Godot](help:export-godot) |
| **Unity** | A JSON file and a small importer script that slices the sprites and makes animation clips | [Unity](help:export-unity) |
| **Phaser** | An atlas JSON and an animations JSON | [Phaser](help:export-phaser) |
| **PixiJS** | A spritesheet JSON with your animations in it | [PixiJS](help:export-pixi) |
| **Web page (CSS)** | A CSS file with a class per animation, and a page to try it | [CSS sprites](help:export-css-sprites) |
| **Any engine (JSON)** | The common JSON atlas most tools read | below |
| **Just the picture** | Only the PNG | |

Your pick is remembered for next time.

## Pixel art: Art size

For pixel art, the **Size** row has an **Art size** button: one art pixel becomes one pixel, so a 32 x 32 character comes out 32 x 32. That's what game engines want. They scale it up on screen and keep it sharp. The first time you pick an engine for pixel art, Frameling asks whether to switch to Art size.

## An animation, or separate sprites

- **An animation:** each **clip** (idle, run, jump...) becomes an animation, with its own loop setting and speed. Frames you held for longer play for longer. No clips? The whole timeline is one animation called **default**.
- **Separate sprites:** each frame is its own sprite, for icons, items or tiles. Put a **marker** on a frame to name it ("heart", "coin"). Frames in a clip are named after the clip. Choose **All on one sheet** (an atlas of single sprites) or **One PNG each**.

## Sheet options

- **Tidy grid** puts every frame in a slot the same size. **Columns** sets how many per row (Auto makes it roughly square).
- **Packed tight** fits frames of different sizes together like a jigsaw, for the smallest picture (a *packed atlas*). Best with **Trim** on.
- **Padding:** empty pixels between frames, so neighbours never bleed into each other.
- **Edge bleed:** copies each frame's edge pixels outward (*extrude*). Stops thin lines or seams showing when the game scales or moves sprites by part of a pixel.
- **Trim empty space:** cuts each frame down to the part you drew. The data keeps where it came from, so nothing shifts when it plays.
- **Power-of-two size:** rounds the sheet up to 64, 128, 256... Some older engines and graphics cards like that.
- **Store repeated frames once:** frames that look the same as the one before aren't stored twice, and still play for the right time.

## Any engine (JSON)

The common JSON atlas: \`frames\` says where each picture is, \`meta\` describes the sheet, and \`animations\` lists each clip's frames. **Frames as a list** keeps them in order (a *JSON array*); **Frames by name** keys them by name (a *JSON hash*).

\`\`\`
{ "frames": [ { "filename": "run_0", "frame": { "x": 1, "y": 1, "w": 32, "h": 32 },
      "trimmed": false, "spriteSourceSize": { "x": 0, "y": 0, "w": 32, "h": 32 },
      "sourceSize": { "w": 32, "h": 32 }, "duration": 83 } ],
  "meta": { "image": "hero.png", "size": { "w": 256, "h": 128 }, "fps": 12 },
  "animations": { "run": { "fps": 12, "loop": true, "frames": [0, 1, 2] } } }
\`\`\`

Leave a layer out of every export by making it a [reference layer](help:reference-layers).`,
  },
  {
    id: 'export-godot',
    title: 'Using sprites in Godot',
    section: 'Exporting',
    media: 'export-godot.png',
    summary: 'Step by step: from Frameling to an animated sprite in your Godot 4 project.',
    keywords: ['godot', 'animatedsprite2d', 'spriteframes', 'tres', 'tscn', 'game engine', 'res://', 'atlastexture'],
    body: `This takes about a minute. It's written for Godot 4.

## In Frameling

1. Press **Ctrl+E**, pick **Sprite sheet**, then the **Godot** card.
2. For pixel art, pick **Art size**.
3. Leave **Also make a ready-to-play scene** ticked.
4. Check **Where the picture will live in your Godot project**. The default is \`res://sprites/<your name>.png\`. Change it if your project keeps pictures somewhere else, for example \`res://art/hero.png\`.
5. Press **Export** and choose the folder **inside your Godot project** that matches that path. For \`res://sprites/\`, that's the \`sprites\` folder in your project (make it if it doesn't exist).

## In Godot

1. Switch to Godot. It notices the new files and imports them.
2. Drag the \`.tscn\` file into your scene. That's it: it plays your first clip straight away.
3. To play another clip from a script:

\`\`\`
$AnimatedSprite2D.play("run")
\`\`\`

Every clip is there with its speed and loop setting, and held frames last as long as they do in Frameling. Pixel art scenes are set to sharp (nearest) filtering, so nothing looks blurry.

## Using the .tres yourself

Add an **AnimatedSprite2D** node, click **Sprite Frames** in the Inspector, then **Load**, and pick the \`.tres\` file. If pixel art looks blurry there, set the node's **Texture > Filter** to **Nearest**.

## Separate sprites

With **Separate sprites**, each sprite gets its own small \`.tres\` (an *AtlasTexture*). Use them anywhere Godot takes a texture: a Sprite2D, a button icon, a TextureRect.

## If Godot says a file is missing

The path you typed in Frameling has to match where the picture really is in your Godot project. Fix the path in the export dialog and export again, replacing the old files.`,
  },
  {
    id: 'export-unity',
    title: 'Using sprites in Unity',
    section: 'Exporting',
    media: 'export-unity.png',
    summary: 'Drop the files into Unity: sprites are sliced and an animation clip is made for each of your clips.',
    keywords: ['unity', 'sprite', 'slice', 'sprite editor', 'animation clip', 'anim', 'animator', 'c#', 'importer'],
    body: `Written for Unity 2021.2 or newer, with the **2D Sprite** package (2D projects have it already).

## In Frameling

1. Press **Ctrl+E**, pick **Sprite sheet**, then the **Unity** card.
2. For pixel art, pick **Art size**.
3. Leave **Include the importer script** ticked the first time. A project only needs one copy, so untick it for later exports.
4. Press **Export** and choose a folder **inside your project's Assets folder**, for example \`Assets/Sprites\`.

## In Unity

1. Switch to Unity. The small script (\`FramelingSheetImporter.cs\`) reads the \`.json\` beside your picture and cuts it into sprites. Pixel art is set to sharp (point) filtering with no compression.
2. Next to the picture you'll find an animation clip for each of your clips (\`hero_run.anim\`...), with your loop settings.
3. Drag a clip onto a sprite in your scene, and Unity sets up the Animator for you. Or open the picture's arrow to see every sprite.

Export again any time: sprites keep their identity, so scenes that use them don't break.

## Good to know

- One sprite unit is the height of a frame, so a 32 pixel character is one unit tall.
- If you already have a copy of the script, delete the extra one. Two copies stop scripts compiling.`,
  },
  {
    id: 'export-phaser',
    title: 'Using sprites in Phaser',
    section: 'Exporting',
    media: 'export-phaser.png',
    summary: 'Load the atlas and the animations JSON in Phaser 3, then play any clip by name.',
    keywords: ['phaser', 'phaser 3', 'atlas', 'anims', 'javascript', 'web game', 'load.atlas', 'load.animation'],
    body: `## In Frameling

Press **Ctrl+E**, pick **Sprite sheet**, then the **Phaser** card, and export into your game's assets folder. You get three files:

- \`hero.png\`: the sheet,
- \`hero.json\`: where every frame is (a JSON hash atlas),
- \`hero-anims.json\`: one animation per clip, with speed and looping.

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

Export at **Art size**, and add \`pixelArt: true\` to your game config so Phaser keeps it sharp when scaled.`,
  },
  {
    id: 'export-pixi',
    title: 'Using sprites in PixiJS',
    section: 'Exporting',
    media: 'export-pixi.png',
    summary: 'Load the spritesheet JSON in PixiJS and play a clip with an AnimatedSprite.',
    keywords: ['pixi', 'pixijs', 'spritesheet', 'animatedsprite', 'javascript', 'web game', 'assets.load'],
    body: `## In Frameling

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

Frames you held for longer are listed more than once, so they play for the right time. Each clip's speed and loop setting are also in the JSON under \`meta.frameling.animations\`, if you'd rather read them than type them.

## Pixel art

Export at **Art size**, and set \`texture.source.scaleMode = 'nearest'\` (PixiJS 8) so it stays sharp when scaled.`,
  },
  {
    id: 'export-css-sprites',
    title: 'Sprites on a web page (CSS)',
    section: 'Exporting',
    media: 'export-css.png',
    summary: 'Play your animation on any web page with one CSS file and a div. No scripts.',
    keywords: ['css', 'css sprites', 'web', 'html', 'keyframes', 'background-position', 'website', 'icons'],
    body: `## In Frameling

Press **Ctrl+E**, pick **Sprite sheet**, then **Web page (CSS)**. You get:

- \`hero.png\`, the sheet,
- \`hero.css\`, with a class for every frame and for every clip,
- \`hero.html\`, a page that shows each clip playing. Open it in a browser to check, and copy from it.

## On your page

\`\`\`
<link rel="stylesheet" href="hero.css">
<div class="hero hero-run"></div>
\`\`\`

The second class picks the clip. Loops keep going; clips that don't loop stop on their last frame. Swap the class to change clip.

## Good to know

- Animations keep every frame whole, so **Trim** is off for them.
- Pixel art gets \`image-rendering: pixelated\`, so you can make it bigger with \`zoom\` or \`transform: scale()\` and it stays sharp.
- With **Separate sprites**, each frame gets a class named after its marker (\`hero-heart\`), which makes icon sets easy.`,
  },
  {
    id: 'export-svg',
    title: 'SVG',
    section: 'Exporting',
    summary: 'Export the frame you are on as a vector picture that stays sharp at any size.',
    keywords: ['svg', 'vector', 'paths', 'illustrator', 'inkscape', 'scalable'],
    body: `**SVG drawing** exports the frame you're looking at as a picture made of shapes, not dots. It stays sharp at any size, and you can open it in other vector programs to keep working on it.

## What you get

- **Vector layers** become real paths: every brush stroke becomes one filled shape, and shapes keep their curves, fills and outlines.
- **Pixel layers** become small rectangles: one for each run of pixels in the same colour. Nothing is lost, every pixel is still there, but a big pixel drawing makes a big file.
- Each layer is its own group named after the layer, so it's easy to find in other programs. Layer opacity is kept. Hidden layers are left out.
- **Size** only changes how large the picture is when it opens. You can scale it freely later.

## Good to know

- SVG is a single still. To get more frames, use [PNG sequence](help:exporting) or one SVG per frame by moving the playhead and exporting again.
- Brush strokes are exported as their finished outline, so they look right but won't be editable as brush strokes in other programs.`,
  },
  {
    id: 'export-lottie',
    title: 'Lottie animation (JSON)',
    section: 'Exporting',
    media: 'export-lottie.png',
    summary: 'Export a small vector animation that apps and websites play with Lottie, sharp at any size.',
    keywords: ['lottie', 'bodymovin', 'json', 'lottie-web', 'after effects', 'app animation', 'vector animation', 'lottiefiles'],
    body: `**Lottie animation** saves your animation as a Lottie file (a \`.json\`). Apps, websites and design tools play Lottie files with the free Lottie players (lottie-web on the web, Lottie for iOS and Android). Shapes stay shapes, so it plays sharp at any size and the file is small.

## What carries over

- **Drawings** become shapes: fills, outlines and line widths as they are. Brush strokes become their finished outline.
- **Frame by frame:** each drawing shows for exactly the frames it's held.
- **Symbols** become Lottie *precomps*, so a symbol used ten times is stored once. Each copy keeps its place, size, turn, slant and fade, and plays its own animation (loop, play once or one frame).
- **In-betweens (tweens):** a symbol's moves become keyframes with their easing, so the file stays small. *Steady*, *Gentle start*, *Gentle stop*, *Gentle start and stop*, *Wind up*, *Overshoot* and your own curves are written exactly. *Springy*, *Bouncy* and paths to follow get a key on every frame.
- **Morphs (shape tweens)** become path keyframes, one per frame, so the outline changes smoothly.
- **The camera** pans, zooms and turns, and layers with depth move at their own speed.
- **Pixel and tile layers** become pictures inside the file, made big enough to stay crisp.
- **Clips** become named markers, so a player can play one clip by name. Markers come along too.

## Good to know

- **Colour wash (tint)** on symbol copies isn't carried. Lottie has no plain equivalent.
- A faded layer fades each shape on its own, so where shapes on that layer overlap they can look a touch darker than in Frameling.
- Size doesn't matter here: a Lottie player scales the animation to fit wherever it's shown.
- Frameling checks every Lottie it makes against its own drawing of the same frames (the export test renders them with lottie-web), so what you see is what plays.`,
  },
  {
    id: 'export-svg-animated',
    title: 'Moving SVG (animated SVG)',
    section: 'Exporting',
    summary: 'Export one SVG file that plays your animation by itself in any browser, even inside an image tag.',
    keywords: ['animated svg', 'svg animation', 'css animation', 'smil', 'web', 'img', 'vector animation'],
    body: `**Moving SVG** saves the whole animation as one SVG file that plays by itself. Put it on a web page like any picture (an \`<img>\` tag works), and it stays sharp at any size.

## How it works

Every different drawing is written once and shown only on its frames. Symbol copies that glide, grow or turn are written once and moved frame by frame. The camera moves each layer the same way.

It uses **CSS animations** inside the SVG rather than SVG's own animation tags (SMIL). Both play in Chrome, Edge, Firefox and Safari, also inside an image tag, but CSS can move a symbol copy with one transform (SMIL can't turn, slant and resize together in the right order), web pages can pause it or jump to a frame with the standard animation controls, and SMIL has been close to being dropped by Chrome before.

## Options

- **Loop forever:** play round and round, or once and stop on the last frame.
- **Transparent background** leaves the stage colour out.

## Good to know

- **Morphs (shape tweens)** are a drawing per frame, so long morphs make bigger files.
- **Colour wash (tint)** on symbol copies is left out, as in the still [SVG](help:export-svg).
- Pixel layers become rectangles, like the still SVG, so a lot of pixel art makes a big file. A [video or animated PNG](help:export-video-gif-apng) suits that better.`,
  },
  {
    id: 'export-interactives',
    title: 'Using animations in Interactives',
    section: 'Exporting',
    media: 'export-interactives.png',
    summary: 'Make one file to drop onto an Interactives page, then play your clips with clicks, timelines and scripts.',
    keywords: ['interactives', 'flplay', 'package', 'playable', 'course', 'web', 'layer', 'clips', 'markers', 'atlas'],
    body: `Interactives builds clickable pages for courses. A Frameling animation can live on one of those pages as its own layer, and the page can play it, stop it, or wait for a moment in it.

## In Frameling

1. Name your clips in the timeline (idle, wave, run...). Each one becomes something Interactives can play. Add **markers** for moments the page should react to (a footstep, the ball landing).
2. Press **Ctrl+E** and pick **Interactives**, or choose **File > Export for Interactives**.
3. Pick the size. Pixel art starts at **Art size**: Interactives scales it up itself and keeps every pixel sharp.
4. Press **Export** and save the \`.flplay\` file.

## In Interactives

1. Drag the \`.flplay\` file onto the canvas (or add it in **Assets** and press **Place**). It becomes a **Frameling animation** layer.
2. In the inspector, pick the **clip** to show, and whether it **plays** when the page starts.
3. To control it, use the nodes **Play a Frameling clip**, **Stop a Frameling animation** and **Show a Frameling frame**, and the events **When a Frameling clip ends** and **When a Frameling animation reaches a marker**. A timeline can also scrub its **Frameling frame**.

## What's in the file

- Every frame, with frames that look the same stored only once (a drawing held for 6 frames is one picture held for 6 frames).
- Your clips, with their loop settings, and your markers.
- The frame rate, size, and whether it is pixel art.
- Your editable drawing too, unless you untick **Include the editable drawing**. Leave it in if you might change the animation later; take it out for the smallest file.

## Good to know

- Transparent background is on to start with, so the page shows through. Turn it off to keep your background colour.
- [Reference layers](help:reference-layers) are left out, like every export.
- Change the animation? Export again with **Ctrl+Shift+E** and replace the file in Interactives' Assets. Layers using it keep their settings.

Interactives' own help has more: search it for **Frameling animations**.`,
  },
]);
