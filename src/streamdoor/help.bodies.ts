// The words of the topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'actions-door': `Streamer.bot, Firebot and a Stream Deck already hear from Twitch, YouTube and Kick: Channel Points, chat commands, subs. They can also send a message to a program on your own computer. The **actions door** is where that message lands. Frameling never signs in to anything.

**It opens with audience features.** Switch them on in **Preferences > Features > Audience features**. The red **On air** pill appears and the door opens. **Stop** (or **Ctrl+Alt+K**) shuts it at once. To remove the door altogether, turn off **Actions door** in the same list.

**Where it is.** Only on your own computer, at \`http://127.0.0.1:47213\`. Nobody on your network and no web page can reach it. If another program has that port, Frameling asks once whether to use the next free one or stay closed, and always shows the address it got. You can pick another port in **Preferences > Features**.

**The key.** Every request carries a key, so only your tools can use the door. It is under **Actions door** in **Preferences > Features**, hidden. **Show** reveals it for a few seconds, **Copy** copies it without showing it. With stream-safe mode on it can only be copied. If it was ever seen on a stream, press **Make a new one**: the old key stops working at once.

## Streamer.bot
In an action, add the sub-action **Fetch URL** (it sits under Network), and fill in:
- **URL:** \`http://127.0.0.1:47213/v1/actions/door.message\`
- **Method:** POST
- **Header:** \`Authorization\` with the value \`Bearer \` and then your key
- **Body:** \`{"text":"Thanks for the follow!"}\`

Streamer.bot on Linux is still experimental. On Windows it is the usual choice.

## Firebot
Add the effect **HTTP Request** to an event or a Channel Points reward, with the same four things. Firebot has native Linux builds, so it runs happily beside Frameling here.

## A Stream Deck, or anything else
Anything that can send an HTTP request works: a Stream Deck plugin, Touch Portal, a script. Same four things.

What you can ask for, and what comes back, is in [The actions door: what it can do](help:actions-door-reference).

See also [Audience features and the On air pill](help:audience).`,
  'actions-door-reference': `Everything the actions door does, for when you are setting up a tool. The address is \`http://127.0.0.1:47213\` (or the one Frameling shows), and every request sends \`Authorization: Bearer <your key>\`. Setting up is in [The actions door](help:actions-door).

## What is on offer
\`GET /v1/actions\` lists each action: its **id**, what it is called, its **kind**, its **cooldown** in milliseconds, and whether it touches your drawing. It lists only what would work right now.

## Running one
\`POST /v1/actions/<id>\`, with the details (if it needs any) as JSON in the body. These come with the door, and none touch your drawing:
- \`door.message\`: shows a short message on screen. Body \`{"text":"hello"}\`, up to 80 letters.
- \`door.zoom\`: zooms the view. Body \`{"direction":"in"}\` or \`{"direction":"out"}\`.
- \`door.fit-view\`: fits the drawing in the window. No body.
- \`quill.cheer\`, \`quill.hop\`, \`quill.snack\`, \`quill.nuzzle\`, \`quill.wave\`: Quill reacts on your screen. No body. See [Quill reacts to your audience](help:quill-reacts).
- \`quill.sign\`: Quill holds up a sign, once you say yes. Body \`{"text":"hello"}\`, cut to 60 plain characters.
- \`jar.add\`: drops a prompt in your private prompt jar. Body \`{"text":"a frog in a teacup"}\`, cut to 80 plain characters. It never shows on screen: only you pull one out. See [The prompt jar](help:prompt-jar).
- \`vote.cast\`: one vote in the vote you started. Body \`{"option":2,"voter":"12345678"}\`. Only counted, never acted on, and not held back by the cooldowns. See [Votes](help:votes).

## What comes back
Frameling always says what happened, as JSON with a **reason** your tool can act on:
- \`"outcome":"ran"\` (200): it happened.
- \`"outcome":"queued"\` (202): waiting its turn, with its \`position\`.
- \`"reason":"cooldown"\` (429): too soon after one of its kind. \`retryInMs\` says how long.
- \`"reason":"queue-full"\` (429): too many are waiting.
- \`"reason":"unknown"\` (404): no such action.
- \`"reason":"unavailable"\` (403): you have that switched off.
- \`"reason":"invalid"\` (400): the details made no sense.
- \`"reason":"off"\` (503): audience features are off.
- \`"reason":"unauthorized"\` (401): the key is missing or wrong.
- \`"reason":"origin-refused"\` (403): the request came from a web page, which is never allowed.

Everything goes through the same limits as the rest of your audience: a cooldown for each kind, a limit on how often, and a short queue. Nothing about who asked is kept.`,
};
