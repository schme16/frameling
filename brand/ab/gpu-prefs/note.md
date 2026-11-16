# Preferences > Performance

The new page, cropped to the Preferences window, dark and light. Not an A/B of two designs: three states of one page.

- `good-dark.png`, `good-light.png`: the card is doing the drawing (Vulkan, card name, driver, memory). The harness report is a fixed example card, not this machine.
- `software-dark.png`, `software-light.png`: "Frameling is drawing in software, which is slower. Here is what to try." with the card box turned amber, the three things to try, and no card used. This is what the build machine reports inside a virtual screen.
- `pending-dark.png`, `pending-light.png`: hardware drawing was just switched off (the gpu-off file is written) and Frameling has not restarted yet, so the page says so and offers **Restart now**. The "Needs a restart" tag sits on the switch before anything is pressed.

The card name, memory and driver in the first and third are a pretend report (`__frameling.gpu.pretend`).
