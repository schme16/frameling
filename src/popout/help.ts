import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'canvas-popout',
    media: 'canvas-popout.mp4',
    title: 'Your drawing in a second window',
    section: 'Drawing',
    summary: 'Put your drawing big on another screen while you work on the first. It follows every stroke and plays along when you play. It only watches, so nothing there can change your drawing.',
    keywords: ['second window', 'second screen', 'second monitor', 'extra screen', 'other screen', 'preview', 'pop out', 'popout', 'picture window', 'tablet', 'drawing tablet', 'display tablet', 'external display', 'mirror', 'big picture', 'presentation', 'full screen'],
  },
  {
    id: 'stream-capture',
    media: 'stream-capture.png',
    title: 'Show only your drawing on stream (capture view)',
    section: 'Streaming',
    summary: 'A window with nothing in it but your drawing, on a flat colour, for OBS or any streaming program to capture. No title bar, no panels, and a name that does not show your file.',
    keywords: ['capture view', 'stream', 'streaming', 'streamer', 'obs', 'twitch', 'youtube', 'kick', 'window capture', 'chroma key', 'green screen', 'key colour', 'broadcast', 'clean view', 'no interface', 'hide cursor', 'pipewire', 'wayland', '1080p', 'resolution', 'record', 'screen share'],
  },
]);
