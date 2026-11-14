Clip flow with inputs and checks.

- panel-dark / panel-light: A is the Clip flow panel on development, B is this branch with the hero's flow rebuilt to use inputs (speed, grounded, health), an Any clip box and checks on arrows.
- arrow-dark / arrow-light: one arrow selected, showing As soon as, a check (speed is above 0.5) and a fade of 0.2 seconds.
- switching-clips-dark / switching-clips-light: H.264 clips of Try it. Speed goes up and idle becomes run, jump goes out when grounded is on, speed drops back to idle, a hit plays hurt from any clip, and health at 0 plays die.

Made with scripts/docs/ab-flow-inputs/flow.cjs (the command is at the top of the file) and `npm run help:media -- --only clip-flow-inputs`.
