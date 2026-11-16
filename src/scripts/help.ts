import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'scripts',
    order: 1,
    title: 'Scripts',
    section: 'Scripts',
    summary: 'Write a few lines of JavaScript, press Run, and Frameling does it for you. Save it and it becomes a command you can put on a key.',
    keywords: ['script', 'scripts', 'scripting', 'javascript', 'js', 'macro', 'automate', 'automation', 'code', 'write code', 'run code', 'repeat', 'batch', 'bind a key'],
    media: 'scripts.mp4',
  },
  {
    id: 'scripts-reach',
    order: 2,
    title: 'What a script can and can\'t do',
    section: 'Scripts',
    summary: 'A script can read and change the open drawing and press almost any of Frameling\'s commands. It can\'t touch files, the internet, your accounts or other scripts.',
    keywords: ['script', 'scripting', 'api', 'frameling object', 'commands', 'app.run', 'document.edit', 'what can a script do', 'limits', 'cannot'],
    media: 'scripts-reach.png',
  },
  {
    id: 'scripts-safety',
    order: 3,
    title: 'Scripts from somewhere else',
    section: 'Scripts',
    summary: 'A script you typed runs straight away. One brought in from outside, opened from a file or found inside a drawing stops and shows you what it does first.',
    keywords: ['script', 'scripting', 'safe', 'safety', 'trust', 'untrusted', 'internet', 'download', 'drawing from someone', 'virus', 'warning'],
    media: 'scripts-safety.png',
  },
]);
