import type { HelpTopic } from '../core/registry';

export const twitchHelp: HelpTopic[] = [
  {
    id: 'twitch',
    title: 'Connect Twitch',
    section: 'Settings',
    media: 'twitch.png',
    summary: 'Sign in to Twitch with a short code, so channel point rewards, cheers, follows, subs and raids can make Quill and your audience tools react. No other program needed.',
    keywords: ['twitch', 'connect', 'sign in', 'login', 'device code', 'code', 'eventsub', 'channel points', 'bits', 'cheer', 'follow', 'sub', 'raid', 'scopes', 'permissions', 'disconnect', 'revoke', 'privacy', 'streamer.bot', 'firebot', 'stream', 'audience', 'token'],
    order: 22,
  },
  {
    id: 'twitch-links',
    title: 'Twitch links: what each event does',
    section: 'Settings',
    media: 'twitch-links.png',
    summary: 'Choose which Twitch event makes which audience action happen, with a filter, some words if the action takes them, and a Try it button.',
    keywords: ['twitch', 'links', 'mapping', 'map', 'rules', 'reward', 'channel points', 'cheer', 'bits', 'raid', 'follow', 'sub', 'action', 'quill', 'dare', 'prompt', 'refund', 'cooldown'],
    order: 23,
  },
];
