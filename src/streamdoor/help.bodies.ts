// The words of the topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'chat-commands': `Frameling never reads your chat, on purpose. So when a viewer types **!vote 2**, a small program on your computer has to read it and pass it to Frameling's [actions door](help:actions-door). Channel Points and cheers work without this, once [Twitch is connected](help:twitch). **Votes, guesses and typed prompts need it.** The whole route in order is in [Getting your viewers taking part](help:viewers-take-part).

**Pick the program.** On Linux, use **Firebot**: it runs natively and sends the request with no code ([Firebot setup](help:chat-commands-firebot)). Streamer.bot on Linux runs through Wine, which its makers call experimental, and it needs a little C# to send anything ([Streamer.bot setup](help:chat-commands-streamerbot)). On Windows both are fine, and Streamer.bot also reads YouTube and Kick.

## Before you start
1. **Same computer.** The door only answers the machine Frameling runs on.
2. **Audience features on**, in **Preferences > Streaming**. The yellow **Audience participation: on** pill shows. Off, nothing is listening.
3. **A vote or round running**: **Streaming > Votes**, **Streaming > Guess the drawing**. With nothing to join, a vote or guess is turned away.
4. **The address and key**, under **Actions door** in the same place. **Copy** copies the key without showing it.

## What your program sends
Each chat command becomes one **POST** to the address plus an action name, with the header \`Authorization: Bearer <your key>\` and a JSON body. The key goes in the header, never in the address.
- **!vote 2** or **!vote blue** goes to \`/v1/actions/vote.cast\` with \`{"option":"2","voter":"<user id>"}\`.
- **!guess a cat** goes to \`/v1/actions/guess.send\` with \`{"guess":"a cat","player":"<user id>","name":"<name>"}\`.
- **!prompt a frog in a teacup** goes to \`/v1/actions/jar.add\` with \`{"text":"a frog in a teacup"}\`.

The **user id** is the number Twitch gives each person, not their name. It is how Frameling counts one vote each without keeping who it was.

## Test the door first
In **Preferences > Streaming > Actions door**, press **Copy a test command**, then paste it into a terminal. It already has your address and key, and it only asks the door for its list, so nothing changes:
\`\`\`
curl -H "Authorization: Bearer <your key>" http://127.0.0.1:47213/v1/actions
\`\`\`
A list of actions means the door works, and any trouble left is in the chat program. Keep that command off the stream, because it holds your key.

## When it doesn't work
- **Could not connect:** Frameling isn't open, audience features are off, or the port moved. Check the address in Preferences.
- **401:** the key is wrong, or you made a new one. Copy it again.
- **403:** the request came from a web page (a browser source can't call the door), or used a name other than \`127.0.0.1\` or \`localhost\`.
- **400 \`invalid\`:** the answer says why in \`detail\` and has a \`say\` sentence for chat, like "No vote is running right now." The list is in [what it can do](help:actions-door-reference).
- **400 \`bad-request\`:** the body isn't JSON, usually a quote mark someone typed. Both setups here guard against it.
- **429:** too soon. Wait the **Retry-After** seconds. Prompts take one every 3 seconds across the whole channel, which you can change in **Preferences > Streaming**.
- **503:** the drawing window isn't open.`,
  'chat-commands-firebot': `Firebot reads your Twitch chat and has an **HTTP Request** effect that sends exactly what the door needs, with no code. It has Linux builds (.deb, .rpm and .tar.gz) on its [releases page](https://github.com/crowbartools/Firebot/releases). Read [Chat commands](help:chat-commands) first if you haven't.

## The quick way: import the setup file
Frameling can write all three commands for Firebot in one file.
1. In Frameling, open **Preferences > Streaming**, find **Firebot setup file** under **Actions door** and press **Save setup file**. (Or search the palette for "Firebot setup".)
2. In Firebot, connect your Twitch account, then open Firebot's **File** menu, choose **Firebot Setups**, then **Import Firebot Setup**, and pick the file.
3. Firebot asks two **Import Questions**. **Frameling address** is already filled in. For **Frameling key**, go back to Frameling, press **Copy** beside **Key (token)**, and paste it in. Press **Import Setup**.
4. Start a vote, type **!vote 1** in your chat, and watch the panel.

**The file does not hold your key**, so it is safe to keep or share. Firebot puts the key into the three commands when you import. If you make a new key in Frameling, import the file again and paste the new one. It replaces the three commands, it doesn't add copies. If Frameling moved to another port, fix the address when Firebot asks.

## By hand instead
Make a command for each: on the **Commands** tab press **New Custom Command**, switch on **Advanced Mode**, set the **Trigger**, then press **Add Effect**, choose **HTTP Request** and set the method to **POST**, a header \`Authorization\` with the value \`Bearer \` and your key, and the URL and body below. Frameling already counts one vote each, so leave the cooldowns at 0.

**!vote**, URL ending \`/vote.cast\`:
\`\`\`
{"option": $convertToJSON[$arg[1]], "voter": $convertToJSON[$userId]}
\`\`\`
**!guess**, URL ending \`/guess.send\`:
\`\`\`
{"guess": $convertToJSON[$arg[all]], "player": $convertToJSON[$userId], "name": $convertToJSON[$userDisplayName]}
\`\`\`
**!prompt**, URL ending \`/jar.add\`, with a **global cooldown** of 3 seconds, the same as Frameling's, and a **per-user cooldown** of 30 seconds if you like (only the chat program knows who typed, so that part is its job):
\`\`\`
{"text": $convertToJSON[$arg[all]]}
\`\`\`
The whole URL is the address, then \`/v1/actions/\`, then that ending, for example \`http://127.0.0.1:47213/v1/actions/vote.cast\`. \`$arg[1]\` is the first word after the command and \`$userId\` is who typed it. \`$convertToJSON\` adds the quote marks and escapes anything odd, so what a viewer types can't break the request or add fields of its own. Don't add quote marks round it.

## Good to know
- To tell a viewer their prompt wasn't taken, tick **Run effects on error** in the HTTP Request effect and add a **Chat** effect there. A cooldown and a refusal both land in it. Frameling's answer has a \`say\` sentence ready for chat, but we couldn't confirm Firebot can read it there, so keep the message general.
- Firebot and Frameling have to be on the same computer.
- Checked against Firebot v5.67.0, November 2026.`,
  'chat-commands-streamerbot': `Streamer.bot reads chat, but its built-in **Fetch URL** only does GET, and the door needs POST. So sending is a few lines of C#, pasted once for all three commands. Read [Chat commands](help:chat-commands) first if you haven't.

**On Linux** Streamer.bot runs through Wine, and its makers call that experimental and not officially supported. Their install page asks for Wine 11.9 or newer with winetricks \`dotnet48\` and \`d3dcompiler_47\`, and offers an install script, Bottles or Lutris. If that is more than you want, [Firebot](help:chat-commands-firebot) does the same without it.

## Set it up
1. **Commands:** right-click, **Add**. Command text \`!vote\`, Location **Start**. Add \`!guess\` and \`!prompt\` as two more commands the same way. Cooldowns 0, except 3 seconds global on **!prompt**.
2. **Actions:** add an action called **Frameling chat**. Give it the trigger **Command Triggered** (under Core, then Commands), and pick all three commands.
3. Add the sub-action **Execute C# Code** (under Core, then C# Code), paste this, put your key between the quotes, and compile:
\`\`\`
using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    // Paste your key between the quotes (Preferences > Streaming > Actions door > Copy).
    const string Key = "PASTE-THE-KEY-HERE";
    // The address Frameling shows there. Change the port if it moved.
    const string Address = "http://127.0.0.1:47213";

    static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };

    public bool Execute()
    {
        string command, said, userId, name;
        CPH.TryGetArg("command", out command);
        CPH.TryGetArg("rawInput", out said);
        CPH.TryGetArg("userId", out userId);
        CPH.TryGetArg("user", out name);
        said = (said ?? "").Trim();
        string who = name ?? "";

        string action;
        object body;
        switch ((command ?? "").TrimStart('!').ToLowerInvariant())
        {
            case "vote":
                action = "vote.cast";
                body = new { option = said.Split(' ')[0], voter = userId };
                break;
            case "guess":
                action = "guess.send";
                body = new { guess = said, player = userId, name = who };
                break;
            case "prompt":
                action = "jar.add";
                body = new { text = said };
                break;
            default:
                CPH.LogWarn("Frameling: no idea what to do with the command " + command);
                return false;
        }

        try
        {
            var req = new HttpRequestMessage(HttpMethod.Post, Address + "/v1/actions/" + action);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Key);
            req.Content = new StringContent(JsonConvert.SerializeObject(body), Encoding.UTF8, "application/json");
            var res = Http.SendAsync(req).GetAwaiter().GetResult();
            int code = (int)res.StatusCode;
            if (code == 200 || code == 202) return true;

            var answer = JObject.Parse(res.Content.ReadAsStringAsync().GetAwaiter().GetResult());
            string reason = (string)answer["reason"];
            string say = (string)answer["say"];
            if (!string.IsNullOrEmpty(say) && (reason == "invalid" || reason == "cooldown"))
                CPH.SendMessage("@" + who + " " + say);
            else if (reason != "invalid" && reason != "cooldown")
                CPH.LogWarn("Frameling said " + code + " " + reason);
        }
        catch (Exception e)
        {
            CPH.LogWarn("Frameling door: " + e.Message);
        }
        return true;
    }
}
\`\`\`
4. Start a vote, type **!vote 1** in your chat, and watch the panel.

## Good to know
- It reads \`command\`, \`rawInput\`, \`userId\` and \`user\`, which Streamer.bot sets when a chat command fires. The body is built with a JSON library, so a quote mark in chat can't break it.
- If the editor can't find System.Net.Http or Newtonsoft.Json, add them on its References tab.
- A wrong key, a shut door or Frameling being closed show up in Streamer.bot's log as a Frameling warning, and stay quiet in chat. A refused vote, guess or prompt answers the viewer with Frameling's own sentence, like "No vote is running right now." Delete the \`SendMessage\` line if you would rather chat stayed quiet.
- Made a new key in Frameling? Paste it into the code.
- Streamer.bot and Frameling have to be on the same computer.
- Checked against Streamer.bot v1.0.7, August 2026.`,
  'actions-door': `Streamer.bot, Firebot and a Stream Deck already hear from Twitch, YouTube and Kick: Channel Points, chat commands, subs. They can also send a message to a program on your own computer. The **actions door** is where that message lands. The door itself never signs in to anything, and it is how chat reaches Frameling, since Frameling never reads chat. New to all this? Start with [Getting your viewers taking part](help:viewers-take-part).

**It opens with audience features.** Switch them on in **Preferences > Streaming > Audience features**. The yellow **Audience participation: on** pill appears and the door opens. **Stop** (or **Ctrl+Alt+K**) shuts it at once. To remove the door altogether, turn off **Actions door** in the same list.

**Where it is.** Only on your own computer, at \`http://127.0.0.1:47213\`. Nobody on your network and no web page can reach it. If another program has that port, Frameling asks once whether to use the next free one or stay closed, and always shows the address it got. You can pick another port in **Preferences > Streaming**.

**The key.** Every request carries a key, so only your tools can use the door. It is under **Actions door** in **Preferences > Streaming**, hidden. **Show** reveals it for a few seconds, **Copy** copies it without showing it. With stream-safe mode on it can only be copied. If it was ever seen on a stream, press **Make a new one**: the old key stops working at once.

## Streamer.bot and Firebot
Both can call the door, and both can read chat, which is what lets viewers vote, guess and suggest prompts by typing. The step-by-step is in [Chat commands](help:chat-commands). The short version of what to send:
- **URL:** \`http://127.0.0.1:47213/v1/actions/door.message\`
- **Method:** POST
- **Header:** \`Authorization\` with the value \`Bearer \` and then your key
- **Body:** \`{"text":"Thanks for the follow!"}\`

**Firebot** has an **HTTP Request** effect with exactly those boxes, and native Linux builds, so it is the easy match for Frameling here ([Firebot setup](help:chat-commands-firebot)). **Streamer.bot**'s **Fetch URL** only does GET, so sending to the door takes a few lines of C# ([Streamer.bot setup](help:chat-commands-streamerbot)). Streamer.bot on Linux runs through Wine and is still experimental. On Windows it is the usual choice.

## A Stream Deck, or anything else
Anything that can send an HTTP request with a header and a body works: a Stream Deck plugin, Touch Portal, a script. Same four things.

What you can ask for, and what comes back, is in [The actions door: what it can do](help:actions-door-reference).

See also [Audience features and the pill](help:audience).`,
  'actions-door-reference': `Everything the actions door does, for when you are setting up a tool. The address is \`http://127.0.0.1:47213\` (or the one Frameling shows), and every request sends \`Authorization: Bearer <your key>\`. Setting up is in [The actions door](help:actions-door).

## What is on offer
\`GET /v1/actions\` lists each action: its **id**, what it is called, its **kind**, its **cooldown** in milliseconds, whether it touches your drawing, and whether it is **ready**. A vote or guess is not ready until you start one. It lists only what would work right now.

## Running one
\`POST /v1/actions/<id>\`, with the details (if it needs any) as JSON in the body. These come with the door, and none touch your drawing:
- \`door.message\`: shows a short message on screen, covered until you press **Read it**. Body \`{"text":"hello"}\`, up to 80 letters.
- \`door.zoom\`: zooms the view. Body \`{"direction":"in"}\` or \`{"direction":"out"}\`.
- \`door.fit-view\`: fits the drawing in the window. No body.
- \`quill.cheer\`, \`quill.hop\`, \`quill.snack\`, \`quill.nuzzle\`, \`quill.wave\`: Quill reacts on your screen. No body. See [Quill reacts to your audience](help:quill-reacts).
- \`quill.sign\`: Quill holds up a sign, once you say yes. Body \`{"text":"hello"}\`, cut to 60 plain characters.
- \`jar.add\`: drops a prompt in your private prompt jar. Body \`{"text":"a frog in a teacup"}\`, cut to 80 plain characters. It never shows on screen: only you pull one out. Taken at most one every few seconds across the whole channel (you choose how many). See [The prompt jar](help:prompt-jar).
- \`vote.cast\`: one vote in the vote you started. Body \`{"option":2,"voter":"12345678"}\`. Only counted, never acted on, and not held back by the cooldowns. See [Votes](help:votes).
- \`guess.send\`: one guess in the guessing game you started. Body \`{"guess":"a cat","player":"12345678"}\`. Frameling never says whether it was right, and not held back by the cooldowns. See [Guess the drawing](help:guess).

## What comes back
Frameling always says what happened, as JSON with a **reason** your tool can act on. Every refusal also has **say**, one plain sentence a bot can repeat to chat, like "No vote is running right now." Older tools that only read the status or the reason keep working.
- \`"outcome":"ran"\` (200): it happened.
- \`"outcome":"queued"\` (202): waiting its turn, with its \`position\`.
- \`"reason":"cooldown"\` (429): too soon after one of its kind. \`retryInMs\` says how long.
- \`"reason":"queue-full"\` (429): too many are waiting.
- \`"reason":"unknown"\` (404): no such action.
- \`"reason":"unavailable"\` (403): you have that switched off.
- \`"reason":"invalid"\` (400): the details made no sense. \`detail\` says why when Frameling knows: \`closed\`, \`no-option\`, \`no-voter\`, \`no-player\`, \`no-guess\`, \`no-prompt\`, \`again\` or \`full\`.
- \`"reason":"off"\` (503): audience features are off.
- \`"reason":"unauthorized"\` (401): the key is missing or wrong.
- \`"reason":"origin-refused"\` (403): the request came from a web page, which is never allowed.

Everything goes through the same limits as the rest of your audience: a cooldown for each kind, a limit on how often, and a short queue. Nothing about who asked is kept.`,
};
