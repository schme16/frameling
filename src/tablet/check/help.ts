// Help for Quill's pen check.
import { registerHelpTopics } from '../../core/registry';

registerHelpTopics([
  {
    id: 'pen-check',
    order: 10,
    title: 'Check my pen with Quill',
    section: 'Drawing',
    media: 'pen-check.png',
    summary: 'Quill walks you through hovering, pressing, leaning and the buttons, then saves a report file of what Frameling saw.',
    keywords: ['pen', 'tablet', 'diagnostics', 'report', 'test', 'huion', 'wacom', 'check', 'stylus', 'express keys', 'sample rate'],
  },
  {
    id: 'linux-install',
    order: 20,
    title: 'Installing on Linux',
    section: 'Getting started',
    media: 'installing-on-linux.png',
    summary: 'Getting the Linux download running on Ubuntu, Zorin OS and friends, and getting a pen or Huion tablet to work.',
    keywords: ['linux', 'ubuntu', 'zorin', 'appimage', 'fuse', 'libfuse2', 'sandbox', 'apparmor', 'wayland', 'x11', 'xwayland', 'huion', 'tablet', 'wacom', 'install', 'safety layer', 'gnome'],
  },
]);
