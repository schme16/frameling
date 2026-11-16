// The words of the topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  votes: `A **vote** asks your audience a question, like *which colour next?*, and counts the answers while you draw. When it ends you see who won. Then it's up to you: **Frameling only counts. It never does anything because of a vote.** If chat picks blue, you pick blue (or don't).

## Run one
1. Open **Streaming > Votes > Start a vote** (**Ctrl+Alt+Y**). Write the question, give it two to six options, and pick how long it runs.
2. **Start the vote.** A panel shows the options with bars that grow as votes come in, and a clock if you gave it a time.
3. **End the vote** (**Ctrl+Alt+Shift+Y**) when you like, or let the clock do it. The panel shows the winner, or says it's a tie, or that nobody voted.
4. **Close** puts it all away.

Starting a vote turns audience features on, so the yellow **Audience participation: on** pill appears. **Stop** (**Ctrl+Alt+K**) drops a vote that's going.

## Getting the votes in
Your stream tool (Streamer.bot, Firebot, a Stream Deck) sends each vote to the [actions door](help:actions-door). To let viewers type **!vote 2** in chat, follow [Chat commands](help:chat-commands). The address and body:
- **URL:** \`http://127.0.0.1:47213/v1/actions/vote.cast\`
- **Body:** \`{"option":2,"voter":"%userId%"}\`

\`option\` is the place of the option (1 is the first) or its words, like \`"blue"\`. \`voter\` is who's voting.

## One vote each
Frameling can't see your chat, so it can only keep to one vote each if your tool tells it who is voting. Send the viewer's **user id** (a number, not their name). Frameling mixes it with a secret made fresh for this vote and keeps only the mixed result, never the id. When the vote ends, the secret and every mixed result are thrown away, and the next vote can't be matched to this one.

If a vote has no voter id, Frameling turns it away and tells you how many. You can change that in **Preferences > Streaming**: **A vote that comes with no voter id** can count them anyway, and then your tool has to make sure nobody sends two. **When someone votes twice** keeps the first vote or lets people change their mind.

## What it keeps
- No names, ever. Nothing is written to your drawing, a file or the log.
- While a vote runs, the counts and those mixed results sit in memory.
- When it ends, only the question, the options and the counts stay, so you can read them.
- **Close** forgets those too. The only thing remembered between runs is how long you last let a vote run.

**Good to know:** a vote for an option that doesn't exist is turned away, and so is a vote when none is going. Up to 5000 people can vote in one.

See also [Audience features and the pill](help:audience).`,
};
