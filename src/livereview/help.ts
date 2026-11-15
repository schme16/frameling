import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'live-review',
    media: 'live-review.mp4',
    title: 'Live review: let people look, point and leave notes',
    section: 'Files',
    summary: 'Give up to four people a code. They see your drawing as you draw it, point at things, and leave notes that arrive straight with you. They cannot change anything, and it ends when you press Stop.',
    keywords: ['live review', 'review', 'feedback', 'critique', 'comments', 'notes', 'share', 'code', 'friend', 'client', 'teacher', 'watch', 'follow', 'pointer', 'cursor', 'point', 'collaborate', 'online', 'read only', 'read-only', 'join', 'reviewer', 'inbox', 'stream', 'stream safe'],
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
