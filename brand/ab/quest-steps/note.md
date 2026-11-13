# Quest steps: a card when you finish one, and a way back

- **card-dark / card-light**: when a step is ticked off, a Great work card says what you just did and waits for
  **Next**, instead of the old cheer that flashed past while the next step was already up.
- **back-dark / back-light**: every step after the first has **Back**. The step you land on counts as not done, and
  it waits for you to really do it again rather than ticking itself off because what it asks for is still true.

Steps can carry their own words (`did` on a quest step). Until they all have them, the card counts the step off.
