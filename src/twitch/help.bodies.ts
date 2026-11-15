// The words of the topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  twitch: `**Connect Twitch** lets your channel make things happen in Frameling: a channel point reward makes Quill cheer, a raid makes him wave, a cheer sets off a dare. It talks to Twitch directly, so you don't need Streamer.bot or Firebot, and nothing runs on anyone's server. (If you already use one of those, [the actions door](help:actions-door) still works beside this.)

**Connect:** open Preferences > Streaming > **Twitch**, tick what you want to hear about, and press **Connect Twitch**. Frameling shows a short code. Press **Open Twitch**, sign in there if you need to, and approve it. Frameling picks the sign-in up by itself. If you'd rather use your own phone, **Copy the link** and paste it anywhere.

**It starts listening when you switch audience features on,** and stops when you switch them off or press **Stop**. Connecting on its own never listens. Everything Twitch tells Frameling goes through the same gate as every other audience action, so your switches, cooldowns, queue and Stop all apply, and nothing can reach your drawing unless you've allowed it.

## What each permission is for
Frameling asks only for what you ticked:
- **Channel point rewards:** hears a redemption and reads the names of your rewards, so you can pick one. It can't change or refund them.
- **Cheers:** hears a cheer and how many bits.
- **Follows:** hears a new follow.
- **Subs:** hears a sub, a resub or a gifted sub.
- **Raids:** needs no permission. Raids are public.

Tick another one later and Frameling asks for just that.

## While you stream
**Stream-safe mode never draws the code, the link or your sign-in.** The code is a way into your Twitch account, so with it on the screen shows only that a code is waiting, and you choose **Open Twitch** or **Copy the link**. Mind the browser window it opens: it isn't covered by Stream-safe mode, so approve on a screen you aren't sharing.

## Your privacy
Frameling never reads a viewer's name, id or chat. Each event is cut down to what a link needs (which reward, how many bits) the moment it arrives. In memory, while it listens: your sign-in, the ids of the last 200 events (to ignore repeats), and your reward names. Nothing about viewers is saved. The sign-in is kept encrypted by your computer's key store, or only until you close Frameling if it has none.

## Disconnect
**Disconnect from Twitch** stops listening, tells Twitch to cancel the sign-in, and forgets it here. You can double check at twitch.tv/settings/connections.

Next: [Twitch links](help:twitch-links). See also [Audience features and the pill](help:audience).`,
  'twitch-links': `A **link** says "when this happens on Twitch, do that in Frameling". Make them in Preferences > Streaming > **Twitch**. The list starts with a few small Quill reactions if you said yes when asked, and you can change or delete any of them.

**Add a link:** press **Add a link**, then pick the event, a filter if it has one, and the action. The actions are the ones Frameling can do for your audience right now: Quill reactions, dares, a message, a prompt in the jar and so on. Ones that reach your drawing are marked, and only run while **Let the audience interrupt your drawing** is on.

**Filters:** a reward link can be for one reward you made, or any. A cheer or a raid link can need a minimum, so only 500 bits or more makes the big dare happen.

**Words:** an action that takes words (a message, a sign, a prompt) gets a box. Type fixed words, or for a reward that asks the viewer to type something, tick **Use what the viewer typed**. The action cleans them first, and Frameling doesn't keep them.

**Try it** runs a link through the gate with a pretend event, so you can see it before you go live.

## Good to know
- Frameling can't refund channel points. If a cooldown or the queue turns a redemption away, the viewer has still spent their points. Give the reward its own cooldown on Twitch that is longer than Frameling's, or set **When your limits turn a Twitch event away** in Preferences > Streaming to tell you each time.
- Channel points need an Affiliate or Partner channel. Cheers, follows, subs and raids don't.
- Twitch ends a sign-in that is not used for about a month. Then you connect again.

Back to [Connect Twitch](help:twitch).`,
};
