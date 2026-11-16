import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'stream-safe',
    media: 'stream-safe.png',
    title: 'Stream-safe mode',
    section: 'Streaming',
    summary: 'One switch for when you share your screen or stream: file paths, your name and keys show as friendly stand-ins.',
    keywords: ['stream', 'streaming', 'streamer', 'twitch', 'privacy', 'private', 'hide', 'paths', 'share screen', 'obs', 'recording', 'name', 'safe'],
  },
  {
    id: 'obs-golive',
    media: 'obs-golive.png',
    title: 'Going live with OBS',
    section: 'Streaming',
    summary: 'Frameling watches OBS and turns Stream-safe on by itself when you start streaming or recording, then asks before turning it off. Off until you switch it on.',
    keywords: ['obs', 'obs studio', 'websocket', 'web socket', 'go live', 'going live', 'stream', 'streaming', 'streamer', 'twitch', 'youtube', 'kick', 'record', 'recording', 'automatic', 'password', 'port', '4455', 'stream-safe', 'connect'],
  },
]);
