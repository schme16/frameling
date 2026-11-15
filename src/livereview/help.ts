import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'live-review',
    media: 'live-review.mp4',
    title: 'Live review: let people look, point and leave notes',
    section: 'Files',
    summary: 'Give up to four people a code. They see your drawing as you draw it, point at things, and leave notes that arrive straight with you. They cannot change anything, and it ends when you press Stop.',
    keywords: ['add comments as they come', 'show me first', 'live review', 'review', 'feedback', 'critique', 'comments', 'notes', 'share', 'code', 'friend', 'client', 'teacher', 'watch', 'follow', 'pointer', 'cursor', 'point', 'collaborate', 'online', 'read only', 'read-only', 'join', 'reviewer', 'inbox', 'stream', 'stream safe'],
  },
  {
    id: 'review-ended',
    media: 'review-ended.png',
    title: 'A review that has ended, and saving the picture',
    section: 'Files',
    summary: 'When the person you were reviewing for stops, your window says so across the top and goes grey and still. Save the last picture they sent as a PNG, live or after it ends.',
    keywords: ['live review', 'review', 'ended', 'over', 'stopped', 'last picture', 'final picture', 'save picture', 'save image', 'png', 'reviewer', 'export', 'removed', 'save my comments'],
  },
  {
    id: 'review-link',
    media: 'review-link.mp4',
    title: 'Send a live review as a link',
    section: 'Files',
    summary: 'Copy one link for your live review. Whoever opens it gets Frameling, is asked whether to join, and waits for you to let them in. The four word code still works.',
    keywords: ['live review', 'review', 'link', 'url', 'frameling://', 'invite', 'join', 'copy', 'share', 'open', 'browser', 'chat', 'code', 'register', 'handler', 'protocol', 'default app'],
  },
]);
