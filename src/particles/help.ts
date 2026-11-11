import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'particles',
    title: 'Particles: sparkles, smoke, rain, snow and confetti',
    section: 'Effects',
    media: 'particles.mp4',
    summary: 'Lots of little things moving by themselves: a sparkle burst, smoke, rain, snow, confetti or dust. Pick one in the Particles panel and it plays straight away.',
    keywords: ['particles', 'particle system', 'emitter', 'fx', 'sparkle', 'smoke', 'rain', 'snow', 'confetti', 'dust', 'fire', 'magic', 'burst', 'seed'],
    body: `Particles are lots of small things that move by themselves: sparks from a magic wand, smoke, rain, snow, confetti. You set how they behave once and Frameling moves every one.

## Add some

1. Open the **Particles** panel (View > Particles, or the Effects menu).
2. Click a ready-made one: **Sparkle burst**, **Smoke**, **Rain**, **Snow**, **Confetti** or **Dust**.
3. Press play. That's it.

The first time, Frameling asks whether new particles get **a layer of their own** (easiest to glow or hide) or go on the layer you picked.

## Move and resize them

With the **Select** tool, drag the box to move where they come from, stretch it to widen the rain, or turn it to aim a spray.

## Change how they behave

Select the particles, then change them in the panel. Every setting is in plain words:

| Setting | Also called | What it does |
|---|---|---|
| **How many each second** | Emission rate | New particles made every second. |
| **Burst at the start** | Burst | Particles all at once on the first frame. |
| **How long each lives** | Lifetime | Seconds before each one is gone. |
| **Speed**, **Direction**, **Spread** | Velocity, angle | How fast and which way. -90 is up, 90 is down. |
| **Gravity**, **Wind** | Forces | Pull down (or up), push right (or left). |
| **Slow down** | Drag | They lose speed as they go, like in air. |
| **Wander** | Turbulence | A gentle drift from side to side. |
| **Size**, **Colour**, **Solid** at the start and end | Over life | They change smoothly from one to the other as they age. |
| **Spin** | Angular velocity | Turns each one as it flies. |
| **Variety** | Variance | How different each one is from the next. |

Each particle can be a dot, puff, star, streak, snowflake and more, or **any symbol you made** (draw a leaf and have it fall like autumn).

## Always the same

Particles look random but come from one number, the **seed**, so scrubbing and every export show exactly the same ones. Press **Shuffle** for a new spread.

They start when their key starts on the timeline and keep going for as long as the drawing is held. Use **Stop after** to stop making new ones, and **Already going when it starts** so rain is falling from the very first frame.

## Make them glow

Particles on their own layer get everything a layer has. Try the blend mode **Glow brighter** (Add) for fire and magic, or a **Glow** effect from the [Effects panel](help:effects).`,
  },
]);
